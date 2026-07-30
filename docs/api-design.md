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
- `pricing-configs`: mot global config cho dien/nuoc/phi trong UI; API resolver van giu scope system/property/room/tenancy cho invoice snapshot ve sau.
- `utility-readings`: ghi/sua/finalize chi so dien nuoc.
- `settlements`: preview/chot tien thang va tra phong giua thang, ghi so du tra truoc.
- `invoices`: tao nhap, phat hanh, khoa, huy, xem item, tinh lai khi duoc phep.
- `payments`: ghi nhan, phan bo, huy/hoan tac, idempotency.
- `debts`: danh sach phong no, chi tiet cong no phong.
- `dashboard`: KPI va canh bao uu tien.
- `reports`: doanh thu, cong no, dien nuoc, lich su thanh toan, export CSV.
- `audit-logs`: tra cuu log theo entity/action/user/time.
- `jobs`: endpoint noi bo/admin de trigger job tao hoa don dien nuoc neu can.

## Phase 3 implemented contracts

### Rooms

- `GET /api/v1/rooms`: protected list, envelope `{ data, page }`, supports `limit`, `cursor`, `sort`, `q`, `filter[status]`, `filter[groupId]`; each room includes `currentOccupancy` summary when occupied.
- `POST /api/v1/rooms`: owner/manager/staff create. Room code is trimmed and uppercased. Active code conflict returns `409`.
- `GET /api/v1/rooms/:id`: protected detail with active representative/co-tenant occupants. Soft-deleted rooms return `404`.
- `PATCH /api/v1/rooms/:id`: owner/manager/staff partial update.
- `DELETE /api/v1/rooms/:id`: owner/manager retire/soft delete; sets status `INACTIVE` and preserves history.

### Tenants and Tenancies

- `GET /api/v1/tenants`: protected list, envelope `{ data, page }`, supports `limit`, `cursor`, `q`, `filter[status]`, `filter[roomId]`; each tenant includes current room and role if active.
- `POST /api/v1/tenants`: owner/manager/staff create tenant profile.
- `GET /api/v1/tenants/:id`: protected detail with tenancy history.
- `PATCH /api/v1/tenants/:id`: owner/manager/staff partial update.
- `DELETE /api/v1/tenants/:id`: owner/manager retire/soft delete tenant profile.
- `GET /api/v1/tenancies`: protected tenancy list, optional `tenantId`; tenant-specific history returns membership role and member list.
- `POST /api/v1/tenancies`: assign tenant to room. If room has no active tenancy, creates tenancy and marks that tenant as representative using room rent/deposit defaults. If room already has active tenancy, adds tenant as co-tenant member.
- `PATCH /api/v1/tenancies/:id/end`: end the whole tenancy group, close active members and mark room vacant.
- `POST /api/v1/tenancies/:id/transfer`: move the whole active group to target room, preserve representative/co-tenant roles, set new start date and write transfer handover record.
- `POST /api/v1/tenancies/:id/members/:tenantId/transfer`: move one active member to another room. If target room is empty, the moved member becomes representative; if target room is occupied, the moved member becomes co-tenant. Representatives cannot move alone while co-tenants remain.
- `PATCH /api/v1/tenancies/:id/members/:tenantId/leave`: close one active membership. Co-tenants can leave independently. Representatives cannot leave while co-tenants remain. If the leaving member is the last occupant, the tenancy ends and the room becomes vacant.

### Pricing Configs

- `GET /api/v1/pricing-configs`: protected list of pricing configs.
- `GET /api/v1/pricing-configs/effective?propertyId=&roomId=&tenancyId=&asOf=`: protected resolver returning `resolvedConfig` and `sources`.
- `GET /api/v1/pricing-configs/global`: protected single active system config used by Settings UI.
- `PATCH /api/v1/pricing-configs/global`: owner/manager update the single global utility/fee config. Rent is intentionally not accepted here; room rent is managed on Rooms.
- `POST /api/v1/pricing-configs`: owner/manager create config; validates scope target and non-negative money.
- `PATCH /api/v1/pricing-configs/:id`: owner/manager update config.
- `DELETE /api/v1/pricing-configs/:id`: owner/manager deactivate config.
- Priority: invoice snapshot, tenancy, room, property, system. Phase 4 P4-001 implements resolver priority; invoice snapshot application is enforced when invoice module lands.

### Utility Readings And Settlements

