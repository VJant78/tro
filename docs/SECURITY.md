# Security Threat Model — Phase 1

## Scope

Phase 1 chi dat yeu cau bao mat truoc khi code cho website quan ly va tinh tien phong tro.

Pham vi:

- Authentication va authorization.
- Future staff roles.
- Du lieu nhay cam cua nguoi thue: CCCD, dia chi, so dien thoai, anh giay to.
- Validation, SQL injection, XSS, CSRF.
- Rate limit va brute-force.
- Secrets, logs, audit logs.
- Backups.
- Payment/idempotency abuse.

## Assets

| Asset                        | Severity | Notes                                                          |
| ---------------------------- | -------- | -------------------------------------------------------------- |
| Tai khoan chu tro/quan ly    | Critical | Mat tai khoan co the mat toan bo du lieu va lich su tai chinh. |
| Du lieu nguoi thue           | Critical | Ho ten, SDT, dia chi, CCCD, ngay cap, noi cap.                 |
| Anh CCCD/giay to             | Critical | Rui ro rieng tu cao, can private storage.                      |
| Hoa don, thanh toan, cong no | Critical | Sai lech gay thiet hai tai chinh.                              |
| Audit log                    | High     | Can cho doi soat va dieu tra.                                  |
| Secrets/env vars             | Critical | Lo secret co the chiem DB/storage/session.                     |
| Backup                       | Critical | Ban sao day du cua du lieu nhay cam.                           |
| Logs van hanh                | High     | Co the vo tinh chua PII/token/idempotency key.                 |

## Trust boundaries

- Browser/client khong dang tin.
- API server la boundary bat buoc cho authn/authz/validation/business rules.
- Web khong truy cap database truc tiep.
- Database chi duoc truy cap boi backend/data access layer.
- Object storage cho giay to phai private.
- Logs, audit logs va backups la vung du lieu nhay cam.
- Payment/webhook tuong lai la external trust boundary.

## Required controls

### Authentication

- Hash password bang Argon2id hoac bcrypt cost phu hop.
- Cookie session `HttpOnly`, `Secure`, `SameSite=Lax/Strict`.
- Khong luu token nhay cam trong `localStorage`.
- Loi dang nhap khong tiet lo tai khoan ton tai hay khong.
- Rate limit theo IP va account identifier.
- Session rotation sau login va sau thay doi quyen/mat khau.
- MFA owner/admin nen future-ready.

### Authorization

- Deny by default.
- Authorization enforce server-side tai API/use case.
- Moi query scope theo owner/property.
- Khong tin role/quyen tu client.
- RBAC future-ready: `owner`, `manager`, `collector`, `viewer`.
- Quyen xem CCCD/anh giay to la permission rieng.
- Export/report/audit log cung phai enforce authorization.

### Sensitive tenant data

- CCCD va anh giay to la optional neu nghiep vu cho phep.
- Mask CCCD mac dinh; chi hien day du khi co quyen.
- Anh giay to de private storage, truy cap bang signed URL ngan han.
- Validate upload bang MIME allowlist, extension allowlist, size limit va magic-byte sniffing.
- Khong log CCCD day du, dia chi, signed URL, token.
- Can retention/deletion policy cho PII va document image.

### Input validation

- Validate server-side moi API boundary.
- Khong dung floating-point cho tien.
- Chuan hoa timezone.
- Business validation trong transaction.
- Unique constraints cho ma phong active, hoa don theo ky, idempotency key va ma giao dich.
- Error format thong nhat, khong lo stack trace.

### SQL injection

- Dung ORM/query builder parameterized.
- Raw SQL phai parameterized va review rieng.
- Allowlist field cho sort/filter/report.
- DB user least privilege.
- Khong tra loi SQL raw cho client.

### XSS and CSV injection

- Escape output mac dinh.
- Khong dung `dangerouslySetInnerHTML` neu khong sanitize.
- Ghi chu mac dinh la plain text.
- Content Security Policy can duoc thiet ke trong Phase 2.
- CSV export can encode cell de tranh formula injection.

### CSRF

- Neu dung cookie session: dung SameSite va CSRF token cho mutation.
- Kiem tra `Origin`/`Referer` cho endpoint nhay cam.
- Khong cho mutation qua GET.

### Rate limiting

- Rate limit login, password reset, upload va financial endpoints.
- Progressive delay/temporary lockout.
- Alert khi login fail bat thuong.
- Idempotency khong thay the rate limit.

### Secrets and logs

- Secrets chi qua env vars/secret manager.
- Commit `.env.example`, khong commit secret that.
- Tach public env va server-only env.
- Startup validation khong in gia tri secret.
- Structured logging co redaction mac dinh.
- Khong log request body cho auth, tenant documents va payment.

### Audit log tamper resistance

- Audit log append-only trong application path.
- UI khong co chuc nang sua/xoa audit log.
- DB permission han che update/delete audit table.
- Log actor, action, entity, entityId, old/new value, timestamp, IP, requestId.
- Financial audit nam trong cung transaction voi thay doi nghiep vu.
- Future hardening: hash chain hoac immutable/offsite log.

### Backups

- Backup DB dinh ky, ma hoa at rest.
- Backup object storage neu luu giay to.
- Tach quyen backup khoi app runtime.
- Test restore dinh ky.
- Backup truoc migration rui ro cao.
- Khong dung production data that cho dev/test neu chua anonymize.

## Security acceptance criteria

- Co permission matrix toi thieu cho owner va future staff.
- Co data classification cho PII, document images, finance data, audit logs va backups.
- Co quyet dinh luu hay khong luu anh giay to trong MVP.
- Co retention policy so bo.
- Co idempotency cho payment va scheduled billing.
- Co audit log append-only cho thao tac tai chinh.
- Co validation rules testable.
- Co yeu cau khong log secrets/PII nhay cam.
- Co backup encrypted va restore test trong plan DevOps.

