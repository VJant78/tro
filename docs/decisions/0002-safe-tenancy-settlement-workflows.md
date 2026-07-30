# ADR-0002: Resumable settlement and safe tenancy transitions

- Status: Proposed
- Date: 2026-07-30
- Owners: Lead + Architecture + Product + Database + Backend + QA + Security
- Task: `UX-COMPLETE-001`

## Context

Reading/settlement, invoice, and tenancy transfer currently use separate service
and repository transactions. A whole-group transfer must create exactly one old
room settlement and invoice before moving occupants. Retries must not duplicate
financial, tenancy, handover, history, or audit records. The system must also
recover when settlement succeeds but invoice creation is temporarily unavailable.

Representative changes need typed history without changing payer snapshots on
existing documents. Room occupancy must have one source of truth.

## Decision

### Persisted domain command

Financial close, whole-group end/transfer, and representative change use a
persisted command with:

- identifiers: `id`, `operationType`, `idempotencyKey`, `requestHash`;
- state: `IN_PROGRESS | INVOICE_PENDING | COMPLETED | ACTION_REQUIRED`;
- ownership/context: actor, property, source tenancy, optional target room;
- result links: optional reading, settlement, invoice, and target tenancy IDs;
- diagnostics: safe `resultJson`, `lastErrorCode`, timestamps.

Database enforces unique `(operationType, idempotencyKey)`. A key is 16-128
opaque characters; UUID is recommended. The request hash is SHA-256 of canonical
normalized JSON excluding the key. Same key/hash replays the result; same key
with another hash returns `409 IDEMPOTENCY_KEY_REUSED` without mutation. If both
header `Idempotency-Key` and body key exist, they must match. Financial commands
are retained with their linked documents and do not expire automatically.

### Finalize settlement and invoice

`POST /api/v1/settlements/finalize-and-invoice` uses two short transactions.

Transaction A:

1. Insert/lock command; validate hash.
2. Lock active tenancy and source room.
3. Validate date, membership, pricing, and authoritative meter baseline.
4. Create/reuse finalized reading by its period unique key.
5. Create/reuse finalized settlement and ledger entries.
6. Store links, write audit, set `INVOICE_PENDING`, and commit.

Transaction B:

1. Lock command and settlement.
2. Create/reuse invoice with `sourceKey=settlement:<settlementId>`.
3. Store invoice/result, write audit, set `COMPLETED`, and commit.

Transaction A failure leaves no partial records. Retryable Transaction B failure
leaves a durable `INVOICE_PENDING`; retry resumes Transaction B and never
recalculates settlement. Database uniqueness, not pre-read checks, is the final
duplicate guard. Add a unique settlement ledger guard such as
`(settlementId, entryType)`.

### Whole-group transfer/end

`POST /api/v1/tenancies/:id/transfer` reuses Transaction A. Its Transaction B
atomically:

1. Locks command, source tenancy/room, and target room in stable ID order.
2. Creates/reuses the old-room invoice.
3. Creates one handover record.
4. Ends source tenancy and all active memberships on the effective date.
5. Creates target tenancy/memberships, preserving representative/co-tenant roles.
6. Writes one workflow audit event and completes the command.

The source tenancy stays active during `INVOICE_PENDING`. The target is reserved
from Transaction A; normal assignment/transfer must check reservations. Database
adds a partial unique guard for target rooms of pending whole-transfer commands.
Invoice and transition share Transaction B, so target conflict cannot leave an
invoice from that failed attempt. A violated reservation becomes
`ACTION_REQUIRED`; the old tenancy remains active and retry never creates another
settlement.

Whole-group end uses the same flow without target reservation/creation.
Individual co-tenant transfer/leave never invokes settlement or invoice while
another active occupant remains.

### API contract

Finalize body keeps current fields:

```json
{
  "idempotencyKey": "uuid",
  "tenancyId": "uuid",
  "settlementType": "MONTHLY",
  "billingYear": 2026,
  "billingMonth": 7,
  "periodEnd": "2026-07-31",
  "utilityReadingId": null,
  "utilityReading": {
    "electricityPrevious": "120",
    "electricityCurrent": "145",
    "waterPrevious": "30",
    "waterCurrent": "35"
  },
  "prepaidAmount": "0",
  "notes": null
}
```

For `MONTHLY`, server derives/validates month end. For `MOVE_OUT`, `periodEnd` is
required and is the effective end date. Server validates year/month from that
date. Sent previous readings are compatibility values only and must match the
latest finalized baseline.

Whole-transfer body:

```json
{
  "idempotencyKey": "uuid",
  "toRoomId": "uuid",
  "transferDate": "2026-07-18",
  "handoverReadings": {
    "electricityPrevious": "145",
    "electricityCurrent": "153",
    "waterPrevious": "35",
    "waterCurrent": "37"
  },
  "prepaidAmount": "0",
  "notes": null
}
```

