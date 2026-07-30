# Acceptance Criteria

## Rooms

- Given ma phong `A101` da ton tai va dang hoat dong, when chu tro tao phong moi voi ma `A101`, then he thong tu choi va hien loi ma phong bi trung.
- Given phong da co invoice hoac payment, when chu tro yeu cau xoa phong, then he thong khong xoa cung va chi cho phep chuyen sang `retired` neu hop le.
- Given danh sach phong co nhieu trang thai, when chu tro loc theo `occupied`, then chi cac phong dang thue duoc hien thi.
- Given phong khong co tenancy/membership active, when xem danh sach va chi tiet, then trang thai suy ra la `vacant` va UI khong cho chon truc tiep `occupied`.
- Given phong co tenancy va it nhat mot membership active, when xem danh sach va chi tiet, then trang thai suy ra la `occupied` va UI khong cho chon truc tiep `vacant`.
- Given phong dang co nguoi active, when chu tro chuyen phong sang `maintenance` hoac `retired`, then he thong tu choi va khong thay doi du lieu.

## Tenants and tenancies

- Given nguoi thue dang co tenancy active, when chu tro gan nguoi do vao tenancy active khac, then he thong tu choi.
- Given phong dang co tenancy active, when chu tro tao tenancy active moi cho phong do, then he thong tu choi trong MVP.
- Given nguoi thue chuyen phong, when thao tac hoan tat, then lich su phong cu co ngay ket thuc va phong moi co ban ghi tenancy/handover moi.
- Given phong A co dai dien A1 va nguoi o chung A2, when chuyen rieng A2 sang phong B vao ngay D, then chi membership A2 tai phong A ket thuc vao D, tenancy A van active, A1 van la dai dien va khong co settlement/invoice moi cho phong A.
- Given A2 chuyen rieng vao phong B dang trong, when hoan tat, then A2 la dai dien cua tenancy moi tai B; neu B dang co tenancy active, then A2 la nguoi o chung cua B.
- Given phong A co nhieu thanh vien active, when chuyen ca nhom sang phong B, then he thong bat buoc ngay chuyen va chi so ban giao phong A, preview tong chot phong A, tao settlement FINALIZED va invoice truoc khi dong tenancy A/mo tenancy B.
- Given chot phong A hoac mo tenancy B that bai trong chuyen ca nhom, when transaction ket thuc, then khong de lai trang thai nua chuyen va retry khong tao chung tu trung.
- Given A1 la dai dien va A2 la nguoi o chung active cung tenancy, when doi dai dien sang A2, then A2 thanh dai dien, A1 thanh nguoi o chung, tenancy/phong/membership khong doi va khong tao settlement/invoice.
- Given nguoi duoc chon khong active, o phong khac hoac la dai dien hien tai, when yeu cau doi dai dien, then API tu choi va tenancy van co dung mot dai dien.
- Given doi dai dien duoc gui lai cung idempotency key, when request duoc retry, then ket qua van co dung mot dai dien va chi mot audit event nghiep vu.
- Given invoice/settlement da tao voi A1 la payer, when doi dai dien sang A2, then chung tu cu van co payer A1 va chi chung tu tao sau thoi diem hieu luc moi dung A2.

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
- Given chu tro xac nhan `Chot va tao hoa don` cho ky hop le, when request thanh cong, then co dung mot settlement FINALIZED va mot invoice ISSUED co `sourceKey=settlement:<id>`.
- Given cung request chot duoc gui lai voi cung idempotency key/source, when API xu ly lan tiep theo, then tra settlement/invoice da co va khong tao them reading, ledger entry, settlement hay invoice.
- Given settlement da FINALIZED nhung invoice chua duoc tao do loi tam thoi, when chu tro retry, then API tao/tra lai invoice tu settlement cu ma khong finalize settlement lan hai.
- Given nguoi o chung chuyen/roi rieng hoac tenancy doi dai dien, when thao tac hoan tat, then khong tao settlement/invoice va ky dien nuoc cua phong van mo.

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
- Given co phong dang thue chua chot ky hien tai, invoice sap den/den han, cong no qua han hoac settlement FINALIZED chua co invoice, when tai dashboard, then moi truong hop xuat hien dung mot lan trong hang doi phu hop.
- Given nguoi dung mo mot dong trong hang doi, when dieu huong hoan tat, then man hinh dich da chon dung phong/ky/invoice va cho phep xu ly tiep ma khong tim lai thu cong.
- Given dashboard duoc tai voi `asOf` trong thang hien tai, when co invoice/payment/debt, then KPI can thu, da thu, con thu va qua han khop voi invoice/payment/debt API.
- Given co cong no qua han, when xem dashboard, then danh sach can chu y hien phong, nguoi dai dien, so tien va so ngay qua han.
- Given nguoi dung xem bao cao thang, when chon nam/thang, then report hien tong hoa don, da thu, con thu, qua han, tien dien va tien nuoc dung theo invoice/payment trong ky.
- Given nguoi dung tai CSV, when export thanh cong, then file CSV dung filter hien tai va gom dong hoa don/thanh toan.
- Given cell CSV bat dau bang `=`, `+`, `-` hoac `@`, when export, then cell duoc encode an toan de tranh formula injection.

