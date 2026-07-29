# Business Rules

## Phong

- Hai phong dang hoat dong khong duoc trung ma phong trong cung property.
- Phong co giao dich, tenancy, invoice hoac payment khong duoc xoa cung.
- Phong dung hoat dong bang soft delete hoac trang thai `retired`.
- Trang thai toi thieu: `vacant`, `occupied`, `maintenance`, `retired`.
- Gia thue mac dinh cua phong khong duoc am.

## Nguoi thue va tenancy

- Mot phong co the co nhieu nguoi thue.
- Mot nguoi thue chi co mot tenancy dang hoat dong tai mot thoi diem.
- Mot phong chi co mot tenancy dang hoat dong tai mot thoi diem trong MVP.
- Khi chuyen phong phai dong lich su phong cu, tao lich su phong moi va ghi audit log.
- Tenancy luu gia thue tai thoi diem bat dau de khong mat lich su khi phong doi gia.

## Chu ky tien phong

- Ho tro `daily`, `weekly`, `monthly`.
- Chu ky thang khong duoc quy doi co dinh thanh 30 ngay.
- `paidUntil` la moc exclusive.
- Thanh toan mot phan khong tang `paidUntil` cho den khi invoice tien phong duoc thanh toan du.
- Khi huy thanh toan, phai tinh lai `paidUntil` tu invoice/payment hop le thay vi sua truc tiep tuy y.

## Gia dien nuoc va phi

- Thu tu uu tien gia khi tao invoice:
  1. Gia da luu tren invoice.
  2. Gia rieng cua tenancy.
  3. Gia rieng cua phong.
  4. Gia mac dinh he thong.
- Khi tao invoice, gia ap dung phai duoc snapshot vao invoice item.
- Gia dien, gia nuoc va phi khong duoc am.

## Chi so dien nuoc

- Chi so moi khong duoc nho hon chi so cu, tru khi co nghiep vu thay dong ho/quay vong duoc ghi nhan rieng.
- Khong tao hai ban ghi chi so chinh thuc cho cung phong va cung ky.
- Sua chi so phai ghi audit log.
- Neu invoice lien quan chua khoa, co the tinh lai; neu da khoa, phai tao dieu chinh.

## Hoa don

- Hoa don co the gom tien phong, dien, nuoc, rac, internet, dich vu, phu thu, giam gia, dieu chinh va no cu.
- Tong tien cuoi khong duoc am.
- Giam gia khong duoc lam tong tien cuoi nho hon 0.
- Trang thai toi thieu: `draft`, `issued`, `partially_paid`, `paid`, `overdue`, `cancelled`.
- Hoa don dinh ky phai idempotent va co unique constraint theo phong/tenancy/ky/loai phu hop.

## Thanh toan

- Moi lan thanh toan tao mot payment record rieng.
- Payment can co idempotency key hoac ma giao dich duy nhat.
- Gui lai cung request khong duoc ghi nhan trung va khong tang `paidUntil` hai lan.
- MVP co the gioi han mot payment cho mot invoice, nhung database nen co `payment_allocations` de mo rong.
- Khong xoa cung payment; huy/hoan tac bang trang thai va audit log.

## Cong no

- Cong no lay tu invoice chua thanh toan het.
- Can tach no tien phong, dien, nuoc va phi khac.
- Muc canh bao toi thieu: sap den han, den han hom nay, qua han, qua han nghiem trong.

## Audit log

- Bat buoc log: phong, nguoi thue, chuyen phong, doi gia, chi so, invoice, payment, huy payment, dieu chinh no, cau hinh.
- Audit log luu actor, action, entity, entity id, old value, new value, thoi gian va IP neu co.
