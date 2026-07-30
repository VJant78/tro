# Lead Agent Handoff

Cap nhat lan cuoi: 30/07/2026, gio Asia/Bangkok.

File nay luu bo nho lam viec cua Lead Agent cho du an Tro. Khi quay lai tiep tuc, hay doc file nay sau `AGENTS.md`, `TASKS.md`, `LEAD_PROMPT.md` va `docs/WORKFLOW.md`.

## Vai tro va quy trinh

- User muon Codex dong vai Lead Agent / Engineering Lead.
- Mac dinh su dung tieng Viet.
- Phai ton trong `AGENTS.md`, file ownership matrix, `TASKS.md`, acceptance criteria va quality gate.
- Khong implement truoc khi Product brief, user stories, acceptance criteria, non-goals va technical constraints duoc ghi ro.
- Khi lam phase lon: phan cong dung vai tro sub-agent theo ownership, chay task doc lap song song khi an toan, QA/Security review neu cham auth/du lieu/tai chinh.
- Khong merge truc tiep vao `main`. Dang lam tren branch `phase/integrated-checkpoint-docker`.

## Branch va Git

- Remote: `origin https://github.com/VJant78/tro.git`.
- Branch dang dung: `phase/integrated-checkpoint-docker`.
- Commit gan nhat:
  - `4dc392a fix: proxy api through web container`
  - `8924aea fix: configure docker web api origin`
  - `fd13466 fix: run prisma migration from database workspace`
  - `47a93d0 fix: include build dependencies in api docker image`
  - `6774ab5 chore: add local docker compose setup`
  - `7347b3b feat: integrate rental management phases`
- PR link goi y: `https://github.com/VJant78/tro/pull/new/phase/integrated-checkpoint-docker`.

## Cac phase/chuc nang da ho tro

- Product discovery ban dau: doc tai lieu repo, dinh nghia product requirements, user stories, AC, non-goals, technical constraints truoc khi code.
- Phase nen tang local:
  - Huong dan cai `npm install`, API, PostgreSQL, Prisma migrate/seed.
  - Xu ly loi Postgres credential, role, shadow database permission.
- UI/Domain thue tro:
  - Tab Phong hien nguoi dang thue, dai dien, ngay vao, nguoi o chung.
  - Tab Nguoi thue them loc theo phong, hien phong dang o, ngay vao, thanh vien cung phong.
  - Logic chuyen phong/roi phong: phan biet nguoi o chung roi/chuyen rieng voi ca phong chuyen/tra.
  - Them/chinh luong doi nguoi dai dien.
- Dien nuoc/chot tien/hoa don:
  - Rule chot tien cuoi thang.
  - Tra phong giua thang: nhap dien nuoc tai thoi diem tra, tien phong tinh theo ngay o.
  - Thang dau vao giua thang: tinh tien phong theo ngay tu ngay vao den cuoi thang.
  - Ho tro tien thu nhieu lan/thu hang ngay, FIFO cong no, credit tra truoc.
  - Hoa don hien chi so dien/nuoc cu, moi, da dung, don gia va thanh tien.
  - Bao cao theo phong/thang/nam, link mo hoa don.
  - Doi dong tien phong trong hoa don: bo cot `Don gia` voi item tien phong, chi giu `Thanh tien`.
- Dashboard/Debt/Reports:
  - Da lam cac phase 6.1 den 6.5 truoc do: cong no, KPI dashboard, report/CSV, daily collections, invoice usage/report.
- Security/QA:
  - RBAC cho OWNER/MANAGER/STAFF/VIEWER.
  - VIEWER khong thay mutation controls trong hoa don/receipt.
  - Property scope, idempotency, audit redaction, migration, PostgreSQL tests.
  - P7 van con backlog: CSRF/Origin production, rate limiting, persistent multi-instance sessions, distributed workflow lease.

## Docker va server

- Docker files da them:
  - `.dockerignore`
  - `apps/api/Dockerfile`
  - `apps/web/Dockerfile`
  - `apps/web/nginx.conf`
  - `docker-compose.yml`
- `docker-compose.yml` local/server hien chay:
  - `postgres` port `5432`
  - `api` port `4000`
  - `web` port `3000`
- API container chay migration bang:
  - `cd packages/database && npx prisma migrate deploy --schema prisma/schema.prisma`
- Web container build voi:
  - `VITE_API_BASE_URL=/api/v1`
- `apps/web/nginx.conf` proxy:
  - Browser goi `http://tro.vjant.site:3000/api/v1/...` hoac `http://vjant.site:3000/api/v1/...`
  - Nginx trong web container proxy sang `http://api:4000/api/...`
- Ly do dung proxy nay:
  - Public port `4000` tu ben ngoai co luc timeout/khong forward.
  - Tranh loi browser goi `localhost:4000` tren may user.
  - Tranh CORS phuc tap khi test qua domain/port.

