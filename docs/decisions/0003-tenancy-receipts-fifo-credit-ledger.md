# ADR-0003: Tenancy receipts, FIFO allocation, and credit ledger

- Status: Proposed (Architecture + Security contract complete; pending Lead acceptance)
- Date: 2026-07-30
- Owners: Architecture + Security
- Task: `P6-004`

## Context

The current payment path confirms one `Payment` against one `Invoice`. Manual
`prepaidAmount` entered during settlement creates `TenantAccountEntry` records
owned by the representative tenant. This cannot support a traceable sequence of
daily receipts, allocation across old debts, tenancy-owned credit, reliable
void, or whole-room credit transfer.

P6-004 requires one receipt to pay multiple outstanding invoices in FIFO order,
carry the remainder as tenancy credit, apply that credit to a later settlement,
and reverse an incorrect receipt without deleting history. Cash collection must
be counted once, when received, rather than again when credit is later applied.

## Decision

### Financial sources of truth

Each financial fact has one authoritative append-only source:

- `Payment` is the receipt header and the only source for cash received. A new
  P6-004 receipt is one confirmed Payment linked to `propertyId`, `roomId`, and
  `tenancyId`. `payerTenantId` is optional information about who handed over the
  money; it does not own the credit.
- `PaymentAllocation` is the only source for the amount of a confirmed Payment
  applied to an Invoice. One Payment may have many allocations. Invoice
  `paidAmount`, `outstandingAmount`, and status are maintained projections that
  must equal active allocations and can be rebuilt from them.
- `TenantAccountEntry` remains the physical table for the tenancy credit journal.
  New entries are tenancy-owned, append-only, and linked to their originating
  Payment. Credit balance is derived from signed journal entries; no independent
  balance column or tenant-owned balance is introduced.
- `Settlement.prepaidAppliedAmount`, `carryForwardAmount`, and
  `outstandingAmount` are document snapshots after invoice allocation, not a
  balance source. The API computes current credit from the journal.

The physical `tenant_account_entries` name is retained to avoid a destructive
rename. New entries require `tenancyId` and `propertyId`; legacy `tenantId` is an
optional historical snapshot only. Database design may add explicit source,
direction, and reversal fields while preserving existing rows.

### Credit journal and provenance

All amounts remain positive `Decimal(19, 0)`. Entry type supplies direction:

- credit: receipt remainder, transfer in, reversal of a debit;
- debit: credit applied, transfer out, receipt-credit reversal.

Every receipt remainder creates one credit lot linked to the Payment. Each debit
references the credit lot it consumes. When one application consumes several
lots, it creates one debit per lot. Every entry propagates `sourcePaymentId`, so
allocation, transfer, and reversal remain traceable to the original receipt.

A credit application also links to its `PaymentAllocation`. Direct allocation
to debt at receipt time needs no credit entry. A later application of stored
credit creates both a journal debit and a PaymentAllocation from the originating
Payment in the same transaction.

The balance of a tenancy is the signed sum of non-reversed journal entries for
that tenancy. Remaining value of a credit lot is its credit amount minus linked
debits. Negative tenancy or lot balance is forbidden. Cached balance may be
added only as a rebuildable projection with a database version/check guard; it
must never become an alternate source of truth.

### Receipt allocation

Receipt preview is read-only and does not reserve debt or credit. It returns the
ordered outcome plus a short-lived signed `previewToken`. The token is an
HMAC-SHA-256 envelope that binds schema version, property, tenancy, normalized
receipt intent, payer membership, ordered invoice IDs/financial versions,
credit-lot IDs/remaining values, tenancy version, issued time, and expiry. The
token is opaque to the client, must not be logged, and expires after five
minutes.

