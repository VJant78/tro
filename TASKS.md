# Team Task Board

> Bang nay la nguon dieu phoi hien tai. Task chi tiet nam trong `tasks/`.

## Backlog

- [ ] P4-003 | Phase 4 | Monthly utility invoice job | Agent: Backend + Database + QA | Dependency: P4-002 | Scope: `apps/api/**`, `packages/database/**`, `tests/**` | AC: idempotent job, unique invoice source key, batch result | Verify: `npm run check`, cron integration tests | Risk: High
- [ ] P7-001 | Phase 7 | Production hardening | Agent: Security + DevOps + QA | Dependency: P2-P6 | Scope: `.github/**`, Docker, docs, tests | AC: security review, Docker, CI/CD, backup/restore runbook | Verify: CI, E2E, smoke tests | Risk: High
- [ ] P7-SEC-001 | Phase 7 | Production origin and CSRF protection | Agent: Security + Backend + QA | Dependency: UX-COMPLETE-001 | Due: before production release | Scope: `apps/api/**`, tests, security docs | AC: production origin allowlist, sensitive mutation CSRF/origin guard, negative tests | Risk: High
- [ ] P7-SEC-002 | Phase 7 | Persistent multi-instance sessions | Agent: Security + Backend + DevOps + QA | Dependency: UX-COMPLETE-001 | Due: before multi-instance deployment | Scope: API auth/session, deployment config, tests | AC: persistent revocation, required strong secret, cookie expiry/hardening | Risk: High
- [ ] P7-SEC-003 | Phase 7 | Distributed workflow lease and recovery worker | Agent: Backend + Database + QA | Dependency: UX-COMPLETE-001 | Due: before multi-instance deployment | Scope: `apps/api/**`, `packages/database/**`, tests | AC: database lease/CAS, stale command recovery, concurrency tests | Risk: High
- [ ] P7-SEC-004 | Phase 7 | Login and financial endpoint rate limiting | Agent: Security + Backend + DevOps + QA | Dependency: UX-COMPLETE-001 | Due: before public exposure | Scope: API, monitoring/deployment config, tests | AC: actor/property/IP limits, stable 429, unusual-login alert | Risk: High

## In Progress

Chua co.

## Ready

Chua co.

## Done - Phase 6.5

- [x] P6-005 | Phase 6.5 | Chi so dien nuoc tren hoa don va tra cuu hoa don theo phong | Agent: Product/BA + UI/UX + Architecture + Backend + Frontend + Database + QA + Security + Lead | Dependency: P4-002, P5-001, P6-003 | Scope: `docs/specs/INVOICE_USAGE_AND_ROOM_REPORT_*`, `apps/api/src/billing/**`, `apps/web/src/invoices/**`, `apps/web/src/reports/**`, tests | AC: `docs/specs/INVOICE_USAGE_AND_ROOM_REPORT_BRIEF.md` | Verify: API 20/20, Web invoice 3/3, PostgreSQL 4/4, desktop/mobile/print audit, build, E2E and dependency audit passed 30/07/2026 | Risk: High

### P6-005 handoff

1. Hoa don hien chi so dien/nuoc cu, moi, luong su dung, don gia va thanh tien tu snapshot bat bien; hoa don cu chi hydrate khi co lien ket finalized hop le va khong bi ghi nguoc.
2. Bao cao loc theo phong, nam va thang; JSON/CSV dung chung property/room scope, moi dong co link mo dung hoa don qua `invoiceId`.
3. Trang chi tiet ho tro in/Save as PDF bang trinh duyet, an thao tac thu tien voi VIEWER va xoa noi dung cu khi deep-link loi.
4. API dung read DTO allowlist, khong tra raw metadata/pricing/source; unknown va cross-property resource cung tra `404`.
5. Database review xac nhan khong can schema/migration/backfill cho phase nay; PostgreSQL integration test bao phu snapshot, room scope, legacy fallback va read-only invariant.
6. QA responsive desktop/mobile dat: khong overflow, khong Axe violation, khong console error va khong failed request. Security dong `P6-005-SEC-001..006` va phe duyet phase release.

