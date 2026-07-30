# P6-005 Security Review

## Ket luan

- Pham vi: invoice detail/list, utility snapshot va legacy fallback, report theo phong/ky, deep-link va print tu trinh duyet.
- Trang thai P6-005: **APPROVED FOR PHASE RELEASE** trong bien gioi nghiem thu/noi bo hien tai.
- Khong co public invoice link, signed share link hay PDF server-side trong P6-005.
- Public Internet exposure van bi chan rieng boi `P7-SEC-001` va `P7-SEC-004`; hai blocker nay khong lam mo lai P6-005.

## Final release re-review - 2026-07-30

### Release decision

- **APPROVED FOR P6-005 PHASE RELEASE**.
- Tat ca `P6-005-SEC-001..006` duoc danh dau **RESOLVED** theo diff hien tai va evidence moi da cung cap.
- Evidence gate: API app `20/20`; Web invoice `3/3`, gom VIEWER khong thay payment form; PostgreSQL P6-005 `4/4`; build dat; visual invoices/reports desktop/mobile co `0` Axe, `0` overflow, `0` console error va `0` failed request; print da duoc inspect.

### Final finding status

| ID               | Status       | Final evidence                                                                                                                                                                                                                                                                           |
| ---------------- | ------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `P6-005-SEC-001` | **RESOLVED** | Invoice list/detail/source lookup lay property tu authenticated context; PostgreSQL chung minh unknown va cross-property invoice/room cung tra `404`, khong mo duong IDOR qua deep-link hoac fallback.                                                                                   |
| `P6-005-SEC-002` | **RESOLVED** | `roomId` duoc validate va scope server-side; PostgreSQL chung minh JSON va CSV dung room/billing period, room unknown/cross-property tra `404`; cac nhanh invoice/payment/debt/credit va totals trong code deu giu cung property/room filter.                                            |
| `P6-005-SEC-003` | **RESOLVED** | Legacy fallback chi dung settlement/reading finalized lien ket va khop room, tenancy, period, year/month; PostgreSQL chung minh valid hydrate, mismatch khong hydrate va read fingerprint bat bien. Typed legacy unit price lay tu finalized reading, amount/total hoa don van bat bien. |
| `P6-005-SEC-004` | **RESOLVED** | GET va direct invoice creation deu tra read DTO allowlist; PostgreSQL chung minh typed electricity/water va khong lo raw metadata/pricing marker. UI chi dung typed utility fields va React render text an toan.                                                                         |
| `P6-005-SEC-005` | **RESOLVED** | `GET /auth/me` cung cap role tu authenticated session; VIEWER van xem/in nhung khong thay payment form/action, trong khi backend mutation tiep tuc bi RBAC gioi han. Deep-link loi xoa detail cu; visual va print inspection dat.                                                        |
| `P6-005-SEC-006` | **RESOLVED** | Report loai DRAFT, giu CANCELLED de doi soat nhung khong cong vao totals hieu luc; read/report/CSV/print khong mutation read models, duoc chung minh boi PostgreSQL fingerprint invariant.                                                                                               |

### Residuals khong chan Security release

1. Monthly report hien gioi han response bang `limit` sau khi tai tap du lieu da scope theo property, room va ky. Day la residual **performance/query efficiency**, khong phai cross-property data exposure hay P6-005 security release blocker trong bien gioi hien tai.
2. Khi toi uu sau nay, can tach aggregate query cho totals khoi pagination cua danh sach. Khong ap `limit` vao tap tinh totals neu viec do lam tong bao cao chi phan anh trang dau; review nay khong yeu cau thay doi totals dang dung.
3. Hai blocker ha tang P7 ve Origin/CSRF va rate limiting/monitoring van bat buoc truoc public Internet exposure.

### Final handoff

