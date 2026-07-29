# Team Task Board

> Bang nay la nguon dieu phoi hien tai. Task chi tiet nam trong `tasks/`.

## Backlog

- [ ] P4-003 | Phase 4 | Monthly utility invoice job | Agent: Backend + Database + QA | Dependency: P4-002 | Scope: `apps/api/**`, `packages/database/**`, `tests/**` | AC: idempotent job, unique invoice source key, batch result | Verify: `npm run check`, cron integration tests | Risk: High
- [ ] P6-001 | Phase 6 | Debt pages and APIs | Agent: Backend + Frontend + QA | Dependency: P5-002 | Scope: split by Lead before start | AC: debt list/detail filters and payment entry | Verify: `npm run check`, E2E | Risk: High
- [ ] P6-002 | Phase 6 | Dashboard and reports | Agent: Backend + Frontend + QA | Dependency: P5-002, P6-001 | Scope: split by Lead before start | AC: KPI, alerts, CSV export | Verify: `npm run check`, report tests | Risk: Medium
- [ ] P7-001 | Phase 7 | Production hardening | Agent: Security + DevOps + QA | Dependency: P2-P6 | Scope: `.github/**`, Docker, docs, tests | AC: security review, Docker, CI/CD, backup/restore runbook | Verify: CI, E2E, smoke tests | Risk: High

## Ready

Chua co.

## In Progress

- Chua co. Lead duoc phep tu dong tiep tuc phase ke tiep theo yeu cau moi cua chu du an.

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

| Agent        | Trang thai | Task                    | File scope                                      |
| ------------ | ---------- | ----------------------- | ----------------------------------------------- |
| Lead         | Active     | Phase 4 planning/start  | `TASKS.md`, review/integration docs             |
| Product      | Review     | PROJECT-001             | Product/business/story/AC docs                  |
| UI/UX        | Review     | PROJECT-002             | `docs/ui-ux-spec.md`                            |
| Architecture | Ready      | Phase 4 decisions       | `docs/decisions/**`, architecture/API docs      |
| Database     | Ready      | P4-001                  | `packages/database/**`                          |
| Backend      | Ready      | P4-001                  | `apps/api/**`                                   |
| Frontend     | Ready      | P4-001                  | `apps/web/**`, `packages/ui/**`                 |
| QA           | Ready      | P4-001 verification     | `tests/**`                                      |
| Security     | Ready      | Review sensitive flows  | `docs/SECURITY.md`, review only unless assigned |
| DevOps       | Blocked    | B-003 Docker validation | Docker/CI/deployment scopes                     |

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
