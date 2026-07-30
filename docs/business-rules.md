# Business Rules

## Phong

- Hai phong dang hoat dong khong duoc trung ma phong trong cung property.
- Phong co giao dich, tenancy, invoice hoac payment khong duoc xoa cung.
- Phong dung hoat dong bang soft delete hoac trang thai `retired`.
- Trang thai toi thieu: `vacant`, `occupied`, `maintenance`, `retired`.
- `vacant` va `occupied` la trang thai suy ra tu tenancy/membership active, khong cho nguoi dung sua truc tiep.
- Phong co tenancy va it nhat mot membership active la `occupied`; phong khong co tenancy/membership active la `vacant`.
- Chi phong `vacant` moi duoc chuyen sang `maintenance` hoac `retired`. Khong duoc dua phong dang co nguoi o vao bao tri/ngung dung neu chua ket thuc hoac chuyen het nguoi.
- Gia thue mac dinh cua phong khong duoc am.

## Nguoi thue va tenancy

- Mot phong co the co nhieu nguoi thue.
- Nguoi dau tien duoc dua vao phong trong se la nguoi dai dien.
- Nguoi them sau vao phong dang co tenancy active la nguoi o chung.
- Mot nguoi thue chi co mot active room membership tai mot thoi diem.
- Mot phong chi co mot tenancy dang hoat dong tai mot thoi diem trong MVP.
- Chuyen mot nguoi o chung chi dong membership cua nguoi do tai phong cu. Tenancy, nguoi dai dien va ky tinh tien cua phong cu tiep tuc; khong tao settlement hay invoice cho phong cu.
- Chuyen ca nhom active phai chot phong cu den ngay chuyen, dong tenancy/membership phong cu, sau do tao tenancy/membership phong moi va giu nguyen vai tro dai dien/o chung.
- Nguoi o chung co the roi phong rieng; thao tac chi dong membership cua nguoi do va khong chot phong neu van con nguoi active.
- Neu chuyen mot nguoi sang phong trong, nguoi do tro thanh dai dien phong moi; neu phong dich da co dai dien, nguoi do la nguoi o chung.
- Dai dien khong duoc roi phong hoac chuyen rieng khi phong con nguoi o chung; can flow doi dai dien rieng truoc.
- Doi nguoi dai dien chi duoc chon mot nguoi o chung active trong cung tenancy. Nguoi moi thanh dai dien, nguoi cu thanh nguoi o chung; khong dong membership, khong tao tenancy moi va khong chot tien.
- Moi tenancy active phai co dung mot nguoi dai dien active. Thao tac doi dai dien phai atomic, idempotent va ghi audit log nguoi cu, nguoi moi, thoi diem hieu luc.
- Settlement, invoice va payment da tao truoc thoi diem doi dai dien giu nguyen payer cu. Payer moi chi ap dung cho chung tu tao sau thoi diem doi.
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
- Chuyen ca nhom hoac ket thuc tenancy giua thang chi hoan tat sau khi co reading ban giao hop le, settlement FINALIZED va invoice duoc tao thanh cong cho phong cu.
- Chuyen mot nguoi o chung hoac doi nguoi dai dien khong dong ky dien nuoc, khong prorate tien phong va khong tao settlement/invoice cho phong cu.
- Primary action cuoi thang/tra phong la `Chot va tao hoa don`: tao dung mot settlement FINALIZED va dung mot invoice ISSUED tu settlement do.
- Gui lai cung yeu cau `Chot va tao hoa don` phai tra lai ket qua da co, khong tao them reading, settlement, invoice hoac ledger entry.
- Neu settlement da FINALIZED nhung tao invoice that bai do loi tam thoi, ky duoc danh dau `chua co hoa don`; retry chi tao/tra lai invoice tu settlement cu, khong chot lai.

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

## Thu tien nhieu lan va tra truoc