Non-goals: khong tenant portal, public/signed sharing, server PDF storage, sua chi so tu hoa don, doi cong thuc utility/proration/FIFO/debt, chart hoac redesign ngoai pham vi.

Residual: monthly report con co the toi uu aggregate/pagination khi du lieu lon; day la rui ro hieu nang, khong lam sai totals va khong chan phase. Public Internet van phu thuoc P7 Origin/CSRF va rate limiting/monitoring.

## Done - Phase 6.4

- [x] P6-004 | Phase 6.4 | Thu tien nhieu lan, FIFO cong no va so du tra truoc | Agent: Product/BA + Architecture + Database + Backend + Frontend + QA + Security + Lead | Dependency: P5-002, P6-001, UX-COMPLETE-001 | Scope: requirements/docs, `packages/database/**`, `apps/api/**`, `apps/web/**`, tests | AC: `docs/specs/DAILY_COLLECTIONS_BRIEF.md` va section Daily collections trong `docs/acceptance-criteria.md` | Verify: 87 workspace tests, 12 PostgreSQL P6 tests, build, 6 desktop/mobile audit checks, audit dependency; passed 30/07/2026 | Risk: Critical

### P6-004 handoff

1. Receipt thu nhieu lan duoc phan bo cong no FIFO; phan du thanh credit theo tenancy, khong theo nguoi dai dien.
2. Settlement/invoice gross tu dong ap credit; whole-room transfer tru no cu roi chuyen lot credit con lai.
3. OWNER/MANAGER duoc void bang reversal bat bien; STAFF/VIEWER khong duoc void va VIEWER nhan DTO da redact.
4. Payment, allocation, ledger, invoice projection va audit dung transaction Serializable, idempotency bind property/operation/actor/payload.
5. Tab Phong co Thu tien/Lich su thu; Chot tien chi hien so du read-only; Bao cao tach gross, cash received/reversed, credit applied va net outstanding.
6. QA PostgreSQL da verify FIFO, stale preview, RBAC/property, concurrency, transfer, void va fault rollback; Security phe duyet P6-004 cho phase release.

Non-goals: khong tab moi, khong lich tra gop, khong tenant portal/online banking, khong cho bo qua FIFO, khong refund/deposit workflow day du va khong hard delete receipt.

Technical constraints: reuse stack va payment/account ledger hien co; mot source of truth cho balance; money khong floating point; property scope/RBAC/validation/idempotency/audit; receipt allocation credit invoice update phai atomic; moi schema change co migration. Public Internet van phu thuoc P7 CSRF/Origin va rate limiting.

## Done - UX completion

- [x] UX-COMPLETE-001 | UX completion | Safe tenancy transitions and operational UX | Agent: Lead + Product/BA + UI/UX + Backend + Frontend + Database + QA + Security | Dependency: P2-P6 complete, `reports/UX-AUDIT.md`; coordinate with P4-003, P7-001 | Scope: docs contract, `apps/api/**`, `apps/web/**`, `packages/database/**`, tests; DevOps/security scopes only when assigned | AC: UX-COMPLETE-AC below and `docs/acceptance-criteria.md` | Verify: 71 unit/component/schema tests, 3 foundation E2E, PostgreSQL rental/property suites, 16 desktop/mobile audit checks, `npm run check`, `npm run build`, `npm run test:e2e`, `npm run audit` passed 30/07/2026 | Risk: Critical

### UX-COMPLETE-001 task detail

- Goal: implement the prioritized audit as one integrated, low-complexity operating flow for room, tenant, settlement, invoice, dashboard and responsive navigation.
- Short plan:
  1. Product/BA freezes business rules, stories, testable AC and API expectations.
  2. UI/UX defines desktop/mobile flows, action visibility, confirmation, feedback and responsive states without changing backend logic.
  3. Database owns constraints/migration for representative history, idempotency and derived occupancy support.
  4. Backend implements logout, derived room state, representative swap, safe member/group transfer, finalize-and-invoice and dashboard action queue.
  5. Frontend implements navigation, contextual actions, feedback/formatting and the API flows after contracts stabilize.
  6. QA verifies domain matrix and full desktop/mobile journeys; Security reviews auth, financial mutations, authorization and retry behavior; Lead integrates and runs quality gates.
