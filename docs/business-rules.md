# Business Rules

## Phong

- Hai phong dang hoat dong khong duoc trung ma phong trong cung property.
- Phong co giao dich, tenancy, invoice hoac payment khong duoc xoa cung.
- Phong dung hoat dong bang soft delete hoac trang thai `retired`.
- Trang thai toi thieu: `vacant`, `occupied`, `maintenance`, `retired`.
- Gia thue mac dinh cua phong khong duoc am.

## Nguoi thue va tenancy

- Mot phong co the co nhieu nguoi thue.
- Nguoi dau tien duoc dua vao phong trong se la nguoi dai dien.
- Nguoi them sau vao phong dang co tenancy active la nguoi o chung.
- Mot nguoi thue chi co mot active room membership tai mot thoi diem.
- Mot phong chi co mot tenancy dang hoat dong tai mot thoi diem trong MVP.
- Khi chuyen phong phai chuyen ca nhom active sang phong moi, giu nguyen vai tro dai dien/o chung, dong lich su phong cu, tao lich su phong moi va ghi audit log.
- Nguoi o chung co the roi phong hoac chuyen rieng sang phong khac; membership cu duoc dong bang ngay roi/chuyen.
- Neu chuyen mot nguoi sang phong trong, nguoi do tro thanh dai dien phong moi; neu phong dich da co dai dien, nguoi do la nguoi o chung.
- Dai dien khong duoc roi phong hoac chuyen rieng khi phong con nguoi o chung; can flow doi dai dien rieng truoc.
- Ket thuc tenancy hien ket thuc ca nhom thue.
- Tenancy luu gia thue tai thoi diem bat dau de khong mat lich su khi phong doi gia.

## Chu ky tien phong

- Ho tro `daily`, `weekly`, `monthly`.
- Chu ky thang khong duoc quy doi co dinh thanh 30 ngay.
- `paidUntil` la moc exclusive.
- Thanh toan mot phan khong tang `paidUntil` cho den khi invoice tien phong duoc thanh toan du.
- Khi huy thanh toan, phai tinh lai `paidUntil` tu invoice/payment hop le thay vi sua truc tiep tuy y.

## Gia dien nuoc va phi

- Gia phong mac dinh duoc quan ly tai tab Phong va snapshot vao tenancy khi bat dau thue.
- UI Cai dat chi quan ly mot global config cho gia dien, gia nuoc, rac, internet, phi dich vu, ngay chot, ngay den han, tien te va timezone.
- Thu tu uu tien gia khi tao invoice:
  1. Gia da luu tren invoice.
  2. Gia rieng cua tenancy.
  3. Gia rieng cua phong.
  4. Gia rieng cua property/nha tro.
  5. Gia mac dinh he thong.
- Khi tao invoice, gia ap dung phai duoc snapshot vao invoice item.
- Gia dien, gia nuoc va phi khong duoc am.
- Cau hinh gia active khong duoc overlap effective period tren cung scope/target.

## Chi so dien nuoc

- Chi so moi khong duoc nho hon chi so cu, tru khi co nghiep vu thay dong ho/quay vong duoc ghi nhan rieng.
- Khong tao hai ban ghi chi so chinh thuc cho cung phong va cung ky.
- Sua chi so phai ghi audit log.
- Neu invoice lien quan chua khoa, co the tinh lai; neu da khoa, phai tao dieu chinh.

## Chot tien thang va tra phong

- Tien phong, tien dien va tien nuoc cua phong dang thue duoc chot vao cuoi thang theo ky thang.
- Neu nguoi thue vao phong giua thang, tien phong thang dau duoc tinh theo so ngay o tu ngay vao phong den cuoi thang; dien nuoc tinh theo chi so tu luc vao den cuoi thang.
- Neu nguoi thue tra phong giua thang, chu tro phai nhap chi so dien nuoc tai thoi diem tra phong va chot tien ngay cho giai doan tu dau thang den ngay tra phong.
- So ngay tinh tien phong la so ngay thuc te trong thang, khong quy doi co dinh thanh 30 ngay.
- Tien da tra truoc trong thang duoc tru vao tong tien cua ky do, gom tien phong, dien va nuoc.
- Neu tien da tra truoc lon hon tong tien phai thu, phan du duoc luu thanh so du chuyen sang ky sau.
- Neu tien da tra truoc nho hon tong tien phai thu, he thong ghi nhan so con phai thu; module cong no chi tiet co the xu ly o phase sau.

## Hoa don

- Hoa don co the gom tien phong, dien, nuoc, rac, internet, dich vu, phu thu, giam gia, dieu chinh va no cu.
- Tong tien cuoi khong duoc am.
- Giam gia khong duoc lam tong tien cuoi nho hon 0.
- Trang thai toi thieu: `draft`, `issued`, `partially_paid`, `paid`, `overdue`, `cancelled`.
- Hoa don dinh ky phai idempotent va co unique constraint theo phong/tenancy/ky/loai phu hop.
- Hoa don tao tu ky chot tien da FINALIZED dung source key `settlement:<id>` de khong tao trung.
- Hoa don Phase 5 gom tien phong da prorate, tien dien, tien nuoc va dong giam tru tien tra truoc neu co.

## Thanh toan

- Moi lan thanh toan tao mot payment record rieng.
- Payment can co idempotency key hoac ma giao dich duy nhat.
- Gui lai cung request khong duoc ghi nhan trung va khong tang `paidUntil` hai lan.
- MVP co the gioi han mot payment cho mot invoice, nhung database nen co `payment_allocations` de mo rong.
- Khong xoa cung payment; huy/hoan tac bang trang thai va audit log.
- Thanh toan mot phan cap nhat invoice sang `partially_paid`; thanh toan du cap nhat sang `paid`.
- Khong cho thanh toan vuot outstanding trong MVP.

## Cong no

- Cong no lay tu invoice chua thanh toan het.
- Can tach no tien phong, dien, nuoc va phi khac.
- Muc canh bao toi thieu: sap den han, den han hom nay, qua han, qua han nghiem trong.
- Phase 5 tong hop cong no theo phong va nguoi dai dien; detail nang cao theo tuoi no/loai phi o Phase 6.
- Phase 6.1 cho phep loc cong no theo phong, nguoi dai dien va trang thai aging. Thanh toan nhanh tu man hinh cong no phai di qua payment API, van bi chan overpay va van ghi audit log.

## Audit log

- Bat buoc log: phong, nguoi thue, chuyen phong, doi gia, chi so, invoice, payment, huy payment, dieu chinh no, cau hinh.
- Audit log luu actor, action, entity, entity id, old value, new value, thoi gian va IP neu co.