- Chu tro co the ghi nhan nhieu lan thu voi amount khong co dinh; day la receipt thuc te, khong phai lich tra gop bat buoc.
- Moi receipt gan voi property, room va tenancy active. Nguoi nop co the la dai dien/nguoi o chung, nhung cong no va credit thuoc tenancy cua phong.
- Receipt tu dong phan bo vao invoice con no theo FIFO: ky cu nhat, han thu som nhat, ngay tao som nhat.
- Mot receipt co the thanh toan mot phan hoac nhieu invoice. Phan vuot tong no tro thanh credit tra truoc.
- Credit tra truoc duoc ap vao tong settlement tiep theo gom tien phong, dien, nuoc va phi; phan du chuyen ky sau.
- Tab Chot tien khong nhan tong tra truoc bang tay sau khi feature duoc migrate; gia tri la balance server tinh va read-only.
- Dashboard/bao cao ghi receipt mot lan theo ngay thu; allocation va credit application khong duoc tinh thu lan hai.
- Doi dai dien hoac mot nguoi o chung roi/chuyen phong khong lam thay doi receipt/credit cua tenancy cu.
- Chuyen ca phong chot no phong cu truoc va chuyen credit du sang tenancy moi; ket thuc ca phong giu credit du o trang thai can hoan/doi soat.
- Receipt da confirm khong duoc hard delete/sua truc tiep. Huy receipt can OWNER/MANAGER, ly do, dao allocations/credit va audit atomic.
- Create/huy receipt phai idempotent; cung key khac payload bi tu choi.

## Cong no

- Cong no lay tu invoice chua thanh toan het.
- Can tach no tien phong, dien, nuoc va phi khac.
- Muc canh bao toi thieu: sap den han, den han hom nay, qua han, qua han nghiem trong.
- Phase 5 tong hop cong no theo phong va nguoi dai dien; detail nang cao theo tuoi no/loai phi o Phase 6.
- Phase 6.1 cho phep loc cong no theo phong, nguoi dai dien va trang thai aging. Thanh toan nhanh tu man hinh cong no phai di qua payment API, van bi chan overpay va van ghi audit log.

## Dashboard

- Dashboard la tong quan van hanh theo thang cua ngay `asOf`.
- `Can thu thang nay` lay tu tong invoice khong bi huy co `billingYear/billingMonth` trung thang hien tai.
- `Da thu thang nay` lay tu payment `CONFIRMED` co ngay thu trong thang hien tai.
- `Con thu thang nay` lay tu outstanding cua invoice trong thang hien tai.
- Danh sach can chu y uu tien cong no qua han, sap xep theo so ngay qua han va so tien con thu.
- Dashboard la hang doi cong viec, toi thieu gom: phong chua chot ky hien tai, hoa don sap den han/den han, cong no qua han va ky da chot nhung chua co hoa don.
- Moi dong can xu ly phai co phong, ky/ngay lien quan, trang thai, so tien neu co va action dua nguoi dung den dung man hinh voi filter/context da chon.

## Dang nhap va phien lam viec

- Form dang nhap production khong dien san mat khau hay credential mau.
- Dang xuat phai huy session server-side, xoa cookie phien va chuyen nguoi dung ve trang dang nhap.
- Sau khi dang xuat, refresh, nut Back hoac goi lai API bang session cu khong duoc truy cap du lieu quan tri.

## Quy tac UX van hanh

- Menu desktop/mobile dung cung nhom chuc nang; mobile khong duoc gay cuon ngang o viewport 360, 390 va 430 px.
- Action chi hien khi hop le voi vai tro va trang thai: nguoi o chung co action ca nhan; dai dien co action ca nhom va doi dai dien.
- Mutation phai co loading, ngan submit lap, thong bao thanh cong va loi nghiep vu tieng Viet co huong xu ly.
- Tien hien thi theo VND; gia dien theo VND/kWh; gia nuoc theo VND/m3. Client gui gia tri so sach, khong gui chuoi da format.
- Tren mobile, bang du lieu phai giu lien ket nhan-gia tri va target cham toi thieu 44 x 44 px.
- ID ky thuat/UUID khong hien tren man hinh chinh khi da co ma phong, ten nguoi thue hoac so chung tu de nhan biet.

## Bao cao

- Bao cao thang gom invoice phat sinh theo `billingYear/billingMonth` va payment co ngay thu nam trong thang do.
- Tong dien/nuoc trong bao cao lay tu invoice item da phat hanh, khong tinh truc tiep lai tu reading de tranh lech so lieu sau khi hoa don da tao.
- CSV export phai dung cung filter voi man hinh bao cao.
- CSV export phai encode cell de giam rui ro spreadsheet formula injection.

## Audit log

- Bat buoc log: phong, nguoi thue, chuyen phong, doi gia, chi so, invoice, payment, huy payment, dieu chinh no, cau hinh.
- Audit log luu actor, action, entity, entity id, old value, new value, thoi gian va IP neu co.
