# Team Task Board

> Bang nay la nguon dieu phoi hien tai. Task chi tiet nam trong `tasks/`.

## Backlog

- [ ] P3-001 | Phase 3 | Rooms module API + database integration | Agent: Backend + Database | Dependency: Phase 2, P2-005, P2-006 | Scope: `apps/api/**`, `packages/database/**` | AC: CRUD room, unique active room code, soft delete/retire, filters | Verify: `npm run check`, API integration tests | Risk: High
- [ ] P3-002 | Phase 3 | Rooms UI | Agent: Frontend | Dependency: P3-001 API contract | Scope: `apps/web/**`, `packages/ui/**` | AC: list/create/edit/detail, loading/empty/error, responsive | Verify: `npm run check`, E2E/manual smoke | Risk: Medium
- [ ] P3-003 | Phase 3 | Tenants and tenancies API | Agent: Backend + Database | Dependency: Phase 2 | Scope: `apps/api/**`, `packages/database/**` | AC: tenant CRUD, one active tenancy per room/tenant, transfer history | Verify: `npm run check`, integration tests | Risk: High
- [ ] P3-004 | Phase 3 | Tenants and tenancies UI | Agent: Frontend | Dependency: P3-003 | Scope: `apps/web/**`, `packages/ui/**` | AC: tenant list/detail/form, tenancy create/end/transfer flow | Verify: `npm run check`, E2E/manual smoke | Risk: Medium
- [ ] P4-001 | Phase 4 | Pricing configuration | Agent: Backend + Database + Frontend | Dependency: Phase 3 | Scope: split by Lead before start | AC: system/room/tenancy pricing priority | Verify: `npm run check`, integration tests | Risk: High
- [ ] P4-002 | Phase 4 | Utility readings | Agent: Backend + Database + Frontend | Dependency: P4-001 | Scope: split by Lead before start | AC: reading validation, one finalized reading per room/period, audit | Verify: `npm run check`, integration/E2E | Risk: High
- [ ] P4-003 | Phase 4 | Monthly utility invoice job | Agent: Backend + Database + QA | Dependency: P4-002 | Scope: `apps/api/**`, `packages/database/**`, `tests/**` | AC: idempotent job, unique invoice source key, batch result | Verify: `npm run check`, cron integration tests | Risk: High
- [ ] P5-001 | Phase 5 | Invoice module | Agent: Backend + Database + Frontend | Dependency: Phase 3, P4-001 | Scope: split by Lead before start | AC: invoice/items/status/snapshot price/no negative total | Verify: `npm run check`, integration/E2E | Risk: High
- [ ] P5-002 | Phase 5 | Payment + allocation + idempotency | Agent: Backend + Database + QA + Security | Dependency: P5-001 | Scope: split by Lead before start | AC: payment record, partial payment, duplicate prevention, rollback | Verify: `npm run check`, payment integration tests | Risk: Critical
- [ ] P5-003 | Phase 5 | PaymentPeriodCalculator implementation | Agent: Backend + QA | Dependency: P5-001 | Scope: `apps/api/**`, `tests/**` | AC: all PPC test cases pass | Verify: `npm run check`, unit tests | Risk: Critical
- [ ] P6-001 | Phase 6 | Debt pages and APIs | Agent: Backend + Frontend + QA | Dependency: P5-002 | Scope: split by Lead before start | AC: debt list/detail filters and payment entry | Verify: `npm run check`, E2E | Risk: High
- [ ] P6-002 | Phase 6 | Dashboard and reports | Agent: Backend + Frontend + QA | Dependency: P5-002, P6-001 | Scope: split by Lead before start | AC: KPI, alerts, CSV export | Verify: `npm run check`, report tests | Risk: Medium
- [ ] P7-001 | Phase 7 | Production hardening | Agent: Security + DevOps + QA | Dependency: P2-P6 | Scope: `.github/**`, Docker, docs, tests | AC: security review, Docker, CI/CD, backup/restore runbook | Verify: CI, E2E, smoke tests | Risk: High

## Ready

