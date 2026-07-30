# Product Brief: Thu tien va phan bo cong no

## Trang thai

- Phase: `P6-004` / Phase 6.4.
- Requirements: Frozen ngay 30/07/2026.
- Implementation: Chua bat dau.
- Risk: Critical vi tac dong payment, cong no, so du tra truoc, dashboard va bao cao.

## Van de

Mot so phong nop tien thanh nhieu lan trong thang, vi du moi ngay `30.000 VND` hoac sau bay ngay nop `200.000 VND`. Hien tai chu tro chi nhap mot tong `Da tra truoc` khi chot tien, nen khong truy vet duoc ngay thu, so tien tung lan, hinh thuc, nguoi nop va cach khoan thu duoc tru vao cong no.

## Muc tieu

Cho phep chu tro ghi nhan moi lan thu tien cua mot phong dang thue va tu dong:

1. Tru vao hoa don/cong no cu nhat chua thanh toan theo FIFO.
2. Chuyen phan con lai thanh so du tra truoc cua lan thue.
3. Tu dong ap dung so du tra truoc khi chot ky tiep theo.
4. Giu lich su day du de doi chieu va hoan tac sai sot ma khong hard delete.

## Nguoi dung va pham vi

- OWNER, MANAGER va STAFF duoc ghi nhan thu tien trong property duoc cap quyen.
- Chi OWNER va MANAGER duoc huy/dao mot lan thu da ghi nhan.
- Khoan thu gan voi phong va tenancy dang active; nguoi nop la thong tin bo sung, khong phai chu so huu so du.

## Luong chinh

1. Tai chi tiet Phong dang thue, chu tro bam `Thu tien`.
2. Form mac dinh phong/tenancy hien tai va thoi gian hien tai; nguoi dung nhap so tien, hinh thuc, nguoi nop tuy chon va ghi chu.
3. He thong preview cach phan bo: tung hoa don cu theo thu tu cu nhat, sau do phan du thanh tra truoc.
4. Nguoi dung xac nhan mot lan; he thong luu receipt, allocations, so du va audit trong cung transaction.
5. UI cap nhat cong no ngay lap tuc va hien receipt trong lich su cua phong.
6. Khi chot tien, `Da thu truoc` la read-only va tu dong lay so du chua su dung; khong cho nhap tong bang tay.

## Quy tac phan bo

- Chi phan bo vao invoice khong bi huy va con outstanding.
- Thu tu la ky cu nhat truoc; neu cung ky thi invoice co han thu som hon, sau do ngay tao som hon.
- Mot receipt co the phan bo vao nhieu invoice.
- Neu receipt nho hon no cu nhat, invoice do duoc thanh toan mot phan.
- Neu receipt lon hon tong cong no, phan du la credit tra truoc.
- Credit tra truoc duoc ap vao tong tien cua settlement tiep theo, khong chi rieng tien phong.
- Neu credit lon hon tong ky, phan du tiep tuc chuyen ky sau.
- Tien duoc ghi nhan dung mot lan theo ngay thu trong dashboard/bao cao; viec phan bo hoac ap credit sau do khong duoc tinh thu lan hai.

## Vi du chuan

Phong 1 no thang 5 la `300.000 VND`, thang 6 la `400.000 VND`:

- Thu `200.000 VND`: thang 5 con `100.000 VND`.
- Thu tiep `500.000 VND`: tat toan `100.000 VND` thang 5 va `400.000 VND` thang 6.
- Neu thu `600.000 VND` khi tong no la `500.000 VND`: tat toan no va luu `100.000 VND` lam tra truoc.

Lich su receipt `600.000 VND` phai hien duoc ba ket qua: tru thang 5, tru thang 6 va chuyen so du tra truoc.

## Chuyen, doi dai dien va tra phong

- Doi dai dien: receipt va credit van thuoc tenancy, khong chuyen theo nguoi dai dien cu.
- Mot nguoi o chung chuyen/roi phong: receipt va credit van thuoc phong/tenancy cu.
- Chuyen ca phong: no phong cu duoc tru truoc; credit con lai sau settlement duoc chuyen sang tenancy phong moi voi lich su lien ket.
- Ket thuc ca phong: credit con lai duoc hien la `So du can hoan/doi soat`; khong tu dong xoa. Workflow hoan tien thuc te khong thuoc P6-004.

## Huy va sua sai

- Khong sua amount, ngay thu hoac hard delete receipt da xac nhan.
- OWNER/MANAGER co the `Huy lan thu` voi ly do bat buoc.
- Huy phai dao toan bo allocations/credit cua receipt, tinh lai invoice status/outstanding va ghi audit trong mot transaction.
- Retry cung idempotency key tra lai ket qua cu; payload khac dung key bi tu choi.

## UX

- Khong them menu chinh.
- Nut `Thu tien` va `Lich su thu` nam trong chi tiet Phong dang thue.
- Form gom: so tien, ngay gio thu, hinh thuc, nguoi nop tuy chon, ghi chu.
- Truoc xac nhan phai hien preview phan bo va phan tra truoc.
- Lich su hien receipt number, ngay gio, amount, method, nguoi nop, allocations, credit, status va nguoi ghi nhan.
- Tab Chot tien hien `Da thu truoc: X VND (N lan)` read-only va co link mo lich su.
- Desktop/mobile khong overflow; primary controls toi thieu 44 x 44 px.

## User stories

- As a chu tro, I want ghi tung lan thu tien cua phong, so that toi khong phai tu cong lai cuoi thang.
- As a chu tro, I want tien thu tu dong tru no cu nhat, so that cong no giam dung va khong ton tai dong thoi no cu voi credit moi mot cach kho hieu.
- As a chu tro, I want phan du tu dong thanh tra truoc, so that cuoi thang he thong tu tru vao tong ky.
- As a chu tro, I want xem lich su va chi tiet phan bo, so that toi doi chieu duoc da thu luc nao va dung vao khoan nao.
- As a quan ly, I want huy sai sot bang nghiep vu co audit, so that so lieu duoc phuc hoi ma khong mat dau vet.

## Non-goals

- Khong tao lich/ke hoach tra gop bat buoc theo ngay.
- Khong them tab Thu tien rieng.
- Khong cho nguoi thue dang nhap hoac tu nop tien online.
- Khong tich hop ngan hang, QR/webhook hoac doi soat tu dong.
- Khong cho chon bo qua cong no cu de tao credit moi trong MVP.
- Khong xay workflow hoan tien/tra coc hoan chinh trong phase nay.
- Khong hard delete hoac sua truc tiep receipt da xac nhan.

## Rang buoc ky thuat

- Reuse React, NestJS, Prisma va PostgreSQL hien tai.
- Reuse payment allocation va account ledger; khong duy tri hai nguon so du doc lap.
- Tien dung Decimal/integer, khong dung floating point.
- Receipt, allocations, credit, invoice update va audit phai atomic.
- Moi mutation phai property-scoped, RBAC, validated, idempotent va redacted trong log.
- Business date/time dung timezone cau hinh; `receivedAt` luu timestamptz.
- Schema change bat buoc co migration, unique/index va rollback plan.
- API cu `prepaidAmount` can co lo trinh compatibility; sau migration UI khong duoc tin mot tong nhap tay.

## Definition of Ready

- Product brief, stories, business rules, testable AC, non-goals va constraints da duoc dong bo.
- Database/API contract va migration strategy duoc Architecture + Security review truoc khi code.
- Frontend chi tich hop sau khi API contract duoc freeze.
