# PROJECT-008 — Payment algorithm design

- Status: review
- Owner: Architecture + Product
- Reviewers: Lead, Backend, Database, QA
- Risk: high
- Dependencies: PROJECT-001
- File scope: `docs/payment-algorithm.md`

## Goal

Tai lieu hoa quy uoc ngay, timezone, `paidUntil`, chu ky ngay/tuan/thang, billing anchor, partial payment, cancel/recalculation va idempotency.

## Acceptance criteria

- [x] `paidUntil` exclusive duoc ghi ro.
- [x] Daily/weekly/monthly algorithms duoc mo ta.
- [x] Billing anchor 28/29/30/31 va cuoi thang duoc mo ta.
- [x] Partial, cancel/recalculation va idempotency duoc mo ta.
- [x] Pseudocode va test cases bat buoc duoc ghi.

## Handoff

- Summary: Da hoan thien payment algorithm design Phase 1.
- Changed files: `docs/payment-algorithm.md`.
- Verification: Manual doc review.
- Risks/assumptions: Can Backend/QA xac nhan expected dates khi implement.
- Remaining work: Implement va test trong Phase 5.
- Suggested next owner: Lead, Backend, QA.
