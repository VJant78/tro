# Acceptance Criteria

## Rooms

- Given ma phong `A101` da ton tai va dang hoat dong, when chu tro tao phong moi voi ma `A101`, then he thong tu choi va hien loi ma phong bi trung.
- Given phong da co invoice hoac payment, when chu tro yeu cau xoa phong, then he thong khong xoa cung va chi cho phep chuyen sang `retired` neu hop le.
- Given danh sach phong co nhieu trang thai, when chu tro loc theo `occupied`, then chi cac phong dang thue duoc hien thi.

## Tenants and tenancies

- Given nguoi thue dang co tenancy active, when chu tro gan nguoi do vao tenancy active khac, then he thong tu choi.
- Given phong dang co tenancy active, when chu tro tao tenancy active moi cho phong do, then he thong tu choi trong MVP.
- Given nguoi thue chuyen phong, when thao tac hoan tat, then lich su phong cu co ngay ket thuc va phong moi co ban ghi tenancy/handover moi.

## Billing period

- Given tenancy tra theo ngay co `paidUntil` hien tai, when invoice tien phong duoc thanh toan du N chu ky, then `paidUntil` tang N ngay.
- Given tenancy tra theo tuan co `paidUntil` hien tai, when invoice tien phong duoc thanh toan du N chu ky, then `paidUntil` tang N x 7 ngay.
- Given tenancy tra theo thang voi `billingAnchorDay` la 31, when thanh toan cac chu ky qua thang 2 va thang 3, then ngay ket qua dung chuoi ngay neo 31 voi fallback ngay cuoi thang.
- Given invoice tien phong moi thanh toan mot phan, when payment duoc ghi nhan, then invoice cap nhat so da thanh toan/con no va `paidUntil` khong doi.
- Given cung idempotency key duoc gui lai, when API ghi nhan thanh toan nhan request lan hai, then he thong tra ve ket qua idempotent va khong tao payment/tang `paidUntil` lan hai.

## Utility readings

- Given chi so moi nho hon chi so cu, when chu tro luu chi so, then he thong tu choi tru khi co nghiep vu thay dong ho/quay vong duoc thiet ke.
- Given da co reading chinh thuc cho phong va ky `2026-08`, when chu tro tao reading chinh thuc thu hai, then he thong tu choi.
- Given reading duoc sua va invoice lien quan chua khoa, when luu thay doi, then invoice lien quan duoc danh dau can tinh lai hoac tinh lai theo quy tac.
- Given chu tro nhap chi so dien/nuoc hop le, when luu reading, then he thong tinh usage bang chi so moi tru chi so cu va tinh tien theo gia effective tai ngay chot.

## Monthly and move-out settlement

- Given phong co tenancy active tu `2026-08-01`, gia phong `3,100,000`, reading thang 8 da finalized va khong co tra truoc, when chu tro chot thang `2026-08`, then settlement gom tien phong tron thang, tien dien, tien nuoc va khong tao ban ghi trung cho cung phong/tenancy/ky.
- Given nguoi thue vao ngay `2026-08-16`, gia phong `3,100,000`, when chot thang `2026-08`, then tien phong duoc tinh `16 / 31` ngay va dien nuoc tinh theo reading tu ngay vao den `2026-08-31`.
- Given nguoi thue tra phong ngay `2026-08-15`, gia phong `3,100,000`, when chu tro nhap reading tra phong va chot tra phong, then tien phong duoc tinh `15 / 31` ngay va settlement duoc tao ngay, khong doi den cuoi thang.
- Given phong co tien tra truoc `2,000,000` va tong tien ky la `1,665,000`, when chot settlement, then he thong tru toi da `1,665,000` vao tong tien ky va luu `335,000` lam so du chuyen ky sau.
- Given tien tra truoc nho hon tong tien ky, when chot settlement, then he thong ghi so tien con phai thu trong settlement nhung chua bat buoc xu ly cong no chi tiet o phase nay.
- Given settlement da finalized, when chu tro gui lai thao tac chot cung phong/tenancy/period/type, then he thong khong tao ban ghi duplicate va tra ve loi/conflict hoac ket qua idempotent theo contract duoc chon.
- Given settlement/reading duoc tao, sua, finalize hoac void, when xem audit log, then co log actor, action, entity id, old/new value va timestamp.

## Utility invoice job

- Given cron tao hoa don dien nuoc chay cho ky `2026-08`, when chay lan dau, then moi phong co tenancy active va du dieu kien co toi da mot invoice.
- Given cron duoc chay lai cho cung ky, when unique key da ton tai, then he thong khong tao invoice trung va ghi ket qua idempotent.

## Invoices and payments

- Given discount lon hon tong tien truoc giam, when tao invoice, then tong tien cuoi duoc chan ve khong am hoac request bi tu choi theo quy tac da chon.
- Given invoice da `paid`, when chu tro sua truc tiep item, then he thong tu choi va yeu cau tao dieu chinh.
- Given payment bi huy, when huy thanh cong, then payment doi trang thai, audit log duoc ghi va `paidUntil` duoc tinh lai tu du lieu hop le.

## Debts and dashboard

- Given phong co invoice qua han chua thanh toan du, when xem trang cong no, then phong hien tong no, loai no, hoa don cu nhat va so ngay qua han.
- Given invoice con outstanding va due date da qua, when goi `GET /debts?status=OVERDUE`, then response gom cong no do voi `daysOverdue > 0`.
- Given invoice da thu mot phan, when goi `GET /debts?status=PARTIALLY_PAID`, then response gom cong no do va invoice detail co payment allocation history.
- Given nguoi dung thu nhanh tu man hinh cong no, when payment hop le duoc ghi nhan, then outstanding va debt summary giam ngay.
- Given so tien thu nhanh lon hon outstanding, when submit payment, then API tra validation error va khong tao allocation.
- Given dashboard duoc tai, when co phong chua ghi chi so thang hien tai, then canh bao phong chua ghi chi so duoc hien thi.
- Given dashboard duoc tai voi `asOf` trong thang hien tai, when co invoice/payment/debt, then KPI can thu, da thu, con thu va qua han khop voi invoice/payment/debt API.
- Given co cong no qua han, when xem dashboard, then danh sach can chu y hien phong, nguoi dai dien, so tien va so ngay qua han.

## Security and audit

- Given nguoi dung chua dang nhap, when truy cap trang quan tri, then he thong chuyen den dang nhap hoac tra permission denied.
- Given thao tac quan trong thanh cong, when xem audit log, then log co actor, action, entity, old/new value va timestamp.