## Open risks

- Chua chon auth provider/session strategy.
- Chua chot staff roles chi tiet.
- Chua chot storage provider cho document image.
- Chua chot retention policy.
- Chua chot payment integration/overpayment.

## Security review - UX-COMPLETE-001 (2026-07-30)

### Ket luan

- Pham vi: toan bo diff UX-COMPLETE-001, tap trung auth/logout, RBAC, cookie/CSRF, stable error, validation, idempotency, race phong dich, transaction tai chinh, audit, PII/logging, CSV va dependency.
- Ket qua review ban dau: `0 Critical`, `5 High`, `6 Medium`.
- Re-review ngay 30/07/2026: ca `5 High` da duoc xu ly va co regression/integration evidence; `SEC-UX-009` va `SEC-UX-011` cung da duoc dong. Bon Medium con lai thuoc P7 va khong duoc phep bo qua truoc production.

### Findings

| ID         | Severity | Finding va evidence                                                                                                                                                                                                                                                                                                                                                                                                                                                               | Remediation bat buoc                                                                                                                                                                                                                                                                                                                            | Status                |
| ---------- | -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------- |
| SEC-UX-001 | High     | `AuditService` chi day record vao `inMemoryRecords` (`apps/api/src/audit/audit.service.ts:26-39`) trong khi bang `audit_logs` da ton tai (`packages/database/prisma/schema.prisma:627-645`). Audit workflow duoc ghi sau transaction nghiep vu (`tenancy-workflow.service.ts:503-619`, audit tai `275-286`); doi dai dien cung audit sau transaction repository (`tenants.service.ts:182-199`). Restart/crash se mat audit va thay doi tai chinh co the commit ma khong co audit. | Tao audit repository persisted. Moi mutation tai chinh, chuyen/tra phong va doi dai dien phai insert audit bang cung `Prisma.TransactionClient` va cung transaction voi state change. Han che DB runtime role khong duoc update/delete audit; luu requestId/actor/IP/user-agent va redaction PII.                                               | **RESOLVED**          |
| SEC-UX-002 | High     | `handoverReadings` dung `z.coerce.string()` khong regex/range (`tenancy-workflow.schemas.ts:11-17`); so sanh `Number(...)` se bo lot `NaN` (`18-33`). Utilities va billing tiep tuc tinh bang JS `Number` (`utilities.service.ts:202-218, 256-280`; `billing.service.ts:85-103`), co the tao `NaN`, loi Prisma, vuot `Decimal(19,0)` hoac mat chinh xac voi so lon.                                                                                                               | Tai su dung decimal schema da allowlist format; bat buoc finite, non-negative, max 3 decimals va gioi han phu hop cot DB. Dung Decimal/bigint cho tien va phep cong tru, khong dung floating point. Them test `abc`, exponent, Infinity, qua 19 chu so, so le va gia tri sat gioi han.                                                          | **RESOLVED**          |
| SEC-UX-003 | High     | Unique reservation giu phong dich cho ca `ACTION_REQUIRED` (`migration.sql:157-161`). Workflow tu choi moi retry khi o trang thai nay (`tenancy-workflow.service.ts:189-190`) va chuyen sang trang thai nay khi mot so loi xay ra (`228-255`), nhung khong co command resolve/cancel de giai phong. Mot thao tac loi co the khoa phong dich vo thoi han.                                                                                                                          | Them luong OWNER/MANAGER `resolve`/`cancel` idempotent, audit cung transaction, chi giai phong sau review; dashboard phai hien action. Kiem tra property/actor, optimistic version va conflict khi phong da thay doi. Khong tu dong TTL-release mot workflow tai chinh da co settlement.                                                        | **RESOLVED**          |
| SEC-UX-004 | High     | Payment replay chi tra payment cu theo key ma khong so request hash (`billing.service.ts:125-130`). Transaction payment doc outstanding roi update (`prisma-billing.repository.ts:267-315`) khong row lock/serializable/conditional guard; hai key khac nhau gui dong thoi co the cung vuot qua outstanding check, tao hai allocation va lost update. Audit payment lai nam ngoai transaction (`billing.service.ts:145-160`).                                                     | Them request hash gom invoice/amount/method/paidAt va tra `IDEMPOTENCY_KEY_REUSED` khi mismatch. Khoa invoice hoac dung serializable/atomic conditional update, validate outstanding ben trong transaction, bat unique conflict thanh replay, va ghi audit trong cung transaction. Them concurrent PostgreSQL test va lost-response retry test. | **RESOLVED**          |
| SEC-UX-005 | High     | GET tenant/tenancy cho phep `VIEWER` (`tenants.controller.ts:41-53,100`) va response tenant chua CCCD/dia chi day du (`prisma-tenant.repository.ts:96-97`). Session khong mang property membership; repository queries khong scope owner/property. Dieu nay khong dat yeu cau mask CCCD va query theo property trong threat model.                                                                                                                                                | Them property membership/permission vao server session va scope moi query/mutation theo property. Tach DTO list/detail, mask CCCD mac dinh; chi permission rieng moi duoc xem PII day du. Test 403/cross-property va khong dua PII vao dashboard/report/audit.                                                                                  | **RESOLVED**          |
| SEC-UX-006 | Medium   | Cookie co `HttpOnly`, `SameSite=Lax`, `Secure` o production va clear voi cung attributes (`auth.controller.ts:21-26,43-48`), nhung mutation khong co CSRF token hoac Origin/Referer check. CORS chi allow localhost (`main.ts:20-23`), chua co production origin policy.                                                                                                                                                                                                          | Them allowlist production origin va Origin/Referer validation cho mutation nhay cam; neu can cross-site thi dung synchronizer/double-submit CSRF token. Them negative CSRF tests.                                                                                                                                                               | **OPEN - P7 backlog** |
| SEC-UX-007 | Medium   | Session va revoke chi nam trong process `Map` (`session.service.ts:9-60`), dung fallback secret co dinh neu thieu env (`63-66`). Restart/multi-instance lam revoke khong nhat quan. Logout bi guard chan khi cookie da invalid nen response khong clear cookie. Cookie chua co TTL khop session va prefix `__Host-`.                                                                                                                                                              | Persist hash session/revocation, bat buoc `SESSION_SECRET` manh khi startup, clear cookie theo best-effort ke ca session invalid, dat `Max-Age/Expires` khop 8 gio va can nhac `__Host-tro_session`.                                                                                                                                            | **OPEN - P7 backlog** |
| SEC-UX-008 | Medium   | Lock `activeCommands` chi co tac dung trong mot process va cho replay `IN_PROGRESS` sau 30 giay (`tenancy-workflow.service.ts:78-80, 362-378`). DB unique source artifacts va transaction B giam duplicate, nhung command chay hon 30 giay/multi-instance van co the overlap. Race gan cung settlement cho hai operation co the de mot operation `IN_PROGRESS` ma khong co status xu ly ro.                                                                                       | Dung DB lease/version/row lock voi owner va expiry; update trang thai bang compare-and-set. Bat P2002 settlement-link thanh stable conflict/ACTION_REQUIRED va co recovery job.                                                                                                                                                                 | **OPEN - P7 backlog** |
| SEC-UX-009 | Medium   | Operation idempotency unique theo `(operationType,idempotencyKey)` toan cuc (`migration.sql:135-136`), khong scope property/actor. Actor khong nam trong request hash. Trong mo hinh nhieu property, key trung/co the doan co the replay ket qua operation khac.                                                                                                                                                                                                                  | Scope unique va lookup theo property (va can nhac actor), bind actor/property/source tenancy vao request hash va authorization check truoc khi tra replay.                                                                                                                                                                                      | **RESOLVED**          |
| SEC-UX-010 | Medium   | Chua co rate limit cho login va cac endpoint tai chinh. Idempotency khong ngan brute force, request flood hoac tao nhieu key khac nhau.                                                                                                                                                                                                                                                                                                                                           | Rate limit theo IP/account cho login; theo actor/property cho payment, finalize, transfer/end va representative change; them alert cho login fail bat thuong.                                                                                                                                                                                   | **OPEN - P7 backlog** |
| SEC-UX-011 | Medium   | Khong thay request-body logging truc tiep, va exception filter khong tra stack cho client. Tuy nhien no log raw `Error.message` (`api-exception.filter.ts:25-36`), co the chua gia tri Prisma/PII; cac call audit hien dua nguyen tenant/invoice/payment vao `newValues`.                                                                                                                                                                                                         | Structured logger co redaction; allowlist error fields/code, khong log raw Prisma message o production. Audit persisted phai dung DTO redacted, retention va access policy rieng.                                                                                                                                                               | **RESOLVED**          |