- Dependencies: P2 through P6 are implemented. Product contract and UI/UX flow must complete before implementation. Database/API contract precedes Backend; Backend contract precedes Frontend integration. P4-003 monthly job must reuse settlement/invoice idempotency and must not duplicate this flow. P7-001 remains deferred until UX-COMPLETE-001 passes review.
- Exclusive ownership:
  - Product/BA: `docs/business-rules.md`, `docs/user-stories.md`, `docs/acceptance-criteria.md`, Product sections of `TASKS.md`.
  - UI/UX: `docs/ui-ux-spec.md` and audit/design artifacts only.
  - Database: `packages/database/**` only.
  - Backend: `apps/api/**` only.
  - Frontend: `apps/web/**`, `packages/ui/**` only.
  - QA: `tests/**` and test files coordinated with production owners; production fixes require Lead review.
  - Security: review/report for session, authorization, financial mutation and sensitive-data exposure; code changes only when separately assigned.
  - Lead: `docs/api-design.md`, `TASKS.md`, cross-contract review and integration.
- UX-COMPLETE-AC:
  - Co-tenant transfer/leave closes only that membership and creates no old-room settlement/invoice while another occupant remains.
  - Whole-group transfer/end requires visible effective date, valid handover readings, preview/confirmation and exactly one old-room settlement plus invoice before room/tenancy transition completes.
  - Representative swap selects an active co-tenant, preserves tenancy/memberships, creates no settlement/invoice, maintains exactly one representative and preserves payer on historical documents.
  - Room `VACANT`/`OCCUPIED` is derived; users cannot manually create occupancy inconsistent with active tenancy/memberships.
  - `Chot va tao hoa don` and retries produce exactly one finalized settlement, invoice and set of ledger effects; recoverable invoice-pending state has a clear retry action.
  - Logout revokes the server session, clears the cookie, redirects to login and blocks back/refresh/API reuse; production credentials are never prefilled.
  - Dashboard queues unsettled rooms, pending invoices, due/overdue items once each and links to preselected processing context.
  - All mutations have loading/double-submit protection and Vietnamese success/domain-error feedback; money/utility units are formatted consistently and internal IDs are not primary labels.
  - At 360/390/430 px all primary routes have no horizontal overflow, no overlap, labeled mobile records and touch targets at least 44 x 44 px; desktop behavior remains complete.
- Test/review: QA owns the end-to-end matrix and PostgreSQL smoke data lifecycle; Security reviews logout/session, authorization and idempotent financial transitions; Product/BA validates domain outcomes; UI/UX reviews screenshots; Lead reviews schema/API compatibility and final diff.
- Integration order: Product/BA -> UI/UX -> Database -> Backend -> Frontend -> QA/Security -> Lead. UI/UX may run in parallel with Database after the Product contract is frozen; Backend and Frontend may develop against the frozen API contract in separate scopes, but Frontend integration waits for Backend verification.
- Non-goals: new main-menu tabs, batch settlement for many rooms, changing payment allocation model, document image storage, production deployment/P7 hardening, or unrelated visual redesign.
- Technical constraints: preserve `/api/v1` compatibility where possible; all money remains integer/decimal without floating point; use configured timezone for business dates; financial and tenancy transitions require validation, authorization, audit and database transaction/idempotency guards; every schema change requires a migration and documentation; reuse the current React/NestJS/Prisma/PostgreSQL stack and existing design system.
- Open decisions: confirm `DUE_SOON` threshold (proposed 3 days); confirm whether whole-group close/open stays one PostgreSQL transaction (preferred now) or uses a resumable workflow; retain P4-003 as backlog until its overlap with finalize-and-invoice is resolved.

## Blocked

- [ ] B-003 | Phase 2 | Docker validation | Agent: DevOps | Dependency: P2-002, Docker installed/available | Scope: Docker files | AC: local compose can start API/web/db | Verify: `docker compose up` smoke | Risk: Medium

## Review