Confirm requires both `previewToken` and `Idempotency-Key`. After authorization
and property scope, an already committed matching idempotency command replays
its stored result. Otherwise confirm validates token signature/expiry, locks the
state, and recomputes the snapshot inside its Serializable transaction. Any
intent or state mismatch returns `409 ALLOCATION_PREVIEW_STALE` with zero
receipt, allocation, journal, invoice, settlement, or business-audit writes.
The user must preview again; confirm never silently commits a different outcome.

Eligible invoices belong to the same property and tenancy, are not cancelled or
deleted, and have positive outstanding amount. They are locked and allocated in
this deterministic order:

1. `billingPeriodStart ASC`;
2. `dueOn ASC`;
3. `createdAt ASC`;
4. `id ASC`.

The allocator pays each invoice up to its outstanding amount. Any remainder
becomes a new tenancy credit lot. P6-004 does not allow a caller to skip an older
eligible invoice to create credit or pay a newer invoice.

### Settlement and invoice application

New settlement invoices use gross accounting:

- Settlement and Invoice `totalAmount` are the full period charge before credit.
- Rent, electricity, water, and other charges remain normal positive invoice
  items; applied credit is not a discount item.
- Existing unallocated credit is consumed after the invoice is created and is
  represented by PaymentAllocations. Invoice `paidAmount` is applied credit plus
  any later cash allocation, and `outstandingAmount = totalAmount - paidAmount`.
- Settlement prepaid/carry-forward/outstanding fields snapshot the result for
  display after the allocation transaction completes.

This preserves the original receipt and allows void to reopen an invoice without
editing locked charge lines. Existing net invoices are not rewritten; version 2
documents are identifiable through a pricing/accounting snapshot version.

In the resumable finalize-and-invoice workflow, Transaction A finalizes the
reading and gross settlement but does not consume credit. Transaction B creates
or reuses the invoice, locks tenancy credit lots, applies available credit, syncs
the settlement snapshots, writes audit, and completes the operation. An
`INVOICE_PENDING` settlement therefore leaves credit unchanged until resume.

### Void and reversal

Void is correction of an incorrectly recorded receipt, not a refund workflow.
Only OWNER and MANAGER may void, and a non-empty reason is required.

One Serializable transaction:

1. locks the Payment, tenancy, all allocations, affected invoices, and all credit
   journal entries carrying the Payment's `sourcePaymentId`;
2. verifies the Payment is confirmed and has no prior reversal;
3. creates one typed reversal command/history record with idempotency key/hash;
4. appends the exact opposite of every related credit journal entry and marks
   the Payment `VOIDED`; allocations remain immutable history but are inactive
   because their parent Payment is voided;
5. rebuilds each affected Invoice paid/outstanding/status from allocations whose
   parent Payment remains confirmed and resynchronizes affected Settlement
   prepaid/carry-forward/outstanding snapshots;
6. records redacted audit and commits.

This also unwinds credit already transferred or applied to later invoices. A
void never hard-deletes Payment, allocation, or journal records. It cannot
produce a negative balance because every consumed lot is source-lotted. Actual
cash refund and partial void are P6-004 non-goals.

The cascade is mandatory for a P6-004 receipt. Success returns the voided
receipt, reversed allocation IDs, affected invoice projections, appended credit
reversal IDs, one negative cash event at `voidedAt`, and `replayed`. If complete
source provenance is missing, a dependent document cannot be rebuilt, or any
invariant would fail, the transaction rolls back and returns
`409 RECEIPT_REVERSAL_CONFLICT`; no partial reversal, negative credit, or silent
`RECEIPT_CREDIT_ALREADY_CONSUMED` fallback is allowed.

### Whole-room transfer and end

Changing representative or moving/leaving one co-tenant does not move credit;
credit belongs to the tenancy.

For whole-room transfer, the existing resumable operation is retained:

- Transaction A creates the old-room gross move-out settlement and leaves credit
  untouched.
- Transaction B creates/reuses the old-room invoice, applies credit to all old
  tenancy debt in FIFO order including the move-out invoice, then appends paired
  transfer-out/transfer-in journal entries for only the remaining credit. The
  pair shares a unique transfer correlation and preserves source-payment lots.
