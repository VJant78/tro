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
- `payments`: ghi nhan receipt, FIFO allocation, tenancy credit, huy/hoan tac va idempotency.
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
- API tra `VACANT`/`OCCUPIED` tu active tenancy/membership. Mutation room khong chap nhan nguoi dung dat truc tiep hai trang thai nay; `MAINTENANCE`/`INACTIVE` bi chan khi phong con nguoi active.

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
- `POST /api/v1/tenancies/:id/change-representative`: owner/manager/staff atomically swaps the active representative with an active co-tenant in the same tenancy. Body includes `newRepresentativeTenantId` and `idempotencyKey`; server records `changedAt`, response returns old/new representative and unchanged tenancy. It creates no settlement/invoice and writes one audit event.
- Individual co-tenant transfer/leave never finalizes the old room settlement while another member remains active. Whole-group transfer requires move date plus old-room handover readings and completes old-room settlement/invoice before opening the target tenancy.
- Existing settlement/invoice/payment payer snapshots are immutable when representative changes. Payer resolution for a new settlement/invoice uses the representative effective at document creation time.

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
- `POST /api/v1/settlements/finalize-and-invoice`: owner/manager/staff executes the primary close flow. Body carries settlement input plus `idempotencyKey`; success returns `{ settlement, invoice }`. The settlement uses its existing period/type uniqueness and invoice uses `sourceKey=settlement:<id>`.
- If settlement finalize succeeds but invoice creation encounters a retryable failure, the API must expose the finalized settlement as `invoicePending=true`; repeating the same command resumes invoice creation from that settlement instead of finalizing again.
- Settlement currently includes room rent, electricity and water. Fixed trash/internet/service fees remain invoice-module work.
- Proration uses actual days in the billing month. Period dates are inclusive for Phase 4 settlement UI.
- Prepayment credit is applied to the settlement total for the period. Remaining credit is carried forward; remaining unpaid utility/rent amount is stored on settlement as `outstandingAmount`.

### Invoices, Payments And Debts

- `GET /api/v1/invoices`: protected list, supports `roomId`, `tenancyId`, `payerTenantId`, `status`.
- `GET /api/v1/invoices/:id`: protected invoice detail with item lines and payment allocations.
- `POST /api/v1/invoices/from-settlement`: owner/manager/staff create an issued invoice from a finalized settlement. Idempotency uses `sourceKey = settlement:<settlementId>`; repeated requests return the existing invoice.
- Pre-P6-004 invoice item lines include rent, electricity, water and an optional prepaid discount. P6-004 gross invoices follow ADR-0003 and represent applied credit through PaymentAllocation instead of a discount item.
- `GET /api/v1/payments`: protected list, supports `invoiceId`, `roomId`, `payerTenantId`.
- `POST /api/v1/payments`: compatibility endpoint for an invoice-targeted payment. `Idempotency-Key` header or `idempotencyKey` body prevents duplicate writes. Under P6-004 it delegates to the shared FIFO allocator and the requested invoice must be the oldest eligible debt.
- Receipt confirmation runs in a Serializable database transaction: create Payment, allocate across eligible invoices, journal the remainder as tenancy credit, update invoice projections and write audit. Amount greater than total debt is accepted only by the tenancy receipt endpoint; its remainder becomes credit.
- `GET /api/v1/debts`: protected debt summary grouped by room and payer tenant from invoices that still have outstanding amount. Supports `roomId`, `payerTenantId`, `status=OUTSTANDING|PARTIALLY_PAID|DUE_TODAY|OVERDUE`, and optional `asOf` for deterministic aging. Response includes invoice detail, payment allocation history, nearest due date, overdue days and latest payment timestamp.
- `GET /api/v1/dashboard/summary`: protected operational summary. Supports optional `asOf` date. Returns room count, occupied room count, current-month collectable/collected/outstanding amounts, overdue invoice count/amount and an attention list built from overdue debts.
- `GET /api/v1/dashboard/actions`: protected action queue for `UNSETTLED_PERIOD`, `INVOICE_PENDING`, `DUE_SOON`, `DUE_TODAY` and `OVERDUE`. Supports optional `asOf`; each item returns a stable id, room summary, period/due date, amount when applicable and a typed target `{ route, params }` for contextual navigation.
- `GET /api/v1/reports/monthly?billingYear=&billingMonth=`: protected monthly report including invoice totals, collected payments in the month, outstanding amount, overdue amount, electricity/water totals, invoice rows, payment rows and debt rows.
- `GET /api/v1/reports/monthly.csv?billingYear=&billingMonth=`: protected CSV export for the same report. CSV cells are quoted and formula-like cells starting with `=`, `+`, `-` or `@` are prefixed to reduce spreadsheet formula injection risk.