- **Da lam:** Re-review diff va evidence P6-005; dong sau finding, phan loai residual query limit va ra release decision.
- **File thay doi:** Chi `docs/reviews/P6-005-SECURITY-REVIEW.md`.
- **Cach kiem tra:** Doi chieu implementation voi API `20/20`, Web `3/3`, PostgreSQL `4/4`, build va visual/print evidence da cung cap.
- **Rui ro con lai:** Query report co the can toi uu khi du lieu lon; khong phai security blocker. Public exposure van phu thuoc P7.
- **Viec con lai:** Lead co the dong P6-005 va chuyen phase; DevOps/Security xu ly P7 truoc public release.
- **Agent tiep theo:** Lead Agent.

## Superseded implementation re-review - 2026-07-30

> Phan ben duoi la snapshot truoc khi co PostgreSQL, VIEWER, visual va build evidence moi. Quyet dinh authoritative la `Final release re-review` o tren.

### Release decision

- Trang thai: **NOT APPROVED FOR RELEASE**.
- Review duoc handoff tai snapshot implementation hien tai, khong cho QA va khong suy dien tu test plan chua duoc thi hanh.
- Typecheck API/Web dat. Focused evidence dat: API `1 passed, 19 skipped`; Web `3 passed` tren hai file invoice/report.
- Chua co PostgreSQL evidence rieng cho P6-005, do do khong finding nao duoc nang thanh `RESOLVED`.

### Finding status hien tai

| ID               | Status      | Evidence va gap con lai                                                                                                                                                                                                                                                                                                                                                                                     |
| ---------------- | ----------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `P6-005-SEC-001` | **PARTIAL** | Prisma invoice list/detail/source-key va in-memory invoice repository deu scope bang `propertyId` tu session; detail ngoai scope duoc map thanh `404`. Legacy fallback bat dau tu invoice va room da scope. Chua co PostgreSQL cross-property matrix cho bon read roles, missing-ID equivalence va fallback lien ket sang property B.                                                                       |
| `P6-005-SEC-002` | **PARTIAL** | `roomId` duoc validate UUID, room duoc resolve trong property, va invoice/payment/credit/debt cung nhan room filter; CSV goi lai cung monthly report. Tuy nhien `limit` chi cat mang response: report khong truyen `limit` vao `listInvoices`, con Prisma `listPayments` khong co `take`, nen database van co the tai khong gioi han du lieu cua ky. Chua co PostgreSQL scope/totals/CSV evidence.          |
| `P6-005-SEC-003` | **PARTIAL** | Fallback chi parse source key server-side, yeu cau settlement/reading `FINALIZED`, `finalizedAt`, lien ket reading truc tiep va khop room, tenancy, period, year/month; amount van lay tu invoice item. Chua co PostgreSQL evidence cho deleted/void/draft, mismatch, ambiguity, cross-property va chung minh fallback khong ghi nguoc invoice.                                                             |
| `P6-005-SEC-004` | **PARTIAL** | GET list/detail/report dung typed allowlist va focused API test xac nhan detail khong tra `propertyId`, `sourceKey`, `pricingSnapshot` hay item `metadata`. Tuy nhien `POST /invoices/from-settlement` van tra raw `InvoiceRecord`, gom `sourceKey`, `pricingSnapshot`, `notes` va item `metadata`; monthly debt DTO van giu `payerTenantId`. Chua co seeded PII/XSS/CSV/print evidence.                    |
| `P6-005-SEC-005` | **OPEN**    | Backend gioi han POST invoice/payment cho OWNER/MANAGER/STAFF; print chi dung authenticated DOM, nut print bi disable khi detail chua tai va UI xoa detail cu truoc request. Regression blocking: `InvoicesPage` khong nhan role va luon render form cung nut `Ghi nhận thanh toán`, nen VIEWER van thay mutation control du backend se tra `403`. Chua co VIEWER component/E2E va backend negative matrix. |
| `P6-005-SEC-006` | **PARTIAL** | Report loai DRAFT khoi danh sach, giu CANCELLED trong danh sach nhung loai khoi totals/debts; cac endpoint review la GET va print CSS an form/action. Chua co focused/PostgreSQL test cho DRAFT, CANCELLED, inactive room va hash/count bat bien cua invoice/item/reading/settlement/payment/allocation/ledger truoc-sau read/report/CSV/print.                                                             |