- The same Transaction B closes the source tenancy, opens the target tenancy,
  moves memberships, writes audit, and completes the command.

Any failure rolls back invoice allocation, credit transfer, and tenancy move
together. A retry reuses the persisted operation and cannot transfer the same
credit twice. Whole-room end applies credit to old debt and exposes any remainder
as `refund/reconciliation required`; it does not erase or refund that balance.

### Transaction, locking, and idempotency

Receipt confirm, credit application, void, and transfer use PostgreSQL
`SERIALIZABLE`. They lock the tenancy row first, then invoices in FIFO/ID order,
then credit lots in creation/ID order. Serialization/deadlock failures may be
retried internally at most twice; validation and authorization failures are not
retried.

`Idempotency-Key` is required for receipt confirm and void. Uniqueness is scoped
to `(propertyId, operationType, idempotencyKey)`. SHA-256 request hash includes
all normalized semantic fields. Same key/hash returns the persisted result; same
key with a different hash returns `409 IDEMPOTENCY_KEY_REUSED`. Audit is written
inside the financial transaction, and audit failure rolls back the mutation.

Database constraints and tests must protect these invariants:

- Payment amount is positive; allocations and journal amounts are positive.
- For each confirmed Payment, `amount = active allocations + remaining credit`
  across every tenancy reached by its source-payment journal chain.
- Active allocation sum cannot exceed its confirmed Payment amount.
- Active allocation sum cannot exceed Invoice total amount.
- Each credit debit/reversal references a valid source lot and cannot overdraw it.
- One reversal per journal entry and one void command per Payment.
- Property scope is consistent across Payment, tenancy, invoice, allocation,
  journal, and operation.

### Compatibility

The existing invoice-targeted `POST /payments` remains temporarily available,
but delegates to the same allocator. Its selected invoice must be the first FIFO
debt and amount cannot exceed that invoice outstanding amount. It must not retain
a separate one-invoice mutation implementation.

The settlement `prepaidAmount` field is deprecated:

1. During one compatibility release, a non-zero legacy value is adapted into a
   normal Payment with `method=OTHER`, a deterministic key derived from the
   settlement command, and an explicit legacy source marker. UI never sends it.
2. The following release rejects non-zero input with
   `PREPAID_INPUT_DEPRECATED`; optional zero remains accepted until clients are
   migrated.
3. Existing manual PREPAYMENT rows remain legacy credit lots and are assigned to
   their tenancy. They are not converted into fake historical cash receipts.

## API boundary

The public resource is named `receipt`; persistence continues to use Payment:

- `POST /api/v1/tenancies/:tenancyId/receipts/preview`: advisory FIFO preview.
- `POST /api/v1/tenancies/:tenancyId/receipts`: confirm receipt; idempotent.
- `GET /api/v1/tenancies/:tenancyId/receipts`: paginated history.
- `GET /api/v1/receipts/:receiptId`: receipt, allocations, credit, and reversal.
- `POST /api/v1/receipts/:receiptId/void`: OWNER/MANAGER correction.

Preview and confirm return the same allocation lines in FIFO order, credit
created, and balance after. Preview also returns token expiry. Confirm either
commits exactly that valid snapshot or returns `ALLOCATION_PREVIEW_STALE` with
zero financial/business-audit writes.

`receivedAt` must resolve in the configured business timezone to a date from the
tenancy start through the current business date. An optional payer must be an
active member of that tenancy at `receivedAt`. The server rejects inactive,
cross-property, future, or pre-tenancy receipts before mutation.

## Alternatives considered

- Store a mutable `creditBalance` on tenancy: fast reads, but creates a second
  source that can drift and weakens reversal provenance.
- Keep manual prepaid totals on Settlement: simple UI, but loses receipt history,
  payment method, payer, FIFO allocation, and idempotent correction.