- [ ] P2-001 | Phase 2 | ADR chot stack va quyet dinh Phase 2 | Agent: Architecture | Dependency: Phase 1 accepted | Scope: `docs/decisions/**`, `docs/ARCHITECTURE.md`, `docs/api-design.md` | AC: ADR co context, decision, alternatives, consequences, rollback | Verify: manual Lead review | Risk: Medium
- [ ] P2-002 | Phase 2 | Workspace tooling baseline | Agent: DevOps | Dependency: P2-001 | Scope: root config, `packages/config/**`, `package.json` | AC: lint/typecheck/test/build khong con la echo-only cho package da implement, format check duoc dinh nghia | Verify: `npm install`, `npm run check`, `npm run build` | Risk: Medium
- [ ] P2-003 | Phase 2 | Database foundation | Agent: Database | Dependency: P2-001 | Scope: `packages/database/**` | AC: Prisma schema initial, migration, seed dev, money/date conventions, raw SQL notes for partial indexes | Verify: prisma validate/migrate/seed, `npm run check` | Risk: High
- [ ] P2-004 | Phase 2 | API foundation | Agent: Backend | Dependency: P2-001, P2-002 | Scope: `apps/api/**` | AC: API framework boots, health endpoint, error format, validation boundary, config loading | Verify: API build/test/start smoke, `npm run check` | Risk: High
- [ ] P2-005 | Phase 2 | Web foundation | Agent: Frontend | Dependency: P2-001, P2-002 | Scope: `apps/web/**`, `packages/ui/**` | AC: web framework boots, app shell, login placeholder, responsive layout skeleton, accessibility baseline | Verify: web build/start smoke, `npm run check` | Risk: Medium
- [ ] P2-006 | Phase 2 | Auth/session/RBAC skeleton | Agent: Backend + Security review | Dependency: P2-003, P2-004 | Scope: `apps/api/**`, maybe `packages/database/**` only via Database handoff | AC: owner login/session, server-side auth guard, deny by default, future role model | Verify: auth integration tests, 401/403 tests, `npm run check` | Risk: Critical
- [ ] P2-007 | Phase 2 | Observability and audit-log foundation | Agent: Backend + DevOps + Security review | Dependency: P2-003, P2-004 | Scope: `apps/api/**`, `docs/SECURITY.md`, `docs/deployment.md` | AC: requestId, structured redacted logs, audit log write helper/interface | Verify: unit/integration tests, manual log review | Risk: High
- [ ] P2-008 | Phase 2 | Phase 2 QA harness | Agent: QA | Dependency: P2-002, P2-004, P2-005 | Scope: `tests/**`, test config files assigned by Lead | AC: unit/integration/E2E harness ready, at least health/auth smoke tests | Verify: `npm run check`, E2E smoke command | Risk: Medium

## In Progress

- Chua co. Khong tu dong bat dau Phase 2 cho den khi chu du an phe duyet.

## Blocked

- [ ] B-001 | Phase 2 | Git diff/history review | Agent: Lead | Dependency: repository must be initialized as Git repo | Scope: `.git` external state | AC: Lead can review diff/history before integration | Verify: `git status --short`, `git log --oneline -5` | Risk: Medium
- [ ] B-002 | Phase 2 | Format check | Agent: DevOps | Dependency: P2-002 | Scope: root tooling config | AC: format command exists and runs in CI | Verify: `npm run format:check` | Risk: Low
- [ ] B-003 | Phase 2 | Docker validation | Agent: DevOps | Dependency: P2-002, Docker installed/available | Scope: Docker files | AC: local compose can start API/web/db | Verify: `docker compose up` smoke | Risk: Medium
- [ ] B-004 | Phase 2 | Database migration/seed validation | Agent: Database | Dependency: P2-003 | Scope: `packages/database/**` | AC: migration and seed exist and pass | Verify: prisma migrate/seed commands | Risk: High

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

- [x] REPO-001 | Phase 0 | Khoi tao multi-agent repository | Agent: Lead | Scope: repo scaffold | Verify: existing scaffold files present | Risk: Low

## Current Verification Evidence

- Dependency install: `npm install --package-lock=false --ignore-scripts` passed, 0 vulnerabilities reported.
- Dependency tree: `npm ls --depth=0` passed after install.
- Lint: `npm run lint` passed, but workspace scripts are echo-only.
- Typecheck: `npm run typecheck` passed, but workspace scripts are echo-only.
- Unit test: `npm run test` passed, but workspace scripts are echo-only.
- Combined check: `npm run check` passed, but workspace scripts are echo-only.
- Build: `npm run build` passed, but workspace scripts are echo-only.
- E2E: `npm run test:e2e` only echoes "Configure Playwright/Cypress in tests/e2e"; no E2E framework yet.
- Git status/history: failed because `C:\Tmp\Tro` is not a Git repository.
- Database migration/seed: not applicable; no real Prisma schema or migration yet.
- Docker: not applicable; no Dockerfile/compose and Docker command is not available in current shell.

## Agent Availability

| Agent | Trang thai | Task | File scope |
|---|---|---|---|
| Lead | Awaiting approval | Phase 2 planning | `TASKS.md`, review/integration docs |
| Product | Review | PROJECT-001 | Product/business/story/AC docs |
| UI/UX | Review | PROJECT-002 | `docs/ui-ux-spec.md` |
| Architecture | Ready | P2-001 | `docs/decisions/**`, architecture/API docs |
| Database | Ready | P2-003 after P2-001 | `packages/database/**` |
| Backend | Ready | P2-004 after P2-001/P2-002 | `apps/api/**` |
| Frontend | Ready | P2-005 after P2-001/P2-002 | `apps/web/**`, `packages/ui/**` |
| QA | Ready | P2-008 after harness dependencies | `tests/**` |
| Security | Review/Ready | P2-006/P2-007 review | `docs/SECURITY.md`, review only unless assigned |
| DevOps | Ready | P2-002 | root config, CI/Docker/docs |

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

Khong bat dau code Phase 2 cho den khi chu du an phe duyet:

- Phase 1 docs duoc chap nhan.
- Open decisions toi thieu duoc chot hoac duoc Lead ghi gia dinh an toan.
- P2-001 ADR duoc tao dau Phase 2.
- File ownership cho task implementation duoc xac nhan.
