# Testing Strategy — Phase 1

## Goals

Dam bao nghiep vu tai chinh cot loi co the kiem thu truoc khi code:

- Tinh dung `paidUntil`.
- Khong tao invoice/payment trung.
- Khong mat lich su tai chinh.
- Validation dung business rules.
- RBAC va thao tac nhay cam duoc chan.
- Transaction rollback khi loi giua chung.

## Assumptions

- `paidUntil` la exclusive boundary.
- Mui gio he thong duoc cau hinh va truyen ro vao service.
- Tien khong dung floating-point.
- Partial payment khong tang `paidUntil`.
- Huy payment tinh lai tu invoice/payment hop le.
- Payment API va utility cron idempotent.

## Test pyramid

- Unit: `PaymentPeriodCalculator`, utility calculation, validation schema, permission helper, invoice/debt status.
- Integration: API + database transaction, invoice creation, payment confirmation/cancellation, utility cron, RBAC, unique constraints.
- E2E: luong quan trong tu tao phong den thanh toan, dien nuoc, cong no va permission.
- Manual: responsive, loading/empty/error/success, confirm nguy hiem, accessibility co ban.

## Required PaymentPeriodCalculator cases

| ID      | Case                                   | Expected                                    |
| ------- | -------------------------------------- | ------------------------------------------- |
| PPC-001 | Daily, start `2026-08-01`, cycles 1    | `2026-08-02 00:00`                          |
| PPC-002 | Daily, current `2026-08-02`, cycles 10 | `2026-08-12 00:00`                          |
| PPC-003 | Weekly, start `2026-08-01`, cycles 1   | `2026-08-08 00:00`                          |
| PPC-004 | Weekly, current `2026-08-08`, cycles 4 | `2026-09-05 00:00`                          |
| PPC-005 | Monthly anchor 15                      | Next month day 15                           |
| PPC-006 | Monthly anchor 28                      | February day 28                             |
| PPC-007 | Monthly anchor 29 non-leap             | `2026-02-28`                                |
| PPC-008 | Monthly anchor 29 leap                 | `2028-02-29`                                |
| PPC-009 | Monthly anchor 30                      | February last day                           |
| PPC-010 | Monthly anchor 31                      | February last day                           |
| PPC-011 | Anchor 31 recovery                     | `2026-02-28` then `2026-03-31`              |
| PPC-012 | Anchor 31 sequence                     | `31/01`, `28/02`, `31/03`, `30/04`, `31/05` |
| PPC-013 | Prepay 12 months from `2026-01-31`     | `2027-01-31`                                |
| PPC-014 | Partial payment                        | `paidUntil` unchanged                       |
| PPC-015 | Same idempotency key twice             | One payment, one `paidUntil` update         |
| PPC-016 | Cancel latest payment                  | Recalculate from valid records              |
| PPC-017 | Invalid cycles 0/negative/decimal      | Validation error                            |
| PPC-018 | Timezone boundary                      | Local midnight preserved                    |

## Utility invoice cron

- Active room with finalized reading creates one utility invoice.
- Re-running same period creates no duplicate.
- Two concurrent workers create at most one invoice.
- Missing final reading does not create official invoice.
- Pricing priority is tenancy, room, default system/property.
- Invoice snapshots price; later config change does not alter old invoice.
- Room without active tenancy is skipped.
- Batch failure does not create orphan invoice/header without items.

## Validation tests

- Duplicate active room code rejected.
- Negative rent, electricity price, water price rejected.
- New reading lower than previous rejected.
- End date before start date rejected.
- Two active tenancies for one room rejected.
- One tenant in two active tenancies rejected.
- Invoice total below zero rejected.
- Overpayment rejected if MVP does not support credit.
- Editing locked/paid invoice rejected without adjustment.
- Hard delete financial history rejected.

## RBAC tests

- Anonymous user cannot access dashboard.
- Owner can manage room, tenant, invoice and payment.
- Future viewer cannot create payment.
- User scoped to property A cannot view property B.
- User lacking finance permission cannot void payment.
- Direct API calls enforce server-side authorization.

## Transaction rollback tests

- Payment created but invoice update fails: rollback all.
- Invoice updated but `paidUntil` update fails: rollback all.
- Invoice item creation fails: no orphan invoice.
- Utility cron fails after header: no incomplete official invoice or status is failed/draft by design.
- Void payment fails writing audit: payment is not voided.
- Idempotency conflict does not write duplicate data.

## E2E tests

- Login, create room, create tenant, create monthly tenancy, create rent invoice, pay full, `paidUntil` increases.
- Partial payment leaves debt and does not change `paidUntil`.
- Enter utility reading, run billing job, utility invoice appears with correct total.
- Overdue invoice appears in debt list with overdue days.
- User without permission is blocked from financial mutation.

## Manual checklist

- Desktop and mobile responsive.
- Form errors are clear and focus the right input.
- Debt status not color-only.
- Confirm exists for void payment, lock invoice, retire room.
- Loading, empty, error and success states exist.
- Money formatting and timezone display are correct.
- Audit log shows actor, action, time and key old/new data.

## Quality gates before Phase 2

- Product brief, user stories and acceptance criteria reviewed by QA.
- Payment algorithm doc covers date convention, timezone, anchor, partial, cancel and idempotency.
- API design covers validation, error format, transaction and idempotency.
- Database design has unique constraints for invoice/payment duplicate prevention.
- Security doc has trust boundaries and permission model.