### Phase 6.4 Receipts, FIFO And Tenancy Credit

ADR-0003 chot `Payment` la receipt/cash source, `PaymentAllocation` la nguon
phan bo invoice va `TenantAccountEntry` la journal credit append-only theo
tenancy. Khong co cot balance doc lap. `payerTenantId` cua receipt chi la nguoi
nop tuy chon, khong phai chu so huu credit.

- `POST /api/v1/tenancies/:tenancyId/receipts/preview`: OWNER/MANAGER/STAFF preview FIFO; khong persist va khong reserve debt.
- `POST /api/v1/tenancies/:tenancyId/receipts`: OWNER/MANAGER/STAFF xac nhan receipt. Bat buoc `Idempotency-Key`; receipt, allocations, credit journal, invoice projections va audit atomic.
- `GET /api/v1/tenancies/:tenancyId/receipts`: protected paginated history cua tenancy.
- `GET /api/v1/receipts/:receiptId`: protected detail gom allocations, credit du, transfer va reversal.
- `POST /api/v1/receipts/:receiptId/void`: OWNER/MANAGER only; body co `reason`, bat buoc `Idempotency-Key`; khong hard delete.

Preview body:

```json
{
  "amount": "600000",
  "method": "CASH",
  "receivedAt": "2026-07-30T12:30:00.000Z",
  "payerTenantId": "optional-tenant-uuid",
  "notes": "Thu nhieu lan trong thang"
}
```

Preview la read-only, khong ghi business audit, va tra outcome kem HMAC snapshot
token co TTL 5 phut:

```json
{
  "previewToken": "opaque-signed-token",
  "expiresAt": "2026-07-30T12:35:00.000Z",
  "allocations": [],
  "creditCreated": "600000",
  "creditBalanceAfter": "600000"
}
```

Confirm gui lai toan bo normalized intent, them `previewToken`, va bat buoc header
`Idempotency-Key`. Sau authorization/property scope, replay da commit tra ket qua
cu. Command moi verify token va snapshot trong Serializable transaction. Token
het han hoac state/intent thay doi tra `409 ALLOCATION_PREVIEW_STALE`, zero
receipt/allocation/ledger/invoice/settlement/business-audit writes; client phai
preview lai. Confirm khong am tham commit outcome khac preview.

Confirm response:

```json
{
  "receipt": {
    "id": "payment-uuid",
    "receiptNumber": "PT-20260730-0001",
    "tenancyId": "tenancy-uuid",
    "amount": "600000",
    "method": "CASH",
    "receivedAt": "2026-07-30T12:30:00.000Z",
    "status": "CONFIRMED"
  },
  "allocations": [
    {
      "invoiceId": "invoice-may-uuid",
      "invoiceNumber": "INV-202605-001",
      "billingPeriodStart": "2026-05-01",
      "billingPeriodEnd": "2026-05-31",
      "amount": "100000"
    },
    {
      "invoiceId": "invoice-june-uuid",
      "invoiceNumber": "INV-202606-001",
      "billingPeriodStart": "2026-06-01",
      "billingPeriodEnd": "2026-06-30",
      "amount": "400000"
    }
  ],
  "creditCreated": "100000",
  "creditBalanceAfter": "100000",
  "replayed": false
}
```