### Controls da xac minh

- **PASS - deny by default/RBAC:** global `RbacGuard` bao ve route khong `@Public`; workflow mutation gioi han `OWNER/MANAGER/STAFF`; session va repository scope theo property, VIEWER nhan PII da mask.
- **PASS - logout co ban:** token cu bi xoa khoi session store va cookie dung `HttpOnly/SameSite=Lax/Secure` dung moi truong. Persistence/hardening con o SEC-UX-007.
- **PASS - stable errors:** `DomainException` tra code co dinh; exception filter khong tra stack/SQL cho client. Header `Idempotency-Key` khac body bi tu choi bang `IDEMPOTENCY_KEY_MISMATCH` (`tenancy-workflow.controller.ts:97-103`).
- **PASS - lost response/duplicate workflow co guard nen:** operation persisted, request hash canonical SHA-256, property-scoped operation key, unique invoice `sourceKey`, unique active target tenancy va transaction B giu invoice + handover + close/open + completion cung commit. Residual multi-instance lease nam tai SEC-UX-008.
- **PASS - representative change:** request hash mismatch bi tu choi va doi hai member flag + tenancy representative + history + audit trong mot Prisma transaction.
- **PASS - CSV injection:** `safeCsvCell` prefix apostrophe cho `=`, `+`, `-`, `@` sau `trimStart` va escape quote (`reports-csv.ts:58-61`). Can giu regression test cho leading whitespace/control character.
- **PASS - dependency:** `npm audit --json` ngay 2026-07-30: `0` critical/high/moderate/low, `494` dependencies duoc scan.
- **PASS - sensitive request logging:** khong co middleware/controller log request body, password, cookie hay session token; exception va audit metadata dung allowlist/redaction.

### Security gate ket qua

1. Backend + Database da xu ly SEC-UX-001 den SEC-UX-004; Backend + Security/Lead da xu ly SEC-UX-005.
2. QA da them regression va PostgreSQL integration cho concurrent payment, retry/key mismatch, malformed/oversized numeric, ACTION_REQUIRED resume/cancel, cross-property va PII mask.
3. `npm audit`, focused tests va full quality gate da pass ngay 30/07/2026.
4. Moi High da `RESOLVED`; cac Medium con lai co task P7, owner va deadline ro rang trong `TASKS.md`.

### Re-review evidence (2026-07-30)

