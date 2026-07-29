# ADR-0001: Phase 2 foundation stack and MVP operating assumptions

- Status: Accepted
- Date: 2026-07-29
- Owners: Lead + Architecture + Security + Database + Backend + Frontend + QA

## Context

Phase 1 defined the product and technical direction for a rental room management and billing website. Phase 2 starts implementation of the system foundation. The project needs a real runnable baseline for web, API, database, auth/session, observability, audit logging and test harness before domain modules such as rooms, tenants, invoices and payments are implemented.

The repository is a JavaScript/TypeScript npm workspace monorepo with `apps/web`, `apps/api`, `packages/database`, `packages/ui` and `packages/config`.

## Decision

- Frontend: React + Vite + TypeScript for the foundation, with room to revisit Next.js after the current package audit issue is resolved and recorded in a later ADR.
- Backend: NestJS in `apps/api`.
- Database: PostgreSQL with Prisma in `packages/database`.
- Validation: Zod at API request/config boundaries.
- Auth for MVP foundation: server-side cookie session with `HttpOnly`, `SameSite=Lax`, future `Secure` in production, password hashing through Node crypto `scrypt`.
- RBAC: role model starts with `OWNER`, `MANAGER`, `STAFF`, `VIEWER`; Phase 2 enforces deny-by-default guard for protected routes.
- Document images: not stored in MVP implementation; schema may keep optional placeholders for future private storage.
- Payment allocation: database includes `payment_allocations`; MVP payment API will later restrict one payment to one invoice unless a later ADR changes this.
- Overpayment: rejected in MVP until credit/prepayment accounting is explicitly designed.
- Money: stored as `Decimal(19, 0)` for VND in Prisma/PostgreSQL.
- Dates: `paidUntil` remains exclusive; billing periods use start inclusive and end exclusive.

## Alternatives considered

- Fullstack Next.js API routes only: simpler deployment, but weaker boundaries for financial logic, scheduled jobs and server-side authorization.
- Next.js app foundation: aligned with Phase 1 preference, but the currently available package pulled a high-severity vulnerable nested `postcss` dependency that npm overrides could not replace.
- JWT in browser storage: simpler stateless auth, but worse exposure risk and more CSRF/session trade-off complexity for this admin system.
- Auth provider first: useful later, but adds dependency and cost before product workflows are stable.
- Store document images in MVP: useful operationally, but materially increases privacy, storage, retention and access-control risk.
- Support overpayment immediately: more realistic accounting, but expands invoice/payment/debt scope before core financial integrity is proven.

## Consequences

- Phase 2 implementation can proceed with clear ownership and testable foundations.
- NestJS and Prisma add setup weight, but give clear module and transaction boundaries.
- Cookie session requires CSRF and secure-cookie hardening as deployment matures.
- Not storing document images reduces MVP security burden.
- Restricting overpayment simplifies payment correctness and auditability.
- Prisma may need raw SQL migrations for partial unique indexes and exclusion constraints in later phases.

## Rollback plan

- If NestJS proves too heavy before domain implementation, replace `apps/api` foundation with a lighter Fastify app while keeping `/api/v1` contracts and tests.
- If a supported Next.js release passes `npm audit --audit-level=high`, revisit the frontend framework choice in a new ADR before switching.
- If cookie sessions conflict with deployment topology, introduce token-based auth behind the same auth service interface.
- If document image storage becomes required, add a dedicated ADR for private object storage, signed URLs, retention and malware scanning before implementation.
- If overpayment becomes required, add credit/prepayment entities and tests before changing payment acceptance rules.
