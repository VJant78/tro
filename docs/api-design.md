# API Design — Phase 1

## Style

- REST JSON API, prefix `/api/v1`.
- Web client khong truy cap database truc tiep; moi mutation di qua API.
- Datetime response dung ISO 8601.
- Tien dung integer minor unit hoac decimal, khong dung floating-point.
- Mutation quan trong bat buoc co auth, authorization, validation, transaction va audit log neu thay doi du lieu nghiep vu.

## Modules

- `auth`: login, logout, session/current user.
- `rooms`: tao, sua, xem, loc, doi trang thai, ngung su dung.
- `tenants`: tao, sua, tim kiem, xem lich su.
- `tenancies`: tao lan thue, them/xoa nguoi o, chuyen phong, ket thuc thue.
- `pricing-configs`: gia mac dinh, gia rieng phong, gia rieng tenancy.
- `utility-readings`: ghi/sua/finalize chi so dien nuoc.
- `invoices`: tao nhap, phat hanh, khoa, huy, xem item, tinh lai khi duoc phep.
- `payments`: ghi nhan, phan bo, huy/hoan tac, idempotency.
- `debts`: danh sach phong no, chi tiet cong no phong.
- `dashboard`: KPI va canh bao uu tien.
- `reports`: doanh thu, cong no, dien nuoc, lich su thanh toan, export CSV.
- `audit-logs`: tra cuu log theo entity/action/user/time.
- `jobs`: endpoint noi bo/admin de trigger job tao hoa don dien nuoc neu can.

## Validation

- Validate body, query param va path param server-side.
- `roomCode` unique voi phong active.
- So tien, gia, phi khong duoc am.
- Discount khong duoc lam tong invoice nho hon 0.
- Chi so moi khong nho hon chi so cu, tru workflow thay dong ho/quay vong.
- Mot phong khong co hai tenancy active trong MVP.
- Mot tenant khong co hai tenancy active.
- Khong sua truc tiep invoice da khoa/da paid neu khong tao adjustment.
- Khong thanh toan vuot outstanding neu MVP chua ho tro tien du.

## Pagination, filtering, sorting

- `limit`: mac dinh 20, toi da 100.
- `cursor`: opaque cursor cho danh sach lon.
- `sort`: allowlist field, vi du `createdAt:desc`.
- `filter[...]`: vi du `filter[status]=occupied`, `filter[groupId]=...`.
- `q`: tim kiem nhanh theo ma phong, ten phong, ten nguoi thue, so dien thoai, CCCD.

Response list:

```json
{
  "data": [],
  "page": {
    "limit": 20,
    "nextCursor": null,
    "hasMore": false
  }
}
```

## Error format

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Request validation failed",
    "requestId": "req_...",
    "details": [
      {
        "field": "newElectricReading",
        "message": "Must be greater than or equal to previous reading"
      }
    ]
  }
}
```

## HTTP status

- `400`: request sai cu phap hoac sai nghiep vu don gian.
- `401`: chua dang nhap.
- `403`: khong co quyen.
- `404`: khong tim thay hoac khong duoc phep thay.
- `409`: conflict, duplicate, idempotency key mismatch.
- `422`: validation nghiep vu phuc tap.
- `429`: rate limit.
- `500`: loi he thong.

## Payment API

`POST /api/v1/payments`

- Bat buoc header `Idempotency-Key`.
- Server tu doc invoice/outstanding, khong tin tong tien tu client neu co the tinh duoc.
- Trong transaction:
  1. Kiem tra idempotency key va request hash.
  2. Lock invoice lien quan.
  3. Tao payment.
  4. Tao payment allocation.
  5. Cap nhat invoice status, paid amount, outstanding amount.
  6. Neu invoice tien phong da paid du thi cap nhat hoac tinh lai `paidUntil`.
  7. Ghi audit log.
- Neu cung key va cung payload: tra lai response cu.
- Neu cung key nhung payload khac: tra `409`.

## Monthly utility invoice job API

`POST /api/v1/jobs/monthly-utility-invoices/run`

- Chi admin/internal.
- Input co `billingPeriod`.
- Idempotent bang job key va unique invoice constraint.
- Moi phong active tenancy duoc xu ly doc lap trong transaction nho.
- Ket qua batch gom `created`, `skipped`, `failed`.

## CSV export

- Report export phai enforce authorization nhu API xem du lieu.
- Can encode cell de tranh CSV formula injection.
- Export lon can gioi han filter, timeout va audit neu chua duoc phep tai du lieu nhay cam.

## Open decisions

- Payment allocation MVP: mot payment cho mot invoice hay cho phep nhieu invoice ngay tu dau.
- Auth strategy cuoi: cookie session hay JWT.
- Endpoint tao hoa don tien phong: thu cong, tu dong theo ky, hay ca hai.
- Co luu anh giay to trong MVP hay chi de schema future-ready.
