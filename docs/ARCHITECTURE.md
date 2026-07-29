# Architecture — Phase 1

## Context

Repo hien la monorepo JavaScript/TypeScript dung npm workspaces, co san:

- `apps/web`
- `apps/api`
- `packages/ui`
- `packages/database`
- `packages/config`
- `tests/e2e`

Website quan ly phong tro co nghiep vu tai chinh, invoice, payment, cong no, audit log va scheduled job. Vi vay kien truc uu tien tinh dung dan, transaction, validation va truy vet hon toc do giao hang.

## Proposed stack

- Frontend: Next.js + TypeScript + Tailwind CSS + shadcn/ui.
- Backend: NestJS trong `apps/api`.
- Database: PostgreSQL.
- ORM: Prisma trong `packages/database`.
- Validation: Zod cho contract hoac class-validator tai NestJS boundary; can chon mot cach nhat quan truoc Phase 2.
- Auth: cookie session `HttpOnly`, `Secure`, `SameSite=Lax/Strict` duoc uu tien cho MVP.
- Testing: Vitest cho unit, Supertest cho API integration, Playwright cho E2E.
- Deployment: Docker/Docker Compose cho local va staging; production tach web, API va database.

## Why this stack

- Tach web/API phu hop ranh gioi repo: frontend khong truy cap database truc tiep.
- NestJS hop voi domain nhieu module, guard, service layer, scheduled job, transaction va audit.
- PostgreSQL ho tro constraint, transaction, index, report query va du lieu tai chinh tot.
- Prisma da co dau vet trong repo va giup migration/type-safe access de tiep can.

## Trade-offs

- NestJS phuc tap hon Next.js API routes, nhung domain payment/invoice/audit can boundary ro.
- Prisma co the can raw SQL cho partial unique index, exclusion constraint va check nang cao.
- Tach web/API tang chi phi deploy so voi fullstack Next.js, doi lai an toan boundary va kha nang mo rong tot hon.

## Boundaries

- `apps/web`: UI, routing, form state, goi API qua HTTP.
- `apps/api`: controller, auth, authorization, validation, business services, transaction orchestration, jobs.
- `packages/database`: Prisma schema, migration, seed, database client, repository thap tang neu can.
- `packages/ui`: shared components, khong goi API.
- `packages/config`: shared TS/lint/env config.
- De xuat Phase 2 xem xet them `packages/contracts` cho Zod schema/type dung chung.

## Dependency flow

```text
apps/web ---> apps/api ---> packages/database
    |             |
    +--> packages/ui
    +--> packages/config <--+
```

## Domain principles

- Tien khong dung floating-point.
- `paidUntil` la exclusive boundary.
- Tien phong va dien nuoc co chu ky rieng.
- Hoa don snapshot gia tai thoi diem phat hanh.
- Khong hard delete du lieu da co lich su tai chinh.
- Payment va monthly invoice job phai idempotent.
- Audit log bat buoc cho thao tac tai chinh va du lieu nhay cam.

## Transaction boundaries

Bat buoc transaction cho:

- Tao hoa don dinh ky.
- Finalize utility reading va tao invoice lien quan.
- Ghi nhan payment.
- Allocate payment vao invoice.
- Cap nhat invoice status, outstanding va `paidUntil`.
- Huy payment va tinh lai state tai chinh.
- Chuyen phong/ket thuc tenancy.

## Scheduled jobs

Monthly utility invoice job:

- Chay theo timezone cau hinh.
- Lay cac phong co tenancy active.
- Kiem tra reading finalized.
- Snapshot gia.
- Tao invoice utility bang `source_key` duy nhat.
- Idempotent neu chay lai hoac chay song song.

## Observability

- Moi request co `requestId`.
- Log co cau truc va redact PII/secrets.
- Financial mutation ghi audit log trong transaction.
- Job co batch result: created/skipped/failed.

## Open decisions

- Auth provider hay tu trien khai.
- Co luu anh CCCD/giay to trong MVP khong.
- Payment allocation mot invoice hay nhieu invoice ngay MVP.
- Multi-property/multi-owner pham vi den dau trong MVP.
- Validation stack chot la Zod, class-validator hay ket hop co quy tac ro.