FIFO order la `billingPeriodStart`, `dueOn`, `createdAt`, `id`, tat ca tang dan.
Chi invoice cung property/tenancy, khong CANCELLED/deleted va con outstanding
duoc phan bo. MVP khong cho bo qua invoice cu hon.

`receivedAt` duoc validate theo business timezone: local date khong truoc ngay
bat dau tenancy va khong sau current business date. Tenancy phai active; neu co
`payerTenantId` thi nguoi nop phai la active member tai thoi diem thu. Cross-
property request tra `404` va khong de lo ton tai entity.

Invoice moi luu gross period charge. Credit duoc ap bang PaymentAllocation, nen
`paidAmount` bao gom tien da thu truoc va `outstandingAmount = totalAmount -
paidAmount`; credit khong con la discount item. Settlement snapshot dong bo sau
khi invoice/allocation thanh cong. Allocation/application/transfer khong duoc
tinh lai thanh doanh thu; report chi dem confirmed Payment mot lan theo
`receivedAt`.

Whole-room transfer ap credit vao toan bo no tenancy cu truoc. Phan con lai duoc
ghi journal transfer-out/transfer-in theo tung source receipt trong cung
transaction dong/mo tenancy. Doi dai dien hoac co-tenant roi/chuyen rieng khong
doi tenancy credit.

Void danh dau Payment `VOIDED`, append source-lotted reversal journal, vo hieu
hoa allocations qua parent status, rebuild invoice projection va dong bo
settlement snapshot trong mot Serializable transaction. Thanh cong tra receipt,
reversed allocation IDs, affected invoices, credit reversal IDs, negative cash
event tai `voidedAt` va `replayed`. Neu khong the cascade day du, API rollback
toan bo va tra `409 RECEIPT_REVERSAL_CONFLICT`; khong partial void, credit am,
hard delete hoac fallback ngam. Day la sua receipt nhap sai, khong phai
refund/partial void.

`POST /api/v1/payments` cu tam thoi van ton tai nhung phai delegate vao cung FIFO
allocator; invoice duoc chon phai la debt dau tien. `prepaidAmount` trong API
settlement la deprecated: mot compatibility release chuyen non-zero input thanh
Payment `OTHER` co deterministic key va legacy marker; sau do non-zero tra
`PREPAID_INPUT_DEPRECATED`. Web moi chi gui `0`/bo field va hien balance read-only.

Cash report dung mot convention cho API/UI/dashboard/CSV: receipt la event duong
mot lan tai `receivedAt` ke ca neu bi void sau nay; reversal la event am mot lan
tai `voidedAt`; allocation, credit apply/transfer va settlement la zero-cash.
Totals tach `cashReceived`, `cashReversed`, net `collected`, `grossBilled`,
`creditApplied` va `netOutstanding`. Receipt va reversal lien ky net bang zero.

Stable errors gom `ALLOCATION_PREVIEW_STALE`, `TENANCY_NOT_ACTIVE`,
`RECEIPT_DATE_OUT_OF_RANGE`, `RECEIPT_PAYER_NOT_ACTIVE`,
`FIFO_INVOICE_REQUIRED`, `RECEIPT_ALREADY_VOIDED`,
`RECEIPT_REVERSAL_CONFLICT`, `CREDIT_BALANCE_CONFLICT` va
`IDEMPOTENCY_KEY_REUSED`.

Security finding mapping (contract resolved; implementation van can Security
re-review evidence):