### Regression va must-fix truoc re-review

1. An mutation form/action tren trang Hoa don doi voi VIEWER; giu backend `403` va them negative test.
2. Dung read DTO allowlist cho response tao hoa don, hoac dinh nghia mutation DTO toi thieu khong chua raw metadata/pricing/source/notes; bo internal ID khong can thiet khoi report DTO.
3. Ap dung `limit` tai Prisma query cho invoices va payments cua report; khong chi `slice()` sau khi tai toan bo.

### PostgreSQL evidence con bat buoc

1. OWNER/MANAGER/STAFF/VIEWER property A goi list/detail/report/CSV voi invoice, room, settlement va reading cua B: detail/resource tra `404` cung shape nhu UUID khong ton tai; list/report/CSV khong lo record, metadata, PII hay ID cua B.
2. Seed P1/P2 property A va P1 property B cung ky, kem payment, debt, credit, DRAFT, CANCELLED va inactive room; xac minh tung mang va moi total dung chung property/room/year/month filter. CSV phai khop JSON.
3. Seed legacy valid, missing, draft, deleted/void, sai room/tenancy/period/year/month va lien ket khong duy nhat; chi case valid duoc hydrate, amount/total bat bien va khong co database write.
4. Seed raw metadata, pricing snapshot, notes, phone, identity number, address va payload XSS/formula; xac minh GET/report/CSV/DOM/print chi co allowlist va log/error khong chua payload.
5. Chup hash/count invoice, item, reading, settlement, payment, allocation va ledger truoc/sau detail/report/CSV/print; tat ca phai khong doi.
6. Sau khi sua query bound, seed vuot `limit` va dung Prisma query capture hoac tuong duong de chung minh SQL invoice/payment co gioi han; response khong lap, mat hoac tron room.

### Final handoff

- **Da lam:** Final security review tren diff hien tai; cap nhat trang thai tung `SEC-001..006`, regression blocking va evidence con thieu.
- **File thay doi:** Chi `docs/reviews/P6-005-SECURITY-REVIEW.md`.
- **Cach kiem tra:** Doc code controller/service/Prisma/in-memory/UI va focused tests; chay API/Web typecheck, API focused va Web focused.
- **Rui ro:** Khong co PostgreSQL P6-005 evidence; release chua duoc phe duyet. Hai blocker P7 ve CSRF/Origin va rate limiting van giu nguyen.
- **Viec con lai:** Backend/Frontend sua ba must-fix tren; QA cung cap dung PostgreSQL/UI evidence da liet ke; Security re-review sau cung.
- **Agent tiep theo:** Lead Agent dieu phoi Backend, Frontend va QA; Security la gate cuoi.

## Trust boundaries va control hien tai

- `RbacGuard` xac thuc cookie session va gan `userId`, `role`, `propertyId` tu session do server cap; controller billing cho phep OWNER, MANAGER, STAFF va VIEWER doc invoice/report.
- Prisma invoice list/detail hien gio loc dong thoi `propertyId: authorizedPropertyId()` va `deletedAt: null`. Invoice ngoai property duoc map thanh `InvoiceNotFoundException` (`404`).
- Query invoice hien validate UUID, nam va thang. Tuy nhien monthly report chua co `roomId`/pagination va invoice DTO hien con tra raw `pricingSnapshot`, item `metadata`, internal IDs va `notes`.
- In-memory repository chua scope `findInvoiceById`/`findInvoiceBySourceKey` theo property; test double nay co the che mat regression IDOR neu tiep tuc duoc dung.

## Must-fix findings