- `SEC-UX-001`: `AuditService` ghi PostgreSQL; financial/tenancy repositories ghi audit trong cung transaction. Migration `202607300002_security_hardening` them trigger append-only. Database schema tests va PostgreSQL rental flow xac minh audit ton tai sau mutation.
- `SEC-UX-002`: `platform/numeric.ts` dung scaled integer/`bigint`, gioi han money va meter theo schema. `platform/numeric.test.ts` bao phu malformed, exponent, overflow va exact maximum.
- `SEC-UX-003`: co endpoint resume/cancel cho operation can can thiep, compare-and-set status, property/role guard, audit va dashboard action. API regression test bao phu resume/cancel va key mismatch.
- `SEC-UX-004`: payment bind request hash, chay transaction `Serializable`, scope idempotency theo property va audit trong transaction. PostgreSQL E2E gui hai payment dong thoi va xac minh chi mot request thanh cong; retry dung key tra cung payment, payload khac bi tu choi.
- `SEC-UX-005`: session mang `propertyId`; Prisma repositories scope query/mutation theo property; VIEWER nhan CCCD/address da mask. `postgres-property-scope.test.ts` xac minh list/get/mutation cross-property va PII masking tren PostgreSQL that.
- `SEC-UX-009`: migration `202607300003_property_scoped_idempotency` doi unique operation/payment thanh property-scoped; authorization chay truoc replay.
- `SEC-UX-011`: exception filter chi log stable error metadata da redaction; audit payload dung allowlist, khong luu password, cookie, token, CCCD hay address raw.
- Dependency gate: `npm audit --audit-level=high` phai pass trong final quality gate.

Residual Medium dua vao P7:

- `SEC-UX-006`: Security + Backend, due truoc production release - production origin/CSRF guard va negative tests.
- `SEC-UX-007`: Security + Backend + DevOps, due truoc multi-instance deployment - persistent session, required secret, cookie TTL/hardening.
- `SEC-UX-008`: Backend + Database + QA, due truoc multi-instance deployment - database lease/lock cho command dai va recovery worker.
- `SEC-UX-010`: Security + Backend + DevOps, due truoc public exposure - rate limit login/financial mutation va alert.

## Security review - P6-004 daily collections (2026-07-30)

### Pham vi va ket luan

- Threat-model cac endpoint preview, create, history va void receipt; FIFO allocation; credit tra truoc; settlement; report/dashboard; RBAC; property scope; idempotency; race; audit va PII.
- Assets Critical: receipt thuc thu, allocation, invoice outstanding/status, credit balance va bao cao doanh thu. Browser va preview response khong duoc xem la nguon du lieu dang tin.
- Ket qua truoc implementation: `2 Critical`, `5 High`, `2 Medium`. Co `3 code blockers` va `2 release blockers`; Database va Backend chua duoc bat dau cho den khi `P6-SEC-001`, `P6-SEC-002` va `P6-SEC-003` co contract duoc Architecture + Security chap thuan.
- Review nay khong sua production code. Evidence dua tren schema va code billing/utilities hien tai, khong phai ket qua re-review implementation.

### Trust boundaries va invariants

- Client chi gui y dinh thu tien. API tu xac dinh property, active tenancy, candidate invoices, FIFO order, outstanding va credit balance tu database.
- Preview la snapshot khong co quyen commit. Create phai tinh lai va khoa dung state; khong tin allocation, credit, payer name, room/property hay total do client gui.
- `Payment`/receipt la cash event duy nhat. `PaymentAllocation` va `TenantAccountEntry` chi la cach su dung cash, khong phai doanh thu moi.
- Moi receipt thuoc dung mot `(propertyId, tenancyId, roomId)`. Nguoi nop chi la metadata va neu la tenant thi phai la active member cua tenancy tai `receivedAt`.
- Tong receipt bat bien: `receipt.amount = sum(active allocations) + unconsumed credit + consumed credit`. Khong co amount am, float, hard delete hoac mutation im lang.
- Create va void phai atomic voi receipt, allocations, ledger, invoice paid/outstanding/status va mot business audit event.

### Findings va blockers