## Daily collections and debt allocation

- Given phong co invoice thang 5 con `300.000` va thang 6 con `400.000`, when ghi receipt `200.000`, then toan bo amount duoc allocate vao thang 5 va thang 5 con `100.000`.
- Given sau receipt truoc phong con no thang 5 `100.000` va thang 6 `400.000`, when ghi receipt `600.000`, then thang 5 va thang 6 duoc tat toan theo FIFO, `100.000` con lai thanh credit tra truoc va receipt history hien du ba allocation/credit outcomes.
- Given phong khong co cong no, when ghi receipt `30.000`, then amount tro thanh credit tra truoc cua tenancy va Chot tien hien balance tang `30.000` ma khong can nhap tay.
- Given credit `260.000` va tong settlement moi `700.000`, when preview/chot, then `260.000` duoc ap vao tong, outstanding la `440.000` va credit da dung khong bi tinh thu hai trong dashboard/bao cao.
- Given credit lon hon tong settlement, when chot, then settlement chi ap toi da bang tong va giu phan du cho ky sau.
- Given dai dien thay doi hoac mot nguoi o chung roi phong, when xem balance, then receipt va credit cua tenancy khong doi.
- Given ca phong chuyen sang phong moi, when settlement phong cu hoan tat, then no cu duoc tru va credit du duoc chuyen sang tenancy dich voi history lien ket.
- Given ket thuc ca phong con credit, when workflow hoan tat, then balance duoc hien la can hoan/doi soat va khong bi xoa.
- Given cung idempotency key va payload duoc gui hai lan, when ghi receipt, then chi co mot receipt, mot tap allocation va mot audit event nghiep vu.
- Given idempotency key da dung nhung amount/method/receivedAt thay doi, when gui lai, then API tu choi bang stable domain error va khong thay doi cong no.
- Given OWNER/MANAGER huy receipt voi ly do, when transaction commit, then tat ca allocation/credit cua receipt duoc dao, invoice outstanding/status duoc tinh lai va receipt chuyen VOIDED; khong record nao bi hard delete.
- Given STAFF hoac VIEWER yeu cau huy receipt, when API authorize, then request bi tu choi va du lieu tai chinh khong doi.
- Given receipt duoc tao cho room/tenancy property khac, amount khong hop le, ngay tuong lai hoac truoc ngay bat dau tenancy, when validate, then API tu choi truoc mutation.
- Given mobile 360/390/430 px, when mo form Thu tien va Lich su thu, then khong overflow/overlap, preview de doc va moi primary target toi thieu 44 x 44 px.

## Security and audit

- Given nguoi dung chua dang nhap, when truy cap trang quan tri, then he thong chuyen den dang nhap hoac tra permission denied.
- Given thao tac quan trong thanh cong, when xem audit log, then log co actor, action, entity, old/new value va timestamp.
- Given nguoi dung dang nhap tren thiet bi dung chung, when dang xuat, then session server-side bi huy, cookie bi xoa va UI chuyen den `/login`.
- Given da dang xuat, when dung nut Back, refresh route quan tri hoac goi API bang session cu, then khong hien du lieu cache nhay cam va API tra `401`/UI chuyen ve login.
- Given production build, when mo trang login, then email/mat khau khong duoc dien san boi credential dev.

## UX, feedback and responsive

- Given mutation dang xu ly, when nguoi dung bam action nhieu lan, then control bi vo hieu hoa/bao loading va backend khong tao ban ghi trung.
- Given mutation thanh cong, when response ve, then UI hien thong bao tieng Viet va cap nhat dung list/detail ma khong can reload thu cong.
- Given validation/conflict nghiep vu, when API tra loi, then UI hien thong bao tieng Viet neu ro van de va cach khac phuc; khong hien message tieng Anh tho nhu thong bao chinh.
- Given gia tri tien, dien va nuoc, when hien thi tren list/form/detail, then dung lan luot VND, VND/kWh, VND/m3; request gui server van la gia tri so khong kem ky tu format.
- Given viewport 360, 390 hoac 430 px tren cac route `/`, `/rooms`, `/tenants`, `/utilities`, `/invoices`, `/debts`, `/reports`, `/settings`, when trang tai xong, then `scrollWidth <= clientWidth + 2`, khong co control/text chong lap va target chinh toi thieu 44 x 44 px.
- Given bang/list duoc hien tren mobile, when mot record co nhieu cot, then moi gia tri van co nhan gan ke va action cua record khong bi tach khoi context.
- Given row dang selected tren Phong/Nguoi thue, when form detail hien thi, then heading, mode va du lieu form cung tro den record do; khi tao moi thi khong row nao bi selected.
