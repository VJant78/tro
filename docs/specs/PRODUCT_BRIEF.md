# Product Brief: He thong quan ly va tinh tien phong tro

## Problem

Chu tro can mot he thong tap trung de quan ly phong, nguoi thue, tenancy, dien nuoc, hoa don, thanh toan va cong no. Cach quan ly thu cong de sai so lieu tai chinh, mat lich su, kho truy vet va de tao trung hoa don/giao dich.

## Goal

Xay dung website de chu tro quan ly van hanh nha tro tren desktop va mobile, voi du lieu tai chinh dung, co audit log, co idempotency va co nen tang mo rong cho nhan vien/phan quyen sau nay.

Metric thanh cong:

- Tao duoc luong phong -> nguoi thue -> tenancy -> invoice -> payment.
- Khong tao duoc phong active trung ma.
- Khong tao duoc invoice utility trung ky.
- Retry payment cung idempotency key khong tao payment/tang `paidUntil` lan hai.
- Partial payment giu dung outstanding va khong tang `paidUntil`.

## Non-goals

- Khong code application trong Phase 1.
- Khong mobile native app.
- Khong thanh toan ngan hang tu dong trong MVP.
- Khong tenant self-service portal trong MVP.
- Khong tu dong chia tien dien nuoc theo ngay khi doi nguoi thue giua thang trong MVP.
- Khong hard delete du lieu tai chinh.

## Users

- Chu tro/quan ly: user chinh trong MVP.
- Nhan vien: future-ready, chua can workflow day du trong MVP.
- Nguoi thue: la doi tuong du lieu, chua dang nhap trong MVP.

## User stories

- As a chu tro, I want quan ly phong theo trang thai, so that toi biet phong nao trong, dang thue, bao tri hoac ngung su dung.
- As a chu tro, I want quan ly nguoi thue va lich su thue, so that toi tra cuu duoc thong tin va qua trinh o.
- As a chu tro, I want tao tenancy rieng cho moi lan thue, so that lich su gia va nguoi o khong bi ghi de.
- As a chu tro, I want nhap chi so dien nuoc theo thang, so that he thong tinh tien theo tieu thu thuc te.
- As a chu tro, I want tao invoice va ghi nhan payment, so that cong no va lich su thanh toan duoc theo doi.
- As a chu tro, I want dashboard va trang cong no, so that toi uu tien viec nhac no va van hanh.
- As a chu tro, I want audit log, so that toi truy vet thao tac quan trong.

## Acceptance criteria

- Given ma phong dang hoat dong da ton tai, when tao hoac doi phong khac sang ma do, then he thong tu choi.
- Given phong co giao dich tai chinh, when yeu cau xoa, then he thong khong hard delete.
- Given tenant dang co tenancy active, when gan vao tenancy active khac, then he thong tu choi.
- Given room dang co tenancy active, when tao tenancy active moi cho room do, then he thong tu choi trong MVP.
- Given invoice tien phong thanh toan du, when payment hop le duoc confirm, then invoice thanh paid va `paidUntil` tang dung chu ky.
- Given invoice tien phong thanh toan mot phan, when payment duoc confirm, then outstanding giam va `paidUntil` khong doi.
- Given cung idempotency key duoc gui hai lan, when confirm payment lan hai, then khong tao payment trung va khong tang `paidUntil` lan hai.
- Given chi so moi nho hon chi so cu, when luu reading, then he thong tu choi.
- Given utility invoice job chay lai cung ky, when invoice da ton tai, then khong tao invoice trung.
- Given thao tac tai chinh quan trong thanh cong, when xem audit log, then co actor, action, entity, old/new value va timestamp.

## UX states

- Loading: skeleton va disabled submit.
- Empty: thong diep theo ngu canh va CTA phu hop.
- Error: loi gan voi form/data/action.
- Success: thong bao ngan va cap nhat UI.
- Permission denied: khong hien du lieu nhay cam, giai thich ngan gon.

## Data and privacy

- PII: ho ten, SDT, dia chi, CCCD, ngay/noi cap, lien he khan cap.
- Document image neu co la du lieu Critical va can private storage.
- Finance data: invoice, payment, debt, adjustment.
- Audit logs/backups/logs van hanh can phan quyen va redaction.
- Khong commit secret hoac du lieu that.

## Technical constraints

- Monorepo JS/TS.
- Web khong truy cap database truc tiep.
- API enforce authz/validation.
- PostgreSQL transaction va unique constraints cho finance.
- Tien khong dung floating-point.
- `paidUntil` exclusive.
- Timezone cau hinh, de xuat `Asia/Ho_Chi_Minh`.
- Payment va monthly invoice job idempotent.

## Risks / Open questions

- MVP co can multi-property/multi-owner khong?
- Co luu anh giay to trong MVP khong?
- Co cho overpayment/tien du khong?
- Hoa don tien phong tao thu cong, tu dong hay ca hai?
- Staff roles chi tiet co nam trong MVP khong?