## Server vjant.site

- Server path repo: `/home/vjant/Downloads/tro`.
- SSH user: `vjant`.
- Khong luu SSH password vao repo/file nay.
- Repo server tung bi owner `root:root`, da sua bang:
  - `sudo chown -R vjant:vjant /home/vjant/Downloads/tro`
- Docker tren server:
  - Docker version `20.10.24+dfsg1`
  - Docker Compose `v2.39.4`
- Portainer:
  - Container `portainer` dang bind `9000` va `9443`.
  - `http://vjant.site:9000` vao duoc.
  - `https://vjant.site:9443` timeout vi traffic 9443 khong toi server; container va localhost 9443 van OK.
  - Nguyen nhan kha nang cao: NAT/router/provider firewall chua forward/open `9443`.
  - Huong tot hon sau nay: reverse proxy `https://portainer.vjant.site` qua nginx 443, roi dong public 9000.

## Tai khoan dev dang nhap

- Auth hien tai la dev login co dinh trong `apps/api/src/auth/auth.service.ts`.
- Tai khoan:
  - Email: `owner@example.local`
  - Password: `ChangeMe123!`
- `NODE_ENV=production` se chan dev login voi message `Production auth provider is not configured`.
- Docker compose da de API `NODE_ENV=development` de test duoc login dev.
- DB Docker moi can seed de login khong bi loi audit FK:
  - `cd /home/vjant/Downloads/tro`
  - `sudo docker compose exec -T api sh -lc "cd packages/database && npx tsx prisma/seed.ts"`

## Loi da gap va cach xu ly

- API `connection refused` local:
  - API chua chay hoac sai port. Chay `npm run dev -w @app/api`.
- Prisma `P1000 authentication failed`:
  - Sai user/password Postgres trong `DATABASE_URL`.
- Prisma shadow database permission:
  - DB user thieu quyen create database cho `prisma migrate dev`.
- Portainer `vjant.site:9443` khong truy cap:
  - Portainer service song, Docker bind OK, nhung request 9443 khong toi server. Mo/forward port 9443 o router/provider hoac dung nginx 443 reverse proxy.
- Docker API `datasource.url property is required`:
  - Migration chay sai working directory, Prisma khong load `packages/database/prisma.config.ts`.
  - Da fix Dockerfile API de `cd packages/database`.
- Docker API build thieu `vitest` type:
  - `NODE_ENV=production` set qua som lam `npm ci` bo devDependencies.
  - Da fix Dockerfile API: cai deps/build truoc, set `NODE_ENV=production` sau.
- Web login `Failed to fetch`:
  - Web build voi `localhost:4000` hoac API public 4000 khong vao duoc.
  - Da fix bang nginx proxy `/api/` trong web container va `VITE_API_BASE_URL=/api/v1`.
- Login `500` sau khi network OK:
  - DB chua seed user dev, audit FK fail.
  - Da chay seed.
- Browser `crypto.randomUUID is not a function` tai `http://tro.vjant.site:3000/tenants`:
  - Public HTTP domain khong phai secure context, Web Crypto `randomUUID` khong co.
  - Can fix tiep: them fallback trong `apps/web/src/format.ts` hoac dua app len HTTPS.

## Quality gates da chay gan day

- Local:
  - `npm run check` pass nhieu lan sau cac fix Docker/CORS/proxy.
  - `npm run build` pass o commit Docker truoc.
  - `npm run audit` pass, 0 high vulnerabilities.
- Server:
  - `sudo docker compose build` pass cho `tro-api` va `tro-web`.
  - `sudo docker compose up -d postgres api web` da start.
  - API health qua web proxy da OK:
    - `http://vjant.site:3000/api/v1/health`
  - Login API qua web proxy da OK sau seed:
    - `POST http://vjant.site:3000/api/v1/auth/login`
    - Status `201`

## Viec nen lam tiep

1. Fix frontend fallback cho `crypto.randomUUID()` trong `apps/web/src/format.ts` de app khong crash tren HTTP public domain.
2. Setup HTTPS/reverse proxy dung chuan:
   - `https://tro.vjant.site` cho web.
   - Proxy `/api/v1` ve API noi bo.
   - Sau do khong can expose API `4000` public.
3. Seed tu dong trong local/dev Docker neu DB moi:
   - Co the them service/command rieng `seed`, hoac document ro trong runbook.
4. P7 production hardening:
   - Origin/CSRF guard production.
   - Rate limiting login/financial endpoints.
   - Persistent session store neu multi-instance.
   - Backup/restore runbook, monitoring/alerts.
5. Portainer:
   - Dung `https://portainer.vjant.site` qua nginx thay vi public `9000/9443`.
