# UI/UX Spec — Phase 1

## Scope

Thiet ke website quan ly va tinh tien phong tro cho chu tro/quan ly. Phase 1 chi mo ta sitemap, user flow, responsive behavior, UI states, accessibility, canh bao cong no va confirm thao tac nguy hiem.

## Sitemap

- Dang nhap.
- Dashboard.
- Phong tro: danh sach, tao, sua, chi tiet.
- Nguoi thue: danh sach, tao, sua, chi tiet.
- Hop dong/lan thue: danh sach, tao, chi tiet, chuyen phong, ket thuc thue.
- Dien nuoc: nhap chi so, lich su chi so, cau hinh gia.
- Hoa don: danh sach, chi tiet, tao/phat hanh/khoa/huy.
- Thanh toan: ghi nhan, chi tiet giao dich, huy/hoan tac.
- Cong no: danh sach phong no, chi tiet cong no phong.
- Bao cao: doanh thu, cong no, dien nuoc tieu thu, lich su thanh toan, ty le phong trong, export CSV.
- Audit log.
- Cai dat he thong.

## Main user flows

### Dang nhap

Nguoi dung nhap thong tin dang nhap. Neu thanh cong, chuyen den Dashboard. Neu sai, hien loi trong form va khong tiet lo tai khoan co ton tai hay khong.

### Tao phong

Tu danh sach phong, chon tao phong, nhap ma phong, ten/so phong, khu day, loai phong, trang thai, gia thue, chu ky, so nguoi toi da va ghi chu. Sau khi luu, hien thong bao thanh cong va chuyen den chi tiet phong hoac danh sach.

### Gan nguoi thue vao phong

Tu chi tiet phong hoac nguoi thue, tao tenancy voi ngay bat dau, chu ky thanh toan, gia tai thoi diem thue, tien coc, nguoi dai dien va danh sach nguoi o. Khi luu thanh cong, phong thanh `occupied`.

### Nhap chi so dien nuoc

Nguoi dung chon ky, khu/phong, nhap chi so moi. UI hien chi so cu, tinh tieu thu va thanh tien. Loi chi so moi nho hon chi so cu hien tai truong nhap.

### Tao hoa don

Nguoi dung tao invoice tien phong hoac dien nuoc, kiem tra dong tien, phi, giam gia, no cu va due date. Invoice co the o `draft` truoc khi phat hanh. Invoice da khoa/paid chi cho thao tac adjustment/huy theo quyen.

### Ghi nhan thanh toan

Tu chi tiet invoice, cong no hoac phong, nguoi dung nhap so tien, phuong thuc, thoi gian va noi dung. Neu thanh toan du invoice tien phong, UI hien `paidUntil` du kien truoc khi xac nhan.

### Theo doi cong no

Trang cong no hien phong no, nguoi thue dai dien, so dien thoai, tong no, loai no, invoice cu nhat, so ngay qua han va thao tac xem chi tiet/ghi nhan thanh toan.

## Responsive layout

### Desktop

- App shell gom sidebar trai, top bar va content.
- Sidebar nhom navigation theo nghiep vu.
- List page dung table voi search, filter bar, sort, pagination va row actions.
- Detail page dung 2 cot: cot chinh cho du lieu nghiep vu, cot phu cho trang thai, canh bao, thao tac nhanh va metadata.

### Mobile

- Top bar + bottom navigation hoac drawer.
- Table chuyen thanh list/card co thong tin chinh, status va mot thao tac uu tien.
- Filter dung bottom sheet/drawer.
- Form mot cot, input lon, thu tu theo tan suat su dung.
- Thao tac nguy hiem dat sau menu phu hoac confirm step.

## UI states

- Loading: skeleton cho dashboard/list/detail; submit button disabled khi dang xu ly.
- Empty: co thong diep theo ngu canh va CTA hop ly.
- Error: form error gan voi input; data load error co retry; financial error noi ro ly do.
- Success: thong bao ngan va cap nhat du lieu tai cho.
- Permission denied: khong hien du lieu nhay cam phia sau; control disabled kem ly do co the doc duoc.

## Debt alerts

- Sap den han: con 1-3 ngay.
- Den han hom nay.
- Qua han: qua han tu 1 ngay.
- Qua han nghiem trong: qua han tu 7 ngay hoac vuot nguong tien cau hinh.

Canh bao khong chi dung mau sac. Moi canh bao can nhan chu, icon, so ngay qua han va so tien con no.

## Dangerous action confirmation

Bat buoc confirm cho:

- Huy hoa don.
- Huy giao dich thanh toan.
- Chuyen phong sang ngung su dung.
- Ghi nhan nguoi thue roi phong.
- Chuyen nguoi thue sang phong khac.
- Sua chi so da dung de tao hoa don.
- Khoa/mo khoa hoa don.
- Xoa mem du lieu van hanh.

Voi thao tac tai chinh, yeu cau nhap ly do. Voi thao tac rui ro cao, can xac nhan bang ma phong/ma hoa don.

## Accessibility

- Semantic HTML, heading dung cap, label ro cho moi input.
- Ho tro keyboard navigation va focus state ro.
- Contrast dat WCAG AA.
- Khong truyen dat trang thai chi bang mau.
- Form error lien ket voi input cho screen reader.
- Action label ro: vi du `Xem chi tiet phong A101`, khong chi `Xem`.

## Non-goals

- Chua chot branding/pixel-perfect.
- Chua thiet ke tenant self-service.
- Chua thiet ke phan quyen nhan vien chi tiet.
- Khong code frontend trong Phase 1.
