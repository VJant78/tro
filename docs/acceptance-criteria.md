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

## Utility invoice job

- Given cron tao hoa don dien nuoc chay cho ky `2026-08`, when chay lan dau, then moi phong co tenancy active va du dieu kien co toi da mot invoice.
- Given cron duoc chay lai cho cung ky, when unique key da ton tai, then he thong khong tao invoice trung va ghi ket qua idempotent.

## Invoices and payments

- Given discount lon hon tong tien truoc giam, when tao invoice, then tong tien cuoi duoc chan ve khong am hoac request bi tu choi theo quy tac da chon.
- Given invoice da `paid`, when chu tro sua truc tiep item, then he thong tu choi va yeu cau tao dieu chinh.
- Given payment bi huy, when huy thanh cong, then payment doi trang thai, audit log duoc ghi va `paidUntil` duoc tinh lai tu du lieu hop le.

## Debts and dashboard

- Given phong co invoice qua han chua thanh toan du, when xem trang cong no, then phong hien tong no, loai no, hoa don cu nhat va so ngay qua han.
- Given dashboard duoc tai, when co phong chua ghi chi so thang hien tai, then canh bao phong chua ghi chi so duoc hien thi.

## Security and audit

- Given nguoi dung chua dang nhap, when truy cap trang quan tri, then he thong chuyen den dang nhap hoac tra permission denied.
- Given thao tac quan trong thanh cong, when xem audit log, then log co actor, action, entity, old/new value va timestamp.
