# P6-005 Database Review

## Pham vi

- Review read-only Prisma schema hien tai va DDL migration da co cho `Invoice`, `InvoiceItem`, `Settlement` va `UtilityReading`.
- Khong chay DDL/DML, khong sua `packages/database/**` va khong backfill du lieu.
- Muc tieu: xac dinh P6-005 co bat buoc thay doi schema, migration hoac index hay khong.

## Ket luan

**P6-005 khong can schema change, migration hoac backfill. Index hien tai du cho phase nay.** Schema hien tai du de trien khai theo huong:

1. Hoa don moi snapshot chi so dien/nuoc vao `InvoiceItem.metadata` khi tao invoice.
2. Bao cao loc hoa don bang cac cot san co `Invoice.propertyId`, `roomId`, `billingYear`, `billingMonth`, `status` va pagination.
3. Hoa don cu chi fallback read-only qua settlement/utility reading khi Backend chung minh duoc lien ket duy nhat, dung pham vi va dung ky.
4. Khong viet lai item, amount, total, settlement hay utility reading cua hoa don lich su.

Quyet dinh nay uu tien tinh bat bien cua lich su tai chinh va tranh migration khong can thiet. Composite index invoice theo ky chi la muc can theo doi khi volume tang; phai do bang `EXPLAIN (ANALYZE, BUFFERS)` va so luong ban ghi truoc khi bo sung.

## InvoiceItem.metadata

`InvoiceItem.metadata Json?` la diem mo rong phu hop cho snapshot tien ich, khong can them cot:

- Item `ELECTRICITY`/`WATER` luu toi thieu `utilityReadingId`, `previousReading`, `currentReading`, `usage` va `unit` theo contract co version.
- `quantity`, `unitPrice` va `amount` cua invoice item tiep tuc la snapshot tai chinh chinh thuc. UI khong tinh lai `amount` tu metadata hoac gia cau hinh hien tai.
- Metadata chi duoc doc cung cac item cua mot invoice; index `invoice_items(invoice_id)` hien co phu hop. Khong can GIN/JSON index vi P6-005 khong loc hay tong hop theo khoa trong metadata.
- Backend phai validate hinh dang metadata theo `itemType`; khong coi JSON tuy y la du lieu dang tin cay.
- Sau khi invoice phat hanh, metadata tien ich phai duoc xem la bat bien giong cac snapshot tai chinh khac.

Nen dat `schemaVersion: 1` trong metadata de ho tro tien hoa contract ma khong phai rewrite du lieu cu. Day la thay doi du lieu luc tao invoice, khong phai thay doi database schema.

## Settlement.utilityReadingId va legacy fallback

`Settlement.utilityReadingId` da la nullable foreign key den `UtilityReading.id`, nen co the ho tro fallback hoa don cu ma khong can them quan he moi. Tuy nhien:

- Cot nay khong `@unique`; mot utility reading co the duoc tham chieu boi nhieu settlement. Khong duoc suy dien rang reading dau tien tim thay la reading cua invoice.
- Khong co direct foreign key tu `Invoice` den `Settlement` hoac `UtilityReading`. Backend chi fallback khi xac dinh duoc settlement nguon cua invoice mot cach duy nhat, sau do kiem tra cung `roomId`, `tenancyId` neu co, ky/period tuong thich, reading `FINALIZED` va chua bi xoa/void.
- Neu co 0 hoac nhieu lien ket hop le, API tra trang thai thieu chi so legacy; khong gan gia tri `0` va khong doan du lieu.
- Foreign key dich `utility_readings(id)` da duoc bao ve boi primary-key index. Cot `settlements.utility_reading_id` khong co index rieng, nhung P6-005 khong can inverse lookup dien rong tu reading sang settlement. Vi vay chua can index moi.
- Bat ke reading fallback cho thay gi, `InvoiceItem.amount`, `Invoice.totalAmount`, `paidAmount` va `outstandingAmount` van la gia tri chung tu; khong tinh lai va khong ghi de.

## Danh gia index

### Da phu hop

- `utility_readings(room_id, billing_year, billing_month)`: khop truy van tim reading theo phong va ky.
- `settlements(room_id, billing_year, billing_month)`: khop buoc doi chieu settlement theo phong va ky.
- `invoice_items(invoice_id)`: khop truy van tai chi tiet cac dong cua mot invoice.
- `invoices(room_id, status)`: huu ich khi nguoi dung chon mot phong va Backend loai `DRAFT`/loc trang thai.
- Primary key `invoices(id)` va unique `invoices(invoice_number)`: du cho link chi tiet on dinh va tra cuu theo identity.

### Chua toi uu tuyet doi nhung khong bat buoc migration

Schema chua co composite index `invoices(room_id, billing_year, billing_month)`; cung chua co index bat dau bang `property_id` cho truy van `Tat ca phong` theo ky. Do do:

- Chon mot phong co the dung prefix `room_id` cua index `(room_id, status)`, sau do loc nam/thang tren tap invoice cua phong do.
- `Tat ca phong` theo property/ky co the phai scan nhieu invoice hon khi du lieu tang.
- Pagination bat buoc va quy mo invoice theo tung property hien tai giu rui ro o muc chap nhan duoc cho P6-005.

Khong them index theo suy doan. Sau khi co query Backend cuoi cung, can thu tren du lieu dai dien. Chi mo migration rieng neu execution plan cho thay sequential scan/latency khong dat SLO. Candidate khi do la index co thu tu bat dau bang scope va ky, vi du `(property_id, billing_year, billing_month, room_id, id)`; can review them dieu kien status/sort truoc khi chot de tranh index thua.

## Khong backfill va khong rewrite lich su

- Khong backfill `InvoiceItem.metadata` tu pricing config hien tai, vi gia va reading hien tai khong phai snapshot tai thoi diem phat hanh.
- Khong backfill bang phep tru suy dien tu reading gan nhat.
- Khong cap nhat invoice/settlement/reading khi nguoi dung xem, loc, mo link hoac in hoa don.
- Legacy fallback la response-time read model; no khong duoc persist nguoc vao chung tu.
- Neu du lieu cu mo ho, UI hien `Khong co du lieu chi so cho hoa don cu` va van hien amount goc.

## Rui ro va guardrails

- JSON metadata khong co database-level shape constraint; Backend validation va test contract la bat buoc.
- `billingMonth` tren `Invoice` nullable; truy van bao cao theo thang phai yeu cau bang thang cu the, khong gom invoice `NULL` vao ket qua thang.
- Fallback co nguy co gan nham reading neu chi match bang room/thang. Bat buoc them tenancy, period, source relation va trang thai finalized; ket qua phai duy nhat.
- Moi truy van phai scope bang `propertyId` truoc khi tra du lieu; `roomId` khong thay the property authorization.

## Handoff

- **Da lam:** Review schema/migration read-only va chot khong can schema, migration, index moi hay backfill cho P6-005.
- **File thay doi:** `docs/reviews/P6-005-DATABASE-REVIEW.md`.
- **Cach kiem tra:** Doi chieu Prisma schema voi migration DDL; chay format va `git diff --check` cho file review.
- **Rui ro/gia dinh:** Quy mo invoice hien tai du nho de pagination va index hien co dap ung. Can do execution plan neu du lieu tang; legacy fallback chi an toan khi lien ket duy nhat.
- **Viec con lai:** Backend Agent chot metadata contract, query report va guard fallback; QA Agent test ambiguity/no-backfill; Security Agent review property scope va link invoice.
- **Agent tiep theo:** Backend Agent, sau do QA va Security.
