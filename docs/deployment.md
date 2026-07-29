# Deployment Plan — Phase 1

## Scope

Phase 1 chi thiet ke moi truong, Docker, CI/CD, migration, backup, monitoring va rollback. Khong trien khai production.

## Local environment

- Node.js 20+.
- npm workspaces theo repo hien co.
- PostgreSQL local qua Docker Compose trong Phase 2.
- `.env.example` la tai lieu bien moi truong; khong commit `.env`.

## Environment variables

Du kien:

- `NODE_ENV`
- `DATABASE_URL`
- `APP_URL`
- `API_URL`
- `SESSION_SECRET`
- `COOKIE_DOMAIN`
- `SYSTEM_TIMEZONE`
- `DEFAULT_CURRENCY`
- `LOG_LEVEL`
- `STORAGE_BUCKET`
- `STORAGE_REGION`
- `STORAGE_ACCESS_KEY_ID`
- `STORAGE_SECRET_ACCESS_KEY`

Tat ca secret phai la server-only va duoc quan ly bang secret manager hoac CI secret store.

## Docker

Phase 2 can:

- Dockerfile rieng cho `apps/web`.
- Dockerfile rieng cho `apps/api`.
- Docker Compose cho local: web, api, postgres, optional redis/cache.
- Healthcheck cho API va database.

## CI/CD

Pipeline toi thieu:

- Install dependencies.
- Lint.
- Typecheck.
- Unit tests.
- Build.
- Migration check/dry run khi database package thay doi.
- E2E trong pipeline rieng khi co app chay duoc.

## Migrations

- Migration production can review boi Lead + Database.
- Migration tai chinh can backup truoc.
- Deploy order: database-compatible backend truoc, frontend sau.
- Enum/constraint changes phai forward-compatible.

## Backups

- Backup database dinh ky va ma hoa.
- Backup object storage neu luu anh giay to.
- Test restore dinh ky.
- Tach quyen backup khoi app runtime.
- Xac dinh RPO/RTO truoc production.

## Monitoring and logging

- Request ID/correlation ID.
- Structured logs co redaction PII/secrets.
- Metrics can theo doi: error rate, latency, failed jobs, invoice job created/skipped/failed, login failures.
- Alert cho payment/idempotency errors, cron failure, database connection errors.

## Smoke tests

- API health.
- Login/session.
- Database connectivity.
- Create/read non-financial sample in staging.
- Monthly utility job dry run.

## Rollback

- Rollback app image neu loi runtime.
- Migration rollback phai duoc viet rieng cho migration rui ro.
- Khong rollback du lieu tai chinh bang thao tac xoa tay; dung adjustment/reversal co audit.
- Sau rollback chay smoke test va kiem tra logs.

## Open decisions

- Chon hosting provider.
- Chon secret manager.
- Chon backup provider va retention.
- Co can Redis/cache cho rate limit/idempotency lock ngay MVP khong.