Server derives source room, members, payer, `MOVE_OUT`, billing period, rent, and
pricing. It rejects same/occupied/maintenance/inactive target, invalid readings,
invalid dates, and concurrent source commands.

Completed response (`201` new, `200` replay):

```json
{
  "operation": {
    "id": "uuid",
    "status": "COMPLETED",
    "replayed": false,
    "retryable": false
  },
  "settlement": {},
  "invoice": {},
  "transfer": {
    "sourceTenancyId": "uuid",
    "targetTenancyId": "uuid",
    "effectiveOn": "2026-07-18"
  }
}
```

Finalize-only omits `transfer`. Pending returns `202`, the same operation and
settlement, `invoice:null`, `transfer:null`, `status:INVOICE_PENDING`, and
`retryable:true`. Stable errors include `IDEMPOTENCY_KEY_REUSED`,
`COMMAND_ALREADY_IN_PROGRESS`, `TARGET_ROOM_UNAVAILABLE`,
`READING_BASELINE_CHANGED`, and `COMMAND_ACTION_REQUIRED`.

### Representative change

`POST /api/v1/tenancies/:id/change-representative` accepts
`{ idempotencyKey, newRepresentativeTenantId }`.

One transaction locks tenancy and active memberships, validates the target is an
active co-tenant, demotes old membership, promotes new membership, updates
`tenancy.representativeTenantId`, appends history/audit, and completes command.
Database adds append-only history containing tenancy, old/new tenant, effective
timestamp, actor, and unique command ID. Exactly one active representative must
exist after commit. Existing settlement/invoice/payment payer fields are
immutable. No financial or tenancy record is created by this action.

Response contains operation, tenancy ID, old/new representative summaries, and
server-generated `effectiveAt`.

### Derived room state

Response/query status is derived in this order:

1. Persisted `INACTIVE` -> `INACTIVE`.
2. Persisted `MAINTENANCE` -> `MAINTENANCE`; active occupants are forbidden.
3. Active tenancy with at least one active member -> `OCCUPIED`.
4. Otherwise -> `VACANT`.

The existing column may remain, but migration normalizes legacy `OCCUPIED` to
neutral `VACANT`. Backend never writes `OCCUPIED` from tenancy mutations and
relation-filters `OCCUPIED/VACANT`. Room mutation rejects `OCCUPIED`; `VACANT`
only clears maintenance when no occupant exists. Creating first membership and
active tenancy, or closing last membership and tenancy, is atomic.

### Due-soon rule

`DUE_SOON` is exactly three calendar days in configured business timezone:

- `OVERDUE`: `dueOn < asOf`;
- `DUE_TODAY`: `dueOn = asOf`;
- `DUE_SOON`: `asOf < dueOn <= asOf + 3 days`.

No weekend/holiday adjustment. An invoice appears once in its highest applicable
state. This threshold is a domain constant, not another Settings field.

### Failure recovery

- Retry serialization/deadlock internally at most twice with short jitter.
- Do not auto-retry validation, authorization, hash, baseline, or target errors.
- Audit is written inside its domain transaction; audit failure rolls it back.
- Log request/command IDs, operation, state transition, actor, and error code;
  never log cookies, identity numbers, or full request JSON.
- Dashboard derives `INVOICE_PENDING` actions from commands and links to the exact
  settlement. Repair resumes persisted IDs and never edits issued documents.

## Alternatives considered

- One transaction: simpler, but cannot retain required `INVOICE_PENDING` state.
- Browser-coordinated endpoints: partial state and lost-response duplication risk.
- Message-broker saga: unnecessary for the current single PostgreSQL deployment.
- Persist occupancy: creates a conflicting second source of truth.
- Audit-only representative history: not a typed, queryable domain history.

## Consequences and handoff

Database Agent adds command/history models, pending target reservation, ledger
unique guard, room normalization, and concurrency migration tests. Existing
reading/settlement/invoice/active-tenancy/member constraints remain final guards.

Backend Agent adds one transaction-aware orchestrator reused by finalize,
whole-group end/transfer, retry, and later P4-003. It passes a Prisma transaction
client through utilities, billing, tenancy, and audit persistence; hashes
requests, locks deterministically, reconstructs replays, derives room state and
uses `DUE_SOON=3`.

QA/Security verify double-submit, lost-response replay, hash mismatch,
invoice-phase fault recovery, room/representative races, audit atomicity,
authorization, and sensitive-data exclusion using real PostgreSQL where
concurrency matters.

## Rollback plan

Disable new UI actions/P4-003, finish pending commands, then restore prior manual
endpoints. Keep command/history data. A follow-up may combine phases into one
transaction while retaining command IDs and replay semantics; complete all
`INVOICE_PENDING` commands first.