- `GET /api/v1/utility-readings`: protected list, supports `roomId`, `tenancyId`, `billingYear`, `billingMonth`, `readingKind`, `status`.
- `POST /api/v1/utility-readings`: owner/manager/staff create draft reading. Server validates current reading is not lower than previous reading and computes usage/amount from effective utility pricing.
- `POST /api/v1/utility-readings/:id/finalize`: owner/manager/staff finalize a reading. Duplicate finalized reading for same room, period and kind returns `409`.
- `GET /api/v1/settlements`: protected list, supports `roomId`, `tenancyId`, `billingYear`, `billingMonth`.
- `POST /api/v1/settlements/preview`: owner/manager/staff preview monthly or move-out settlement from a finalized utility reading without persisting.
- `POST /api/v1/settlements`: owner/manager/staff finalize settlement, stores settlement totals and account ledger entries for prepayment/applied credit.
- Settlement currently includes room rent, electricity and water. Fixed trash/internet/service fees remain invoice-module work.
- Proration uses actual days in the billing month. Period dates are inclusive for Phase 4 settlement UI.
- Prepayment credit is applied to the settlement total for the period. Remaining credit is carried forward; remaining unpaid utility/rent amount is stored on settlement as `outstandingAmount`.

### Invoices, Payments And Debts

- `GET /api/v1/invoices`: protected list, supports `roomId`, `tenancyId`, `payerTenantId`, `status`.
- `GET /api/v1/invoices/:id`: protected invoice detail with item lines and payment allocations.
- `POST /api/v1/invoices/from-settlement`: owner/manager/staff create an issued invoice from a finalized settlement. Idempotency uses `sourceKey = settlement:<settlementId>`; repeated requests return the existing invoice.
- Invoice item lines currently include rent, electricity, water and optional prepaid discount. Invoice total is clamped to settlement outstanding amount and cannot be negative.
- `GET /api/v1/payments`: protected list, supports `invoiceId`, `roomId`, `payerTenantId`.
- `POST /api/v1/payments`: owner/manager/staff create one confirmed payment for one invoice. `Idempotency-Key` header or `idempotencyKey` body prevents duplicate writes.
- Payment creation runs in a database transaction: create payment, create allocation, update invoice `paidAmount`, `outstandingAmount` and status. Overpayment is rejected while MVP does not support advance payment outside settlement credit.
- `GET /api/v1/debts`: protected debt summary grouped by room and payer tenant from invoices that still have outstanding amount. Supports `roomId`, `payerTenantId`, `status=OUTSTANDING|PARTIALLY_PAID|DUE_TODAY|OVERDUE`, and optional `asOf` for deterministic aging. Response includes invoice detail, payment allocation history, nearest due date, overdue days and latest payment timestamp.
- `GET /api/v1/dashboard/summary`: protected operational summary. Supports optional `asOf` date. Returns room count, occupied room count, current-month collectable/collected/outstanding amounts, overdue invoice count/amount and an attention list built from overdue debts.
- `GET /api/v1/reports/monthly?billingYear=&billingMonth=`: protected monthly report including invoice totals, collected payments in the month, outstanding amount, overdue amount, electricity/water totals, invoice rows, payment rows and debt rows.
- `GET /api/v1/reports/monthly.csv?billingYear=&billingMonth=`: protected CSV export for the same report. CSV cells are quoted and formula-like cells starting with `=`, `+`, `-` or `@` are prefixed to reduce spreadsheet formula injection risk.

## Validation

- Validate body, query param va path param server-side.
- `roomCode` unique voi phong active.
- So tien, gia, phi khong duoc am.
- Discount khong duoc lam tong invoice nho hon 0.
- Chi so moi khong nho hon chi so cu, tru workflow thay dong ho/quay vong.
- Mot phong khong co hai tenancy active trong MVP.
- Mot tenant khong co hai active room membership.
- Them nguoi vao phong da co tenancy active khong tao tenancy moi; nguoi them sau la co-tenant.
- Dai dien khong duoc roi/chuyen rieng neu tenancy con nguoi o chung; can flow doi dai dien rieng.
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

- Header `Idempotency-Key` duoc khuyen nghi; MVP cung chap nhan `idempotencyKey` trong body de de test/automation.
- Server tu doc invoice/outstanding, khong tin tong tien tu client neu co the tinh duoc.
- Trong transaction:
  1. Kiem tra idempotency key.
  2. Doc invoice lien quan.
  3. Chan invoice da huy, da paid hoac amount vuot outstanding.
  4. Tao payment.
  5. Tao payment allocation.
  6. Cap nhat invoice status, paid amount, outstanding amount.
  7. Ghi audit log.
- Neu cung key duoc gui lai: tra lai payment da co, khong tao allocation moi.
- Request-hash mismatch cho cung idempotency key la hardening future.

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