| ID               | Severity | Finding / failure path                                                                                                                                                                                                                                              | Remediation va acceptance test bat buoc                                                                                                                                                                                                                                                                                                                                                                                                                   | Status       |
| ---------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------ |
| `P6-005-SEC-001` | High     | Direct-link, invoice list/detail hoac legacy fallback co the thanh IDOR neu bat ky nhanh truy van nao chi dung `invoiceId`, `settlementId` hoac `utilityReadingId` ma khong rang buoc property cua session. Test double hien co doc invoice theo ID ma khong scope. | Tat ca invoice list/detail va fallback phai lay `propertyId` duy nhat tu authenticated request context, khong nhan tu body/query. Prisma va in-memory repository phai cung mot contract. User property A truy cap invoice ton tai cua B va UUID khong ton tai deu nhan cung `404`/error shape, khong lo room code, invoice number, payer, period hay property ID.                                                                                         | **MUST FIX** |
| `P6-005-SEC-002` | High     | Report them `roomId` co the loc invoice theo room nhung van tong hop payment/debt/credit cua ca property, hoac doc room ngoai property. CSV co the dung filter khac UI/API.                                                                                         | Validate `roomId` la UUID va xac minh room thuoc property trong cung server-side scope. Room ngoai property hoac khong ton tai phai co response khong phan biet, uu tien `404` theo brief. Moi nhanh invoice, payment, debt, credit, total va CSV phai dung cung property/room/year/month filter. `Tat ca phong` van chi tra property hien tai. Them pagination/limit co gioi han; khong tai vo han.                                                      | **MUST FIX** |
| `P6-005-SEC-003` | High     | Legacy fallback co the gan nham reading cua tenancy khac cung phong/thang, reading draft/void/deleted, hoac reading cua property khac; day la loi toan ven chung tu va ro ri du lieu.                                                                               | Fallback chi duoc di theo lien ket server-side duy nhat `invoice -> settlement/source -> finalized utility reading`, dong thoi khop property, room, tenancy, period, billing year/month va `deletedAt = null`. Khong nhan reading ID tu client. Neu thieu, ambiguous, void/deleted hoac mismatch thi tra trang thai `Khong co du lieu chi so`, khong doan, khong ghi nguoc invoice. Amount/total luon lay tu invoice snapshot, khong tinh lai tu reading. | **MUST FIX** |
| `P6-005-SEC-004` | Medium   | Invoice DTO hien tra raw `pricingSnapshot`, raw item `metadata`, source/internal IDs va free-text notes cho moi read role. Metadata hoac notes co the chua PII/noi dung noi bo va bi dua vao API, report, DOM hoac ban in.                                          | Tao read DTO allowlist co typed utility fields: previous/current/quantity/unit/unitPrice/amount. Khong tra raw metadata/pricing blob, source key, CCCD, phone, address, token, audit data hay internal linkage khong can thiet. Ten payer chi duoc giu vi brief yeu cau va phai la snapshot can thiet. React/print phai render text an toan; payload nhu `<img onerror=...>` khong duoc thuc thi.                                                         | **MUST FIX** |
| `P6-005-SEC-005` | Medium   | VIEWER duoc doc/in theo brief, nhung UI co the de lo mutation action; print/deep-link co the vo tinh goi lai API mutation hoac in du lieu cu sau loi authorization.                                                                                                 | OWNER/MANAGER/STAFF/VIEWER chi duoc GET list/detail/report va in. VIEWER khong thay mutation controls va moi POST/PATCH lien quan van `403`. Nut in chi bat sau khi detail authenticated tai dung invoice da tai; print dung chinh authorized DOM, khong fetch public endpoint, khong nhung cookie/token/payload vao URL. Loi/401/404 phai xoa du lieu cu va khong cho in.                                                                                | **MUST FIX** |
| `P6-005-SEC-006` | Medium   | Report lich su co nguy co sai tinh toan neu loai invoice CANCELLED khoi danh sach thay vi chi loai khoi tong, hoac dua DRAFT vao ket qua.                                                                                                                           | Danh sach tra invoice da phat hanh, gom CANCELLED de doi soat va loai DRAFT. CANCELLED khong duoc cong vao tong hieu luc. Invoice inactive room van doc duoc trong dung property. Xem/in khong duoc mutation invoice, settlement, reading, payment, allocation hoac ledger.                                                                                                                                                                               | **MUST FIX** |