| ID         | Severity | Finding va evidence                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | Remediation bat buoc                                                                                                                                                                                                                                                                                                                                                                                                                                          | Gate/status                                          |
| ---------- | -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| P6-SEC-001 | Critical | Credit source of truth hien sai ownership. `Payment` khong co `tenancyId`; `TenantAccountEntry.tenantId` la bat buoc, `tenancyId` nullable va chi co `PREPAYMENT/CREDIT_APPLIED` (`packages/database/prisma/schema.prisma:478-499,565-594`); `accountBalance` cong tru theo `tenantId` (`apps/api/src/utilities/prisma-utilities.repository.ts:342-357`). Doi dai dien co the lam mat/nhan nham credit, trai brief quy dinh receipt/credit thuoc tenancy. Ledger cung chua lien ket receipt nen khong the dao an toan. | Chot mot ledger canonical theo tenancy. Receipt va moi credit entry bat buoc property/tenancy/source receipt hoac settlement, co direction/type ro rang, unique source guard va reversal linkage. Balance phai derive tu immutable ledger, khong duy tri them cot balance doc lap. Migration phai reconcile legacy entry theo tenancy; neu ambiguous thi fail va yeu cau doi soat, khong gan theo dai dien hien tai.                                          | **CODE BLOCKER** - Architecture + Database           |
| P6-SEC-002 | Critical | Payment hien tai chi allocate mot invoice va chan overpay (`billing.schemas.ts:27-34`, `prisma-billing.repository.ts:380-430`). P6-004 can multi-invoice FIFO + credit, nen ghep cac repository call rieng se tao partial commit, over-allocation va double credit khi receipt/settlement chay dong thoi.                                                                                                                                                                                                              | Mot `Serializable` transaction phai khoa mot tenancy/account anchor va cac invoice cung property theo thu tu deterministic `(billingPeriodStart, dueOn, createdAt, id)`, tinh lai FIFO, tao receipt, allocations, credit ledger, update invoice va audit. Retry serialization co gioi han; het retry tra stable conflict. Them DB constraints/unique/index va invariant check trong transaction.                                                              | **CODE BLOCKER** - Architecture + Database + Backend |
| P6-SEC-003 | High     | `Payment` co `VOIDED`, `voidedAt`, `voidReason`, nhung chua co void service; allocation co `deletedAt` va account entry khong co reversal source (`schema.prisma:565-611`). Hard/soft delete allocation se mat dau vet. Brief chua chot cach void khi credit cua receipt da bi settlement sau tieu thu.                                                                                                                                                                                                                | Dung immutable reversal, khong delete allocation/ledger. Void khoa receipt, tenancy, invoice va credit trong mot transaction; chi `CONFIRMED` moi void duoc; ly do trim bat buoc; replay idempotent. MVP phai atomic reject `RECEIPT_CREDIT_ALREADY_CONSUMED` neu khong du credit de dao, hoac Product + Architecture phai dinh nghia cascade reversal settlement truoc khi code. Khong duoc tao credit am hay void mot phan.                                 | **CODE BLOCKER** - Product + Architecture + Security |
| P6-SEC-004 | High     | Preview co race/TOCTOU: cong no, credit hoac tenancy co the thay doi sau preview va truoc confirm. Neu create tin allocation client hoac am tham commit ket qua khac, user co the chap nhan sai phan bo.                                                                                                                                                                                                                                                                                                               | Preview la POST read-only, cung RBAC/property validation nhu create, khong tao audit tai chinh/ledger. Server tra `previewToken`/snapshot hash ngan han bind property, tenancy, amount, method, receivedAt, payer va ordered invoice versions. Create tinh lai; snapshot khac thi tra `ALLOCATION_PREVIEW_STALE` va khong mutation. Khong dua outstanding/credit/allocation tu client vao write path.                                                         | **OPEN - implementation gate**                       |
| P6-SEC-005 | High     | Cross-property/IDOR co the xay ra qua roomId, tenancyId, payerTenantId, invoice IDs hoac idempotent replay. Nen hien tai payment repository co property filter va unique key theo property (`prisma-billing.repository.ts:320-382`; `schema.prisma:590`), nhung API receipt moi se noi nhieu entity hon.                                                                                                                                                                                                               | Authorization phai chay truoc replay. Lay property tu session, khong body; query moi entity voi property predicate; verify room-tenancy active relation va payer active membership. Cross-property/missing resource tra stable 404/403 ma khong ro ri ten, balance, invoice hay receipt. Unique idempotency it nhat theo `(propertyId, operation, key)` va request hash bind actor, property, tenancy, amount, method, receivedAt, payer va normalized notes. | **OPEN - implementation gate**                       |
| P6-SEC-006 | High     | Concurrent create/create, create/settlement va create/void co the cung doc mot outstanding/credit. `Serializable` payment hien tai bao ve mot invoice (`prisma-billing.repository.ts:299-453`) nhung chua co lock chung cho tenancy credit/FIFO multi-invoice.                                                                                                                                                                                                                                                         | Moi financial command dung cung lock order: tenancy/account anchor, invoice FIFO order, receipt/ledger. PostgreSQL tests phai chay request that dong thoi voi key giong va key khac; tong allocation khong vuot outstanding, credit khong am, invoice totals khop, chi mot cash event/audit cho replay. Khong dung in-process mutex lam control duy nhat.                                                                                                     | **OPEN - implementation gate**                       |
| P6-SEC-007 | High     | Report/dashboard hien cong `Payment CONFIRMED` theo `paidAt` (`billing.service.ts:142-160,353-385`), day la nen dung cho receipt chua huy. Tuy nhien them credit entry/application vao report se double-count cash; void o thang sau can semantics ro rang. Invoice hien tru prepaid bang discount va tao total tu outstanding (`billing.service.ts:83-112,439-483`), de gay nham giua billed amount va cash collected.                                                                                                | Bao cao cash theo event: ghi receipt duong dung mot lan tai `receivedAt`, ke ca neu bi void sau nay; ghi reversal am dung mot lan tai `voidedAt`. `collected` khong sum allocation, PREPAYMENT, CREDIT_APPLIED hoac prepaid discount. Receipt history van hien status VOIDED. Tach metric gross billed, credit applied va net outstanding; tong lien ky cua receipt + reversal phai bang zero.                                                                | **OPEN - report gate**                               |
| P6-SEC-008 | Medium   | Payer name va notes co the chua PII. Payment DTO hien tra payer name/notes (`billing.types.ts:60-79`) va payment list cho VIEWER (`billing.controller.ts:24-63`). Audit redaction theo key khong redact `notes` (`audit.service.ts:57-75`). CSV da co formula guard nhung notes/history moi van la exposure surface.                                                                                                                                                                                                   | History DTO toi thieu; VIEWER khong nhan notes/nguoi ghi nhan neu khong can. Notes plain text, max 1000, khong render HTML va khong ghi vao log/audit. Audit allowlist propertyId, tenancyId, receiptId/number, amount, allocation IDs, status, actor, requestId; khong luu raw body, idempotency key, payer contact/name hay notes. CSV tiep tuc qua `safeCsvCell`.                                                                                          | **OPEN - privacy gate**                              |
| P6-SEC-009 | Medium   | Endpoint tai chinh moi ke thua residual CSRF va rate-limit (`SEC-UX-006`, `SEC-UX-010`). Idempotency khong ngan STAFF tao nhieu key, brute-force receipt ID hay request flood.                                                                                                                                                                                                                                                                                                                                         | Truoc public exposure, mutation phai co production Origin/CSRF guard va rate limit theo actor + property + IP, stable `429`, request-size limit va alert bat thuong. Preview co limit rieng de tranh query/lock amplification.                                                                                                                                                                                                                                | **RELEASE BLOCKER - P7-SEC-001/P7-SEC-004**          |

