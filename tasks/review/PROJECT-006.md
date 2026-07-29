# PROJECT-006 — Testing strategy

- Status: review
- Owner: QA Agent
- Reviewers: Lead, Product, Backend, Frontend
- Risk: high
- Dependencies: PROJECT-001, PROJECT-008
- File scope: `docs/TESTING.md`

## Goal

Lap test strategy cho unit, integration, E2E, manual, RBAC, transaction va payment date cases.

## Acceptance criteria

- [x] PaymentPeriodCalculator cases duoc liet ke.
- [x] Utility cron idempotency tests duoc liet ke.
- [x] Validation, RBAC, rollback tests duoc liet ke.
- [x] E2E va manual checklist duoc mo ta.

## Handoff

- Summary: Da hoan thien testing strategy Phase 1.
- Changed files: `docs/TESTING.md`.
- Verification: Manual doc review.
- Risks/assumptions: Test expected values can chot sau khi algorithm duoc phe duyet.
- Remaining work: QA chuyen thanh automated tests trong Phase 2+.
- Suggested next owner: Lead, QA.