- [ ] PROJECT-001 | Phase 1 | Product requirements package | Agent: Product | Scope: `docs/product-brief.md`, `docs/business-rules.md`, `docs/user-stories.md`, `docs/acceptance-criteria.md`, `docs/specs/PRODUCT_BRIEF.md` | AC: product brief, stories, testable AC, non-goals, constraints | Verify: manual Lead/QA review | Risk: Medium
- [ ] PROJECT-002 | Phase 1 | UI/UX spec | Agent: UI/UX | Scope: `docs/ui-ux-spec.md` | AC: sitemap, flows, responsive, UI states, accessibility | Verify: manual Lead/QA review | Risk: Medium
- [ ] PROJECT-003 | Phase 1 | Architecture and API design | Agent: Architecture | Scope: `.codex/agents/architecture.md`, `docs/ARCHITECTURE.md`, `docs/api-design.md` | AC: stack, boundaries, API, idempotency | Verify: manual Lead/Security review | Risk: High
- [ ] PROJECT-004 | Phase 1 | Database design | Agent: Database | Scope: `docs/database-design.md` | AC: schema, constraints, indexes, transaction boundaries | Verify: manual Lead/Backend review | Risk: High
- [ ] PROJECT-005 | Phase 1 | Security threat model | Agent: Security | Scope: `docs/SECURITY.md` | AC: assets, trust boundaries, controls, risks | Verify: manual Lead/Security review | Risk: High
- [ ] PROJECT-006 | Phase 1 | Testing strategy | Agent: QA | Scope: `docs/TESTING.md` | AC: PPC, utility cron, validation, RBAC, rollback, E2E plan | Verify: manual Lead/QA review | Risk: High
- [ ] PROJECT-007 | Phase 1 | Deployment plan | Agent: DevOps/Lead | Scope: `docs/deployment.md` | AC: env, Docker, CI/CD, migration, backup, monitoring | Verify: manual Lead/Security review | Risk: Medium
- [ ] PROJECT-008 | Phase 1 | Payment algorithm design | Agent: Architecture + Product | Scope: `docs/payment-algorithm.md` | AC: paidUntil, timezone, daily/weekly/monthly, anchor, partial, cancel, idempotency | Verify: manual Lead/QA review | Risk: High
- [ ] PROJECT-009 | Phase 1 | File ownership matrix | Agent: Lead | Scope: `docs/file-ownership-matrix.md` | AC: ownership and locked implementation scopes defined | Verify: manual Lead review | Risk: Low

## Done