### Security acceptance criteria P6-004

1. **RBAC:** OWNER/MANAGER/STAFF duoc preview/create; chi OWNER/MANAGER duoc void; VIEWER chi doc history da redaction. Moi matrix co positive va negative API test.
2. **Property scope:** moi query/mutation lay property tu authenticated session. Room, active tenancy, payer, invoice, receipt, allocation va ledger khac property bi tu choi truoc replay va khong ro ri du lieu.
3. **Validation:** amount la integer VND `> 0` va trong `Decimal(19,0)` bound; method allowlist; reason/notes co length bound; `receivedAt` la ISO timestamp hop le, khong tuong lai va khong truoc tenancy start theo timezone cau hinh. Client khong duoc gui property, allocation total, credit balance hay invoice status de server tin.
4. **Preview:** preview khong tao/sua payment, allocation, ledger, invoice hay business audit. Token/hash bind day du request va snapshot; create voi preview stale tra `ALLOCATION_PREVIEW_STALE`, zero writes.
5. **FIFO:** server chi chon invoice cung tenancy/property, khong CANCELLED, outstanding `> 0`; sort dung period cu nhat, due date, createdAt, id. Mot receipt co invariant amount bang allocations + credit outcome.
6. **Atomicity:** fault injection tai moi buoc create/void phai rollback toan bo receipt, allocations, credit, invoices va audit. Khong co trang thai receipt CONFIRMED ma thieu audit hoac ledger outcome.
7. **Concurrency:** concurrent create voi key giong chi tao mot receipt va mot audit; payload khac cung key tra stable `IDEMPOTENCY_KEY_REUSED`; key khac khong over-allocate. Concurrent settlement/create/void khong tao credit am, lost update hoac double receipt.
8. **Void:** receipt bat bien, khong hard/soft delete allocation/ledger. Void lap lai cung key tra cung ket qua; key khac khong void hai lan; STAFF/VIEWER bi 403. Invoice paid/outstanding/status duoc derive lai va audit ghi old/new status. Credit da tieu thu xu ly theo contract cua `P6-SEC-003`, khong cascade ngam.
9. **Audit:** create/void thanh cong ghi dung mot business audit event trong cung transaction, gom actor, propertyId, tenancyId, receiptId, amount, allocation IDs, status, IP/requestId; retry khong tao audit moi. Audit append-only trigger van pass; payload khong co PII/notes/idempotency key.
10. **PII/log/error:** history va report dung role-safe DTO; payer contact/identity khong xuat hien trong VIEWER, audit, application log hay stable error. Error khong tra stack/SQL/existence cua resource property khac.
11. **Reporting:** dashboard/report cash dem receipt duong mot lan theo receivedAt va reversal am mot lan theo voidedAt; receipt + reversal lien ky bang zero. Allocation va credit application bang `0` cash event. Tong UI/CSV/API phai khop nhau va tach gross billed, credit applied, net outstanding.
12. **Migration:** migration co backup/rollback plan, unique/index/check constraint va script doi soat. Legacy manual prepayment ambiguous lam migration fail co thong bao; khong silently reassign. Sau migration UI khong the gui tong `prepaidAmount` thu cong.
13. **Abuse controls:** test CSRF/Origin am va stable 429 phai pass truoc public release; request body/log redaction va dependency audit khong co High/Critical.

### Bat buoc test tai security gate

- PostgreSQL integration, khong chi in-memory: FIFO qua it nhat ba invoice, partial invoice, overpayment thanh credit, settlement consume mot phan credit va carry-forward.
- Hai create dong thoi: cung key/cung payload, cung key/khac payload va hai key khac cung tranh mot outstanding.
- Create dong thoi settlement va void dong thoi create; lap lai toi thieu 20 lan de bat serialization/deadlock. Moi retry phai co bounded backoff va stable terminal error.
- Cross-property matrix cho room, tenancy, payer, invoice, receipt va idempotent replay; assert response khong chua ma phong, ten payer, balance hoac invoice number cua property khac.
- Fault injection sau receipt create, sau allocation, sau invoice update, sau credit entry va truoc audit; moi case assert zero partial write.
- Void khi credit chua dung, da dung mot phan, da dung het, invoice da co payment sau va void replay; khong co hard delete, negative balance hay report double-count.
- API/UI/CSV report reconciliation cho receipt thu thang A, allocation vao no thang truoc, credit ap dung thang B va void thang C.
- Audit persistence + append-only va log capture assert khong co notes, payer PII, cookie/token, idempotency key hay raw Prisma error.

### Handoff

- **Da lam:** threat-model va security contract cho preview/create/history/void, FIFO, property isolation, concurrency, audit, PII va reporting.
- **File thay doi:** chi `docs/SECURITY.md`; khong sua schema, API, web hay tests.
- **Rui ro con lai:** ownership ledger theo tenant; void credit da tieu thu; preview stale; race multi-command; report void semantics; CSRF/rate limit truoc public exposure.
- **Remediation owner:** Product + Architecture chot `P6-SEC-003` va report void; Database xu ly `P6-SEC-001`/constraints; Backend xu ly transaction/RBAC/idempotency; QA viet PostgreSQL race/fault/cross-property/reconciliation tests; Security re-review diff.
- **Gate:** khong giao Database/Backend implementation truoc khi ba CODE BLOCKER co contract; khong public release truoc khi moi Critical/High duoc RESOLVED va hai RELEASE BLOCKER pass. Security re-review can evidence migration, API contract, test output, `npm audit --audit-level=high` va self-review diff.

### Re-review implementation P6-004 (2026-07-30)

#### Ket luan

