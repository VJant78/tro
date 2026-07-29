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