- [x] P6-003 | Phase 6.3 | Reports and CSV export | Agent: Lead + Product/BA + Backend + Frontend + QA + Security review | Scope: `apps/api/src/billing/**`, `apps/web/src/reports/**`, `apps/web/src/app.tsx`, docs/tests | AC: monthly revenue/debt/utility/payment reports, filters, CSV export with safe cell encoding and auth enforcement | Verify: focused API/web tests, `npm run check`, `npm run build`, `npm run test:e2e`, `npm run audit`, CSV injection test | Risk: Medium
- [x] P6-002 | Phase 6.2 | Dashboard operational KPIs | Agent: Lead + Product/BA + UI/UX + Backend + Frontend + QA | Scope: `apps/api/src/billing/**`, `apps/web/src/dashboard/**`, `apps/web/src/app.tsx`, docs/tests | AC: dashboard shows room occupancy, current-month collectable, collected, outstanding, overdue count, needs-attention list; metrics match invoices/payments/debts | Verify: focused API/web tests, `npm run check` | Risk: Medium
- [x] P6-001 | Phase 6.1 | Debt detail filters and quick payment | Agent: Lead + Product/BA + UI/UX + Backend + Frontend + QA + Security review | Scope: `apps/api/src/billing/**`, `apps/web/src/debts/**`, `apps/web/src/billing/**`, docs/tests | AC: debt filters by room/tenant/status, detail shows invoice/payment history, quick payment reduces debt, overdue aging shown, overpay blocked | Verify: focused API/web tests, `npm run check`, security self-review | Risk: High
- [x] P5-004 | Phase 5 | Debt foundation | Agent: Lead + Backend + Frontend + QA | Scope: `apps/api/src/billing/**`, `apps/web/src/debts/**`, docs/tests | AC: unpaid invoices exposed as debt summary, filters by room/tenant, payment reduces debt immediately | Verify: `npm run check`, `npm run build`, `npm run test:e2e`, `npm run audit`, PostgreSQL billing smoke passed and smoke data cleaned | Risk: High
- [x] P5-003 | Phase 5 | PaymentPeriodCalculator implementation | Agent: Lead + Backend + QA | Scope: `apps/api/src/billing/**`, tests/docs | AC: daily/weekly/monthly anchor cases pass, leap year handled, partial payment does not advance paidUntil at service boundary | Verify: `npm run check`, calculator unit tests | Risk: Critical
- [x] P5-002 | Phase 5 | Payment + allocation + idempotency | Agent: Lead + Backend + Database + QA + Security | Scope: `apps/api/src/billing/**`, `apps/web/src/invoices/**`, docs/tests | AC: payment record, allocation to invoice, partial/full status update, duplicate idempotency key returns existing payment, overpay rejected, transaction rollback | Verify: `npm run check`, API integration tests, PostgreSQL billing smoke passed | Risk: Critical
- [x] P5-001 | Phase 5 | Invoice module | Agent: Lead + Backend + Database + Frontend | Scope: `apps/api/src/billing/**`, `apps/api/src/app.module.ts`, `apps/web/src/invoices/**`, route/CSS, docs/tests | AC: create invoice from finalized settlement, invoice items match rent/electric/water/prepaid discount, source key idempotency, total is not negative, status starts ISSUED/PAID as applicable | Verify: `npm run check`, invoice integration tests, web tests, PostgreSQL billing smoke passed | Risk: High
- [x] P4-002 | Phase 4 | Utility readings + monthly/move-out settlement | Agent: Lead + Backend + Database + Frontend + QA/BA | Scope: `packages/database/**`, `apps/api/**`, `apps/web/**`, docs, tests | AC: reading validation, one finalized reading per room/period, monthly close, move-out mid-month close, first-month proration, prepaid applied to rent, carry-forward credit, audit | Verify: `npm run check`, `npm run build`, `npm run test:e2e`, `npm run audit`, DB migrate/validate/seed, PostgreSQL utility settlement smoke passed | Risk: High
- [x] P4-001 | Phase 4 | Pricing configuration | Agent: Backend + Database + Frontend + Architecture + QA | Scope: `packages/database/**`, `apps/api/**`, `apps/web/**`, `tests/**`, docs | AC: system/property/room/tenancy pricing priority, effective resolver, validation, audit, UI | Verify: `npm run check`, API tests, web tests/build, PostgreSQL Pricing smoke passed | Risk: High
- [x] UX-FIX-001 | Phase 4 | Occupancy, tenant role/filter, group transfer and global settings refinement | Agent: Lead + Backend + Frontend + Database + QA/BA | Scope: `apps/api/**`, `apps/web/**`, `packages/database/**`, docs, tests | AC: rooms show representative/start/co-tenant count and detail occupants; tenants filter by room and show representative/co-tenant role; assignment auto-selects representative/co-tenant without rent/deposit form fields; transfer moves whole group; settings uses one global utility/fee config without room rent | Verify: `npm run check`, `npm run build`, `npm run test:e2e`, `npm run audit`, PostgreSQL occupancy/transfer/global settings smoke passed | Risk: High
- [x] UX-FIX-002 | Phase 4 | Tenant detail occupancy actions | Agent: Lead + Backend + Frontend + QA | Scope: `apps/api/**`, `apps/web/**`, docs, tests | AC: newly created active tenant shows not-in-room until membership exists; tenant detail shows current room, joined date, role and active co-occupants; individual member transfer and leave actions exist; whole-room transfer remains separate; representative individual transfer/leave is blocked while co-tenants remain | Verify: API/web focused tests, `npm run check`, build/E2E/audit, PostgreSQL individual member smoke | Risk: High
- [x] P3-001 | Phase 3 | Rooms module API + database integration | Agent: Backend + Database + QA | Scope: `apps/api/**`, `packages/database/**`, `tests/**` | AC: CRUD room, unique active room code, soft delete/retire, filters | Verify: `npm run check`, `npm run test:e2e`, PostgreSQL Rooms smoke passed | Risk: High
- [x] P3-002 | Phase 3 | Rooms UI | Agent: Frontend + QA | Scope: `apps/web/**`, `packages/ui/**` | AC: list/create/edit/detail, loading/empty/error, responsive | Verify: `npm run check`, web tests/build | Risk: Medium
- [x] P3-003 | Phase 3 | Tenants and tenancies API | Agent: Backend + Database + QA | Scope: `apps/api/**`, `packages/database/**`, `tests/**` | AC: tenant CRUD, one active tenancy per room/tenant, transfer history | Verify: `npm run check`, PostgreSQL Tenants smoke passed | Risk: High
- [x] P3-004 | Phase 3 | Tenants and tenancies UI | Agent: Frontend + QA | Scope: `apps/web/**`, `packages/ui/**` | AC: tenant list/detail/form, tenancy create/end/transfer flow | Verify: `npm run check`, web tests/build | Risk: Medium
- [x] P2-001 | Phase 2 | ADR chot stack va quyet dinh Phase 2 | Agent: Architecture | Scope: `docs/decisions/**`, `docs/ARCHITECTURE.md`, `docs/api-design.md` | Verify: manual Lead review, `npm run check` | Risk: Medium
- [x] P2-002 | Phase 2 | Workspace tooling baseline | Agent: DevOps | Scope: root config, `packages/config/**`, `package.json` | Verify: `npm install`, `npm run check`, `npm run build` | Risk: Medium
- [x] P2-003 | Phase 2 | Database foundation | Agent: Database | Scope: `packages/database/**` | Verify: prisma validate/generate/migrate/seed, `npm run check` | Risk: High
- [x] P2-004 | Phase 2 | API foundation | Agent: Backend | Scope: `apps/api/**` | Verify: API build/test/start smoke, `npm run check` | Risk: High
- [x] P2-005 | Phase 2 | Web foundation | Agent: Frontend | Scope: `apps/web/**`, `packages/ui/**` | Verify: web build/start smoke, `npm run check` | Risk: Medium
- [x] P2-006 | Phase 2 | Auth/session/RBAC skeleton | Agent: Backend + Security review | Scope: `apps/api/**` | Verify: auth integration tests, 401/403 tests, `npm run check` | Risk: Critical
- [x] P2-007 | Phase 2 | Observability and audit-log foundation | Agent: Backend + DevOps + Security review | Scope: `apps/api/**` | Verify: unit/integration tests, requestId error test | Risk: High
- [x] P2-008 | Phase 2 | Phase 2 QA harness | Agent: QA | Scope: `tests/**`, test config files assigned by Lead | Verify: `npm run check`, E2E smoke command | Risk: Medium
- [x] B-004 | Phase 2 | Database migration/seed runtime validation | Agent: Database | Scope: `packages/database/**` | Verify: `npm run db:migrate -w @repo/database`, `npm run db:seed -w @repo/database` passed | Risk: High
- [x] B-001 | Phase 2 | Git diff/history review | Agent: Lead | Scope: `.git` external state | Verify: `git status --short`, `git log --oneline -5` passed | Risk: Medium
- [x] B-002 | Phase 2 | Format check | Agent: DevOps | Scope: root tooling config | Verify: `npm run format:check` passed | Risk: Low
- [x] REPO-001 | Phase 0 | Khoi tao multi-agent repository | Agent: Lead | Scope: repo scaffold | Verify: existing scaffold files present | Risk: Low