- Pham vi re-review: migration `202607300004_daily_receipts_fifo_ledger`, receipt API, FIFO allocator, preview token, credit application, whole-room workflow, report, UI receipt history va PostgreSQL E2E.
- Ket qua: `P6-SEC-001`, `P6-SEC-002`, `P6-SEC-003`, `P6-SEC-004` va `P6-SEC-007` da co implementation nen tang phu hop contract. Loi confirm `500` QA phat hien truoc do da duoc sua: receipt hien ghi dong thoi `idempotencyKey` va `requestHash` (`apps/api/src/billing/receipt.service.ts:166-179`).
- Security **chua phe duyet public release**. Con `2 High implementation/evidence gates`, `1 Medium privacy gate` va hai residual release blockers `SEC-UX-006`/`SEC-UX-010`.
- Co the tiep tuc nghiem thu noi bo tren du lieu test; khong mo endpoint tai chinh ra Internet cho den khi cac gate ben duoi duoc dong va Security re-review lai.

#### Findings sau implementation

| ID              | Severity | Finding va failure path                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | Remediation bat buoc                                                                                                                                                                                                                                                                                                                        | Status                     |
| --------------- | -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------- |
| `P6-SEC-005-R1` | High     | Confirm tinh request hash tu `{ tenancyId, intent }`, tim replay tai `receipt.service.ts:129-136`, roi moi verify token/actor tai `receipt.service.ts:138-149`. Vi hash khong bind `actorUserId` va replay chay truoc token check, mot actor khac cung property neu co idempotency key va payload co the replay ket qua cua actor goc ma khong can preview token hop le cho minh. Result luu trong `PaymentOperation.resultJson` co the chua payer name, notes va recorded-by. Void co mau replay tuong tu tai `receipt.service.ts:393-410`.                                                                     | Authorization va resource scope phai chay truoc replay. Bind `actorUserId`, `propertyId`, operation, resource ID va normalized intent/reason vao request hash; confirm replay van phai verify token actor binding hoac tra mot response toi thieu khong chua PII. Them PostgreSQL test hai actor cung property dung cung key/payload/token. | **OPEN - RELEASE BLOCKER** |
| `P6-SEC-006-R1` | High     | PostgreSQL suite chi bao phu concurrent create/create. Chua co race create/settlement, create/void, void voi credit da transfer, whole-room transfer source-lot, hay fault injection tai tung write boundary. Void chi lock originating tenancy/payment truoc khi doc cac journal row co the thuoc target tenancy (`receipt.service.ts:412-449`); do do tinh dung cua void dong thoi voi target settlement hien dua vao `Serializable` retry, chua co evidence cho lock/cascade da property va da tenancy. Whole-room transfer cung chua co PostgreSQL P6 test (`tenancy-workflow.service.ts:729-906,952-1033`). | QA bo sung ma tran PostgreSQL race/fault/transfer theo ADR-0003. Backend khoa tat ca affected tenancy theo thu tu ID truoc journal cascade, hoac cung cap bang chung tuong duong rang moi interleaving deu abort/retry an toan; transaction failure phai tra stable conflict va zero partial financial/audit writes.                        | **OPEN - RELEASE BLOCKER** |
| `P6-SEC-008-R1` | Medium   | `GET` history/detail cho VIEWER (`receipt.controller.ts:29,68-85`), nhung mapper tra nguyen `payerTenantName`, `notes`, `recordedByName` va `voidReason` cho moi role (`receipt.service.ts:1015-1023`). Day vuot nguyen tac data minimization va privacy AC da chot. React escape text nen chua thay stored-XSS path, nhung VIEWER van nhan PII/nghi chu khong can thiet qua API.                                                                                                                                                                                                                                | Voi VIEWER, tra `null`/bo payer name, notes, recorded-by va free-text void reason; chi giu receipt number, amount, method, status, period/allocation va so du can cho read-only work. Them API test masking cho list/detail va replay.                                                                                                      | **OPEN - PRIVACY GATE**    |

#### Status cac finding goc

| Finding      | Evidence implementation                                                                                                                                                                                                                                            | Re-review status                       |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------- |
| `P6-SEC-001` | `Payment.tenancyId` bat buoc; journal bat buoc property/tenancy, source-lotted va append-only bang trigger; migration fail-fast neu legacy ownership ambiguous (`migration.sql:20-89,146-282`). Balance derive tu signed journal, khong co mutable balance column. | **RESOLVED**                           |
| `P6-SEC-002` | Confirm/FIFO/credit/invoice/audit chay trong `Serializable`, lock tenancy truoc, retry toi da hai lan sau lan dau; PostgreSQL test partial, multi-invoice, stale va concurrent create/create dat. Evidence concurrency lien workflow con nam o `P6-SEC-006-R1`.    | **RESOLVED WITH FOLLOW-UP**            |
| `P6-SEC-003` | Void OWNER/MANAGER, reason bat buoc, operation idempotent, reversal append-only, rebuild invoice/settlement va audit cung transaction. PostgreSQL test void sau credit da ap vao gross invoice dat; transfer cascade con nam o `P6-SEC-006-R1`.                    | **RESOLVED WITH FOLLOW-UP**            |
| `P6-SEC-004` | HMAC-SHA-256 dung timing-safe compare, TTL nam phut, bind property/tenancy/actor/intent/snapshot; production fail-fast neu thieu secret; stale preview co zero financial writes trong PostgreSQL test.                                                             | **RESOLVED**                           |
| `P6-SEC-005` | Property scope, role, active tenancy/date/payer membership va cross-property negative test dat. Actor-bound replay van mo tai `P6-SEC-005-R1`.                                                                                                                     | **PARTIAL - BLOCKED**                  |
| `P6-SEC-006` | Serializable allocator va create/create race dat; cac interleaving va fault boundary con thieu tai `P6-SEC-006-R1`.                                                                                                                                                | **PARTIAL - BLOCKED**                  |
| `P6-SEC-007` | Report tach `grossBilled`, `cashReceived`, `cashReversed`, `creditApplied`, `netOutstanding`; receipt duong tai paidAt, void am tai voidedAt; PostgreSQL report test xac minh net zero.                                                                            | **RESOLVED**                           |
| `P6-SEC-008` | Validation gioi han notes, audit receipt dung allowlist va khong ghi raw body/token. VIEWER masking con mo tai `P6-SEC-008-R1`.                                                                                                                                    | **PARTIAL - OPEN**                     |
| `P6-SEC-009` | Khong co production Origin/CSRF guard hay rate limit trong phase nay.                                                                                                                                                                                              | **OPEN - `SEC-UX-006` / `SEC-UX-010`** |

