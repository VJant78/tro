# Payment Algorithm

## Scope

`PaymentPeriodCalculator` tinh moc `paidUntil` moi cho tien phong khi invoice tien phong da duoc thanh toan du. Service khong tu quyet dinh invoice da du tien hay chua; no chi nhan dau vao hop le tu payment/invoice service.

Phase 5 da co implementation thuần tại API billing domain cho daily, weekly, monthly anchor va boundary partial/paid invoice. Viec cap nhat `rentPaidUntil` vao Room/Tenancy record se duoc noi vao flow rent-invoice nang cao khi co yeu cau tach invoice tien phong theo chu ky.

## Date convention

- `paidUntil` la moc exclusive.
- Vi du da thanh toan mot ngay tu `2026-08-01T00:00` den `2026-08-02T00:00` nghia la nguoi thue duoc o ngay `2026-08-01`.
- Tat ca phep tinh dung local date theo mui gio cau hinh cua he thong, de xuat `Asia/Ho_Chi_Minh`.
- Luu ngay theo UTC instant khi can timestamp, nhung billing period nen dung `LocalDate`/date-only cong voi timezone he thong.

## Inputs

- `billingType`: `daily`, `weekly`, `monthly`.
- `currentPaidUntil`: co the null.
- `tenancyStartDate`.
- `cyclesPaid`: so chu ky duoc thanh toan, phai la so nguyen duong.
- `paymentRecordedAt`.
- `timezone`.
- `billingAnchorDay`: bat buoc cho monthly; mac dinh lay ngay bat dau thue.

## Daily

- Base date = `currentPaidUntil` neu co, nguoc lai `tenancyStartDate`.
- `newPaidUntil = baseDate + cyclesPaid days`.

## Weekly

- Base date = `currentPaidUntil` neu co, nguoc lai `tenancyStartDate`.
- `newPaidUntil = baseDate + cyclesPaid * 7 days`.

## Monthly with billing anchor

- Khong cong 30 ngay.
- Luu `billingAnchorDay`, vi du 31.
- Khi cong thang, ket qua la ngay `min(anchorDay, lastDayOfTargetMonth)`.
- Neu thang 2 khong co ngay 31 thi dung 28/29; khi sang thang 3 phai quay lai 31.
- Chuoi neo 31: `31/01`, `28/02` hoac `29/02`, `31/03`, `30/04`, `31/05`.
- Khong tinh thang tiep theo dua hoan toan tren ngay da bi rut ngan cua thang truoc.

## Partial payment

- Cho phep ghi nhan so tien thanh toan mot phan vao invoice/payment.
- Chi cap nhat `paidUntil` khi invoice tien phong duoc thanh toan du.
- Neu invoice con no, giu nguyen `paidUntil`.

## Multiple cycles

- `cyclesPaid` co the lon hon 1 cho ngay, tuan hoac thang.
- Monthly multiple cycles lap qua tung target month bang anchor hoac tinh target month index roi clamp theo anchor.

## Cancel/reversal

- Khong sua truc tiep `paidUntil` bang tay.
- Khi huy payment, danh dau payment `cancelled`/`reversed`, ghi audit log, sau do tinh lai `paidUntil` tu tenancy start va tat ca invoice tien phong da thanh toan du, hop le, theo thu tu ky.
- Invoice/payment bi huy khong tham gia tinh lai.

## Idempotency

- Payment confirmation API can `idempotencyKey`.
- Unique constraint tren `(tenant/account scope, idempotencyKey)` hoac transaction code.
- Neu request lap lai cung key va cung payload, tra lai ket qua truoc.
- Neu cung key nhung payload khac, tra loi conflict.
- Viec tang `paidUntil` phai nam trong database transaction cung voi tao payment/allocation va cap nhat invoice.

## Pseudocode

```text
calculatePaidUntil(input):
  assert cyclesPaid > 0
  base = currentPaidUntil ?? tenancyStartDate

  if billingType == daily:
    return base + cyclesPaid days

  if billingType == weekly:
    return base + cyclesPaid * 7 days

  if billingType == monthly:
    anchor = billingAnchorDay ?? day(tenancyStartDate)
    result = base
    repeat cyclesPaid times:
      targetYearMonth = monthAfter(result.yearMonth)
      result = date(
        targetYearMonth.year,
        targetYearMonth.month,
        min(anchor, lastDayOfMonth(targetYearMonth))
      )
    return result
```

## Required test cases

- Daily + 1 day.
- Daily + 10 days.
- Weekly + 1 week.
- Weekly + 4 weeks.
- Monthly from day 15.
- Monthly from day 28.
- Monthly from day 29.
- Monthly from day 30.
- Monthly from day 31.
- Non-leap February.
- Leap-year February.
- Prepay 12 months.
- Cancel most recent monthly payment and recalculate.
- Same idempotency key submitted twice.
- Partial payment does not change `paidUntil`.
