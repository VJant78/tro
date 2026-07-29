# Product Brief: He thong quan ly va tinh tien phong tro

## Problem

Chu tro hoac nguoi quan ly phong tro thuong phai theo doi phong, nguoi thue, tien phong, tien dien nuoc, cong no va lich su thanh toan bang so tay hoac bang tinh. Cach lam nay de sai so lieu, kho truy vet giao dich, de tao hoa don trung, kho xu ly thanh toan mot phan va kho biet phong nao dang no hoac sap den han.

He thong can giam thao tac lap lai, giu lich su tai chinh day du va uu tien tinh dung dan cua du lieu tien/phong/nguoi thue.

## Goals

- Quan ly phong, nguoi thue va lan thue theo lich su ro rang.
- Ghi nhan chi so dien nuoc va tao hoa don dinh ky khong trung.
- Ghi nhan thanh toan, thanh toan mot phan, cong no va lich su giao dich co truy vet.
- Tinh ngay da thanh toan den cho tien phong theo ngay, tuan, thang bang quy tac nhat quan.
- Hoat dong tot tren desktop va mobile cho chu tro.
- Tao nen tang de sau nay bo sung nhan vien, phan quyen, bao cao nang cao va tu dong hoa.

## Success metrics

- Chu tro co the tao phong, gan nguoi thue, tao hoa don va ghi nhan thanh toan trong mot luong E2E hoan chinh.
- Khong tao duoc 2 phong dang hoat dong trung ma phong.
- Khong tao duoc 2 hoa don dien nuoc cung phong, cung ky, cung loai.
- Gui lai request thanh toan voi cung idempotency key khong lam tang `paidUntil` lan thu hai.
- Hoa don thanh toan mot phan van giu dung so tien con no va khong tang `paidUntil` neu tien phong chua du.

## Non-goals

- Khong xay dung ung dung mobile native trong MVP.
- Khong tich hop thanh toan ngan hang tu dong trong MVP.
- Khong tu dong chia tien dien nuoc theo ngay khi phong doi nguoi thue giua thang; MVP cho phep chia thu cong va ghi chi so ban giao.
- Khong ho tro multi-property phuc tap, ke toan thue, hoa don dien tu phap ly hoac ky hop dong dien tu trong MVP.
- Khong cho phep xoa cung du lieu da co lich su tai chinh.

## Users

- Chu tro/quan ly: quan ly phong, nguoi thue, gia, chi so, hoa don, thanh toan, cong no, dashboard va bao cao.
- Nhan vien quan ly: chua nam trong MVP, nhung he thong can thiet ke de co the bo sung phan quyen sau.

## Assumptions

- MVP co mot nhom nguoi dung dang nhap la chu tro/quan ly.
- Don vi tien te mac dinh la VND.
- Tien duoc luu bang integer theo don vi nho nhat hoac decimal tuy ORM/DB, tuyet doi khong dung floating-point.
- `paidUntil` la moc thoi gian exclusive.
- Mui gio he thong mac dinh can cau hinh, de xuat `Asia/Ho_Chi_Minh`.
- Hoa don da khoa/da hoan tat chi duoc sua thong qua nghiep vu dieu chinh.

## Core Scope

- Dashboard tong quan va canh bao.
- Quan ly phong.
- Quan ly nguoi thue.
- Quan ly tenancy/lap lich su thue.
- Cau hinh gia tien phong, dien, nuoc va phi.
- Ghi nhan chi so dien nuoc.
- Tao hoa don tien phong va hoa don dien nuoc.
- Ghi nhan thanh toan, thanh toan mot phan, huy/hoan tac co audit.
- Theo doi cong no.
- Bao cao co xuat CSV.
- Audit log cac thao tac quan trong.

## Data and privacy

- Du lieu nhay cam: CCCD/giay to tuy than, anh giay to, so dien thoai, dia chi, thong tin lien he khan cap.
- Du lieu tai chinh: hoa don, thanh toan, cong no, dieu chinh, lich su giao dich.
- Du lieu phai duoc phan quyen, khong ghi vao log, khong dua vao frontend bundle neu khong can.
- Anh giay to neu ho tro upload phai co kiem soat loai file, kich thuoc, quyen truy cap va chinh sach xoa.
- Audit log phai uu tien bat bien hoac kho sua tuy y.

## Risks / Open questions

- Chu du an can xac nhan co can quan ly nhieu khu tro/properties trong MVP hay chi mot co so.
- Can xac nhan co upload anh giay to trong MVP hay de sau.
- Can xac nhan quy tac lam tron tien, ngay chot dien nuoc va ngay den han mac dinh.
- Can xac nhan co cho phep thanh toan du/thua tien hay khong.
- Can xac nhan stack cuoi cung truoc Phase 2.