#### Evidence da chay

- `npm run test -w @app/api -- src/billing/receipt-allocator.test.ts src/billing/receipt-token.test.ts`: `2` files, `6/6` tests dat.
- `npm run test -w @repo/database -- src/daily-receipts-schema.test.ts`: `1` file, `5/5` tests dat.
- `POSTGRES_DAILY_RECEIPTS=1 npm run test:e2e -- tests/e2e/postgres-daily-receipts.test.ts`: tong `2` files dat, `2` files skip theo feature flag; `10` tests dat, `3` skip. Rieng P6 bao phu FIFO, stale/idempotency, RBAC/property/date/payer, concurrent create/create, settlement-credit-void, report reversal va legacy FIFO.
- `npm audit --audit-level=high`: `0 vulnerabilities`.

#### Handoff

- Backend: dong `P6-SEC-005-R1`, bo sung deterministic multi-tenancy lock/cascade evidence cho `P6-SEC-006-R1`, va mask VIEWER theo `P6-SEC-008-R1`.
- QA: bo sung cross-actor replay, create/settlement, create/void, transferred-credit void, whole-room transfer retry va fault-injection PostgreSQL tests.
- DevOps + Backend: dong `SEC-UX-006` va `SEC-UX-010` truoc public exposure.
- Security: re-review lai ba finding moi va release controls; khong can reopen cac finding da `RESOLVED` neu diff tai chinh khong thay doi.

### Final re-review P6-004 (2026-07-30)

#### Security approval

- **APPROVED cho nghiem thu noi bo va phase release P6-004.** Khong con finding
  Critical/High mo trong pham vi daily receipt, FIFO, credit, history, void va
  whole-room transfer.
- **CHUA APPROVED cho public Internet exposure.** Hai release blocker da duoc
  chuyen sang P7 van giu nguyen: production Origin/CSRF guard
  (`SEC-UX-006`/`P7-SEC-001`) va rate limit + alert cho login/financial mutation
  (`SEC-UX-010`/`P7-SEC-004`).
- Approval nay chi ap dung cho diff P6-004 da review. Thay doi tiep theo vao
  receipt ownership, ledger provenance, transaction boundary, RBAC hoac report
  cash semantics phai Security re-review lai.

#### Closure cua ba finding

| Finding         | Evidence remediation                                                                                                                                                                                                                                                                                                                                                                                                                       | Final status |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------ |
| `P6-SEC-005-R1` | Confirm hash bind `actorUserId` cung normalized intent; void hash bind `actorUserId`, receipt va reason. `PaymentOperation` replay kiem tra dong thoi request hash va `operation.actorUserId`; actor khac cung property/same key bi `409 IDEMPOTENCY_KEY_REUSED`. Property van lay tu authenticated context, khong lay tu body. PostgreSQL test cross-actor dat.                                                                           | **RESOLVED** |
| `P6-SEC-006-R1` | Void chay trong `Serializable`, lock source tenancy/payment, doc source-lotted journal, sau do lock cac related tenancy theo ID truoc reversal; retry serialization bi gioi han ba attempt va moi conflict/constraint rollback atomic. PostgreSQL evidence dat cho receipt/void race, receipt/settlement race, void credit sau whole-room transfer va trigger fault rollback khong con payment/allocation/journal/operation/audit residue. | **RESOLVED** |
| `P6-SEC-008-R1` | `mapReceipt` mask `payerTenantId`, `payerTenantName`, `notes`, `recordedByName` va `voidReason` cho VIEWER. Detail cung tra `recordedByUserId: null` va reversal reason `null`. PostgreSQL list/detail test dat.                                                                                                                                                                                                                           | **RESOLVED** |

#### Evidence final

- Production code reviewed: `apps/api/src/billing/receipt.service.ts` va
  `apps/api/src/billing/receipt.controller.ts`.
- PostgreSQL focused run: `15 passed`, `3 skipped`; toan bo `12/12` P6-004
  scenarios dat. Bao phu actor/PII, receipt-void race, receipt-settlement race,
  void after transfer va journal fault-trigger rollback.
- Lead gate truoc do: root check green; UI audit `6` checks, `0` Axe issue,
  `0` console error va `0` failed network request.
- Dependency gate: `npm audit --audit-level=high` co `0 vulnerabilities`.

#### Residual risk va handoff P7

- Fault injection hien chung minh rollback tai credit-journal boundary, chua co
  test-only failpoint tai tung internal write boundary. Day la test-depth gap,
  khong phai P6 release blocker vi cac write nam trong cung PostgreSQL
  transaction va fault evidence da chung minh zero residue. QA nen mo rong khi
  co repository seam/failpoint an toan.
- Multi-tenancy void co the gap deadlock transient khi hai cascade lock nguoc
  source; `Serializable` bounded retry va atomic rollback la control hien tai.
  DevOps can monitor terminal conflict/deadlock rate sau rollout noi bo.
- Backend + DevOps + Security dong `P7-SEC-001` va `P7-SEC-004`, kem negative
  tests cho Origin/CSRF va stable `429`, truoc public exposure.
