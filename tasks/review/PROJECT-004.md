# PROJECT-004 — Database design

- Status: review
- Owner: Database Agent
- Reviewers: Lead, Backend, Security, QA
- Risk: high
- Dependencies: PROJECT-001, PROJECT-003
- File scope: `docs/database-design.md`

## Goal

De xuat schema, relation, constraint, index, soft delete, transaction boundaries va migration notes.

## Acceptance criteria

- [x] Entities chinh duoc mo ta.
- [x] Unique constraints chong trung phong, tenancy, reading, invoice, payment duoc mo ta.
- [x] Money/date/timezone conventions duoc mo ta.
- [x] Soft delete va audit policy duoc mo ta.
- [x] Prisma/PostgreSQL risks duoc ghi lai.

## Handoff

- Summary: Da hoan thien database design Phase 1.
- Changed files: `docs/database-design.md`.
- Verification: Manual doc review.
- Risks/assumptions: Partial unique/exclusion constraints co the can raw SQL migration.
- Remaining work: Database/Backend review truoc schema implementation.
- Suggested next owner: Lead, Database.