## Security test gate

1. **Authentication:** khong cookie, cookie sai va cookie het han khi GET invoice list/detail/report/CSV deu tra `401`; response khong chua du lieu invoice.
2. **Cross-property matrix:** voi OWNER, MANAGER, STAFF va VIEWER property A, thu invoice ID, room ID, settlement/reading linkage cua B tren list, detail, report, CSV va legacy fallback. Detail/resource-specific response phai `404`; response va log khong lo metadata cua B.
3. **Room report scope:** P1/P2 trong property A va P1 trong property B, cung thang. Chon tung room chi tra dung invoice va moi total/payment/debt/credit cua room do; `Tat ca phong` chi tra A. CSV va UI dung cung filter; pagination khong lap/mat record.
4. **Legacy ambiguity:** cung room/thang co hai tenancy/readings, reading DRAFT, void/deleted, khac period va amount mismatch. Moi case khong duoc gan nham; invoice amount/total bat bien va missing state ro rang.
5. **DTO/PII:** seed raw metadata, pricing snapshot, notes, phone, identity number, address va chuoi XSS. API/report/DOM/print chi chua allowlist; khong co script execution, secret/internal ID hoac PII ngoai payer name can thiet.
6. **RBAC va print:** bon read roles xem/in duoc invoice trong property. VIEWER POST/PATCH bi `403` va khong co mutation action. `window.print` chi goi sau detail `200`; detail `401/404/500` khong in DOM cu/rong.
7. **Regression/immutability:** hash/count invoice, item, reading, settlement, payment, allocation va ledger truoc/sau list/detail/report/print phai khong doi. CANCELLED co trong danh sach nhung khong vao total; DRAFT khong xuat hien.

## Approval conditions

Security chi phe duyet P6-005 khi:

- Sau implementation, tat ca finding `P6-005-SEC-001` den `P6-005-SEC-006` co evidence test va duoc Security re-review thanh `RESOLVED`.
- API contract dung typed allowlist, co pagination, documented `401`/`404` semantics va khong co public/share URL.
- PostgreSQL integration tests bao phu cross-property invoice/report/fallback; khong chi dua vao in-memory tests.
- UI test va print review chung minh authenticated DOM dung invoice, khong PII/metadata ngoai contract va khong mutation.
- `lint`, `typecheck`, unit/integration/E2E lien quan va dependency audit dat; log/error khong chua invoice payload hay PII.

## P7 blockers rieng

Hai blocker ha tang da hoan sang P7 van giu nguyen va khong duoc tinh la da dong boi review nay:

- `P7-SEC-001`: production Origin/CSRF protection va negative tests.
- `P7-SEC-004`: rate limiting + monitoring/alert cho login va financial mutation, voi response `429` on dinh.

P6-005 co the nghiem thu noi bo sau khi dong must-fix, nhung **khong duoc public Internet exposure** truoc khi hai blocker P7 duoc Security re-review va phe duyet.

## Handoff

- **Da lam:** Review read-only threat model cho IDOR/direct-link, invoice list/detail, report `roomId`, legacy reading fallback, metadata/PII, print, RBAC va regression.
- **File thay doi:** Chi `docs/reviews/P6-005-SECURITY-REVIEW.md`; khong sua application code, schema, test hay spec khac.
- **Cach kiem tra:** Doi chieu brief/UX P6-005 voi global RBAC/session context, Prisma property scope, billing controller/service/repository, invoice DTO va monthly report/CSV hien tai.
- **Rui ro/gia dinh:** Implementation P6-005 chua bat dau; approval hien tai chi la approval co dieu kien cho contract, khong phai release approval.
- **Viec con lai:** Architecture/Backend/Database chot typed snapshot va scoped fallback/report contract; Frontend chi render authorized DTO/DOM; QA viet PostgreSQL cross-property, legacy ambiguity, PII va print tests; Security re-review diff va evidence.
- **Agent tiep theo:** Architecture Agent, sau do Backend/Database; QA va Security la quality gate cuoi.
