# P6-004 PostgreSQL QA matrix

## Scope

- Receipt preview and confirm with partial FIFO, multi-invoice FIFO and credit remainder.
- Receipt with no debt, history summary and pagination.
- Idempotent replay, request-hash mismatch and stale preview with zero writes.
- Property scope, payer membership, date range and role restrictions.
- Concurrent confirm with the same and different idempotency keys.
- Cross-actor replay rejection inside one property and VIEWER privacy masking.
- Concurrent confirm/void and confirm/settlement invoice creation, including
  invoice, cash, credit-lot and non-negative balance invariants.
- Gross settlement invoice, automatic credit application and immutable void cascade.
- Whole-room credit transfer followed by source receipt void, including target
  ledger reversal and source invoice reopening.
- Database-trigger fault injection at the credit journal write boundary with
  zero payment, allocation, operation, ledger or audit residue.
- Cash reporting: positive receipt, negative void and no allocation/credit double count.
- Legacy `/payments` cannot target a newer outstanding invoice.

## Execution

Run against a migrated PostgreSQL database containing the seeded local owner:

```powershell
$env:POSTGRES_DAILY_RECEIPTS='1'
npm run test:e2e -- tests/e2e/postgres-daily-receipts.test.ts
```

Every scenario creates a property-scoped fixture with random UUIDs. Cleanup uses
those fixture IDs and does not delete login, system settings, pricing, rooms,
tenants or financial data outside the fixture.

Latest focused result on 2026-07-30: `15 passed`, `3 skipped`; the skipped tests
belong to other opt-in E2E groups. All twelve P6-004 scenarios passed.

## Remaining gap

QA can inject a PostgreSQL trigger failure at the credit journal boundary and has
proved full rollback there. Public API tests still cannot deterministically fail
after every other internal write boundary (receipt header, each allocation,
invoice update and audit insert). A test-only transaction failpoint or repository
seam remains necessary for the complete per-boundary fault matrix.