## Current Verification Evidence

- Dependency install: `npm install` passed and produced `package-lock.json`.
- Security audit: `npm run audit` passed, 0 high vulnerabilities.
- Format: `npm run format:check` passed.
- Lint: `npm run lint` passed across implemented workspaces.
- Typecheck: `npm run typecheck` passed across implemented workspaces.
- Unit tests: `npm run test` passed across implemented workspaces.
- Combined check: `npm run check` passed.
- Build: `npm run build` passed across implemented workspaces.
- E2E smoke: `npm run test:e2e` passed, 1 test file / 3 tests after Rooms/Tenants additions.
- API smoke: `npm run start:smoke -w @app/api` passed.
- Web smoke: Vite preview returned HTTP 200 for `http://127.0.0.1:4173/`; preview process stopped after smoke.
- Prisma validate/generate: `npm run db:validate -w @repo/database` and `npm run db:generate -w @repo/database` passed.
- Database migration artifact: `packages/database/prisma/migrations/202607290001_phase2_foundation/migration.sql` generated from Prisma schema and includes reviewed partial indexes.
- Database migrate/seed runtime: `npm run db:migrate -w @repo/database` and `npm run db:seed -w @repo/database` passed against local PostgreSQL.
- PostgreSQL Rooms smoke: authenticated create/list/update/retire flow passed against local DB.
- PostgreSQL Tenants smoke: authenticated room + tenant + tenancy create/transfer/end flow passed against local DB.
- PostgreSQL Pricing smoke: authenticated room pricing config create and effective resolver passed against local DB.
- PostgreSQL occupancy/transfer/settings smoke: authenticated API smoke passed for representative assignment, co-tenant assignment, tenant `filter[roomId]`, room `currentOccupancy`, whole-group transfer and `pricing-configs/global`.
- PostgreSQL individual member smoke: authenticated API smoke passed for blocking representative solo transfer while co-tenants remain, transferring one co-tenant to another room, current tenancy detail, old room occupancy and member leave.
- Database migration artifacts: `packages/database/prisma/migrations/20260729102938_phase4_utility_settlement/migration.sql` and `packages/database/prisma/migrations/20260729105200_phase4_settlement_unique_guards/migration.sql` generated/applied against local PostgreSQL.
- PostgreSQL utility settlement smoke: authenticated API smoke passed after DB unique guard migration for room + tenant + tenancy + monthly reading finalize + settlement preview/finalize, including first-month proration and prepaid carry-forward. Smoke room code: `UTL-21398461`.
- PostgreSQL billing smoke: authenticated API smoke passed for room + tenant + tenancy + settlement + invoice-from-settlement idempotency + partial/full payment + debt summary; generated room `P5-24599580` was cleaned after smoke.
- Docker: `docker --version` failed because Docker command is not available in current shell.
- Git status/history: `git status --short` and `git log --oneline -5` passed; Phase 2/3 changes are uncommitted pending owner review.