| Finding      | API/architecture contract                                                                            | Status                  |
| ------------ | ---------------------------------------------------------------------------------------------------- | ----------------------- |
| `P6-SEC-001` | Tenancy-owned canonical journal, source/reversal links, derived balance.                             | **RESOLVED (contract)** |
| `P6-SEC-002` | Serializable FIFO allocator, deterministic locks, bounded retry and conservation invariant.          | **RESOLVED (contract)** |
| `P6-SEC-003` | Atomic source-lotted cascade or `RECEIPT_REVERSAL_CONFLICT` with zero partial writes.                | **RESOLVED (contract)** |
| `P6-SEC-004` | Signed short-lived preview token; stale confirm returns `ALLOCATION_PREVIEW_STALE` with zero writes. | **RESOLVED (contract)** |
| `P6-SEC-007` | Positive receipt and negative reversal cash events; allocation/credit are zero-cash.                 | **RESOLVED (contract)** |

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
- Doi dai dien chi chap nhan active co-tenant trong cung tenancy va phai duy tri dung mot active representative.
- Chuyen co-tenant rieng khong duoc dong tenancy/chot phong cu; chuyen ca nhom khong duoc hoan tat neu chua chot settlement/invoice phong cu.
- Khong sua truc tiep invoice da khoa/da paid neu khong tao adjustment.
- Legacy invoice-targeted payment khong duoc vuot outstanding cua invoice; tenancy receipt co the vuot tong debt va phan du bat buoc thanh credit.

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
- Day la compatibility endpoint. Server tu doc invoice/outstanding va delegate vao shared FIFO allocator; khong tin projection tu client.
- Trong transaction:
  1. Kiem tra idempotency key.
  2. Lock tenancy va doc danh sach debt FIFO.
  3. Chan invoice da huy/paid, invoice khong phai debt dau tien, hoac amount vuot outstanding cua invoice duoc chon.
  4. Tao payment.
  5. Tao payment allocation.
  6. Cap nhat invoice status, paid amount, outstanding amount.
  7. Ghi audit log.
- Neu cung key duoc gui lai: tra lai payment da co, khong tao allocation moi.
- Request-hash mismatch cho cung idempotency key tra `409 IDEMPOTENCY_KEY_REUSED`.
- P6-004 thay the implementation mot-invoice bang shared FIFO allocator theo
  ADR-0003. Contract cu la compatibility wrapper, khong phai mot payment engine
  rieng. Cung key khac normalized payload tra `409 IDEMPOTENCY_KEY_REUSED`.

## Auth session API

`POST /api/v1/auth/logout`

- Protected mutation; revoke/invalidate current server-side session and clear the auth cookie with the same path/domain/security attributes used when setting it.
- Repeating logout is safe and does not restore or extend the session.
- Subsequent protected API calls using the old session return `401`.

## UX error contract

- Stable `error.code` is the UI mapping key; user-facing Vietnamese copy belongs to the web client unless the server already provides localized detail.
- Domain conflicts should use specific codes, including `ROOM_HAS_ACTIVE_OCCUPANTS`, `REPRESENTATIVE_NOT_ACTIVE_COTENANT`, `OLD_ROOM_SETTLEMENT_REQUIRED`, `SETTLEMENT_ALREADY_FINALIZED` and `INVOICE_PENDING`.
- Retryable responses must include enough identifiers for the client to resume without creating duplicate domain records.

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

- Payment allocation da duoc chot boi ADR-0003: mot receipt co the phan bo nhieu invoice theo FIFO; phan du la tenancy credit.
- Auth strategy cuoi: cookie session hay JWT.
- Endpoint tao hoa don tien phong: thu cong, tu dong theo ky, hay ca hai.
- Co luu anh giay to trong MVP hay chi de schema future-ready.
- Whole-group transfer transaction boundary: one database transaction for close-and-open, or resumable saga if invoice/external work later leaves the database boundary. For current single PostgreSQL deployment, prefer one transaction where feasible.
- Dashboard `DUE_SOON` threshold: use global `dueDay` and define whether warning starts 3 days before due date; Product/Lead must confirm before implementation.