- Treat applied credit as an invoice discount: preserves current net invoice,
  but cannot naturally reopen issued debt when the originating receipt is voided.
- Create a separate Receipt table beside Payment: clearer naming, but duplicates
  the existing cash entity and reporting path.
- Use a message-broker saga: unnecessary while all mutations remain in one
  PostgreSQL database; the persisted tenancy operation already handles the only
  intentional two-transaction boundary.

## Consequences and trade-offs

- Multi-invoice allocation and provenance make void and history correct, but add
  journal rows and more locking than the existing one-invoice path.
- Gross invoices make charges, prior receipts, and remaining amount explicit.
  Historical net invoices remain versioned rather than rewritten.
- Balance reads require aggregation. Indexes and a later rebuildable projection
  can address scale without changing ownership.
- Source-lotted credit is more complex than a pooled number, but is required to
  reverse a receipt after its credit was applied or transferred.
- All receipt mutations become serialized per tenancy. This is acceptable for a
  rental property workload and prevents double allocation.

## Security and test impact

- All endpoints are property-scoped. OWNER/MANAGER/STAFF may collect; only
  OWNER/MANAGER may void. VIEWER is read-only and existing PII masking applies.
- Logs and idempotency hashes must not expose identity numbers, cookies, or full
  notes. Audit stores identifiers, amounts, status, and safe allocation metadata.
- PostgreSQL tests are required for concurrent receipts, concurrent settlement
  apply, replay/hash mismatch, FIFO ties, partial/multi-invoice allocation,
  credit carry-forward, whole transfer, and void after apply/transfer.
- Cash reporting is event-based. Every confirmed Payment contributes one
  positive event at `receivedAt`, even if it is voided later. Its typed reversal
  contributes one negative event at `voidedAt`. Allocation, credit application,
  transfer, settlement snapshots, and prepaid display contribute zero cash.
  API, UI, dashboard, and CSV expose the same `cashReceived`, `cashReversed`, and
  net `collected` convention; receipt plus reversal net to zero across periods.

## Security finding resolution mapping

These statuses resolve the architecture contract only; implementation remains
gated on Database/Backend/QA evidence and Security re-review.

| Finding      | Contract resolution                                                                                                     | Status                  |
| ------------ | ----------------------------------------------------------------------------------------------------------------------- | ----------------------- |
| `P6-SEC-001` | Tenancy-owned append-only journal, property/source/reversal links, derived balance, fail-fast legacy reconciliation.    | **RESOLVED (contract)** |
| `P6-SEC-002` | One Serializable allocator, tenancy anchor, deterministic invoice/credit locks, bounded retry, conservation invariants. | **RESOLVED (contract)** |
| `P6-SEC-003` | Mandatory atomic source-lotted cascade; full rollback with `RECEIPT_REVERSAL_CONFLICT` when cascade cannot be proven.   | **RESOLVED (contract)** |
| `P6-SEC-004` | Five-minute HMAC preview token; stale/changed snapshot returns `ALLOCATION_PREVIEW_STALE` with zero writes.             | **RESOLVED (contract)** |
| `P6-SEC-007` | Positive receipt event at `receivedAt`, negative reversal event at `voidedAt`, allocations/credit are zero-cash.        | **RESOLVED (contract)** |

## Rollback plan

Schema rollout is additive: add tenancy/property/source/reversal links and new
entry types, backfill tenancy ownership, then deploy the shared allocator and UI.
Do not drop legacy columns or rows in P6-004.

If the feature must be disabled, hide receipt actions and reject new collection
commands while retaining read/history endpoints. Finish or cancel in-progress
operations, keep all Payment/allocation/journal/reversal history, and continue
legacy invoice payments through the shared allocator. Do not down-migrate after
new receipts exist. A forward fix can rebuild invoice projections and credit
balances from immutable records.