## Agent Availability

| Agent        | Trang thai | Task                       | File scope                                 |
| ------------ | ---------- | -------------------------- | ------------------------------------------ |
| Lead         | Ready      | P7 planning/integration    | `TASKS.md`, review/integration docs        |
| Product      | Ready      | P7 requirements review     | Business rules, stories and AC docs        |
| UI/UX        | Ready      | P7 accessibility review    | `docs/ui-ux-spec.md`, design artifacts     |
| Architecture | Ready      | API/transaction review     | `docs/decisions/**`, architecture/API docs |
| Database     | Ready      | P7 hardening backlog       | `packages/database/**`                     |
| Backend      | Ready      | P4-003/P7 backlog          | `apps/api/**`                              |
| Frontend     | Ready      | P7 accessibility backlog   | `apps/web/**`, `packages/ui/**`            |
| QA           | Ready      | P4-003/P7 verification     | `tests/**`                                 |
| Security     | Ready      | Auth/financial flow review | `docs/SECURITY.md`, review unless assigned |
| DevOps       | Blocked    | B-003 Docker validation    | Docker/CI/deployment scopes                |

## Dependency Graph

```text
Phase 1 review/acceptance
  -> P2-001 ADR stack decisions
    -> P2-002 workspace tooling
      -> P2-003 database foundation
      -> P2-004 API foundation
      -> P2-005 web foundation
        -> P2-006 auth/session/RBAC
        -> P2-007 observability/audit foundation
        -> P2-008 QA harness
          -> Phase 3 rooms/tenants/tenancies
          -> Phase 4 utility readings/billing
          -> Phase 5 invoices/payments
          -> Phase 6 debt/dashboard/reports
          -> Phase 7 hardening/deployment
```

## Implementation Lock

Lead duoc phep tu dong tiep tuc cac phase tiep theo theo yeu cau moi cua chu du an:

- Van phai giu file ownership matrix, acceptance criteria va quality gate.
- Neu gap loi, Lead dieu phoi agent lien quan de chon solution va fix truc tiep.
- Chi dung khi gap external blocker khong the tu xu ly trong repo.
