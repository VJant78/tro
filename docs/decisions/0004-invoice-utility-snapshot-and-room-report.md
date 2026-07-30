# ADR 0004: Snapshot chỉ số tiện ích trên hóa đơn và báo cáo theo phòng

- Trạng thái: Accepted
- Ngày: 2026-07-30
- Task: P6-005

## Bối cảnh

Hóa đơn hiện lưu thành tiền điện, nước trong `InvoiceItem`, nhưng chưa lưu đủ chỉ số cũ, chỉ số mới và lượng sử dụng. Dữ liệu chỉ số đã chốt tồn tại trong `UtilityReading` và được `Settlement.utilityReadingId` tham chiếu. Nếu giao diện tự suy ngược chỉ số từ thành tiền hoặc đọc cấu hình giá hiện tại, hóa đơn lịch sử có thể hiển thị sai.

Endpoint báo cáo tháng hiện lọc theo `billingYear` và `billingMonth`, nhưng chưa nhận `roomId`. Người dùng vì vậy chưa thể tìm nhanh hóa đơn của một phòng trong một kỳ. Route chi tiết hóa đơn hiện có là `GET /invoices/:id`; giao diện có thể mở route này qua deep-link `/invoices?invoiceId={invoiceId}`.

Quyết định phải giữ tương thích với hóa đơn đã phát hành, không tạo nguồn tính tiền thứ hai và không tạo PDF phía server.

## Quyết định

### 1. Không thay đổi database schema

P6-005 không thêm cột hoặc bảng và không tạo schema migration. Snapshot chỉ số của hóa đơn mới được lưu trong trường JSON `InvoiceItem.metadata` hiện có.

Mỗi item `ELECTRICITY` hoặc `WATER` của hóa đơn mới lưu envelope sau:

```ts
interface UtilityUsageSnapshotEnvelope {
  schemaVersion: 1;
  sourceUtilityReadingId: string;
  utilityUsage: {
    previous: string;
    current: string;
    usage: string;
    unit: "kWh" | "m3";
    unitPrice: string;
    amount: string;
  };
}
```

Các số thập phân và tiền tiếp tục truyền dưới dạng chuỗi để không mất độ chính xác. `m3` là giá trị API ổn định; Frontend có thể trình bày thành `m³`.

`unitPrice` và `amount` trong snapshot phải bằng giá trị của chính `InvoiceItem`. Thành tiền và tổng hóa đơn luôn lấy từ invoice đã phát hành, không tính lại từ cấu hình hiện tại.

### 2. API invoice item thêm contract typed, additive

Response của `InvoiceItem` giữ nguyên mọi field hiện có và thêm:

```ts
interface InvoiceItemRecord {
  // Các field hiện có được giữ nguyên.
  utilityUsage: {
    previous: string;
    current: string;
    usage: string;
    unit: "kWh" | "m3";
    unitPrice: string;
    amount: string;
  } | null;
  utilityUsageSource: "INVOICE_SNAPSHOT" | "LEGACY_FINALIZED_READING" | null;
}
```

- Item không phải `ELECTRICITY` hoặc `WATER` luôn trả `utilityUsage: null`.
- Item tiện ích có snapshot hợp lệ trả source `INVOICE_SNAPSHOT`.
- Hóa đơn cũ được hydrate hợp lệ trả source `LEGACY_FINALIZED_READING`.
- Thiếu hoặc không xác thực được dữ liệu trả `utilityUsage: null`; API không đặt số giả bằng `0`.
- `metadata` hiện có được giữ để tương thích, nhưng Frontend chỉ dùng contract typed, không tự parse JSON metadata.

Đây là thay đổi additive: client cũ có thể bỏ qua hai field mới; client mới vẫn render được amount cũ khi `utilityUsage` là `null`.

### 3. Tạo snapshot cho hóa đơn mới

Khi tạo invoice từ settlement, Backend thực hiện luồng sau trước khi ghi invoice:

1. Tải settlement và yêu cầu `status=FINALIZED`.
2. Tải đúng reading qua `settlement.utilityReadingId`.
3. Yêu cầu reading có `status=FINALIZED`, `finalizedAt` khác null và chưa bị xóa.
4. Xác nhận reading, settlement và invoice cùng property, `roomId`, `tenancyId`, `billingPeriodStart`, `billingPeriodEnd`, `billingYear` và `billingMonth`.
5. Tạo item điện/nước từ reading đã chốt: `quantity=usage`, unit tương ứng, `unitPrice` và `amount` là snapshot tại thời điểm chốt.
6. Ghi invoice, items và metadata snapshot trong cùng transaction phát hành hóa đơn.

Nếu settlement không có reading thì không tạo item tiện ích giả. Nếu settlement có khoản tiện ích nhưng reading thiếu, chưa finalized hoặc sai phạm vi, việc phát hành invoice bị từ chối bằng validation error; hệ thống không âm thầm dùng cấu hình hiện tại.

Mọi đường tạo invoice, gồm luồng billing trực tiếp và tenancy workflow, phải dùng cùng builder/validation cho `InvoiceCreateInput`; không đường nào được tự dựng metadata khác contract trên.

### 4. Hydrate hóa đơn cũ theo cơ chế read-only

Với item tiện ích chưa có snapshot hợp lệ, endpoint chi tiết hóa đơn có thể hydrate `utilityUsage` từ reading cũ. Fallback chỉ được phép khi xác minh toàn bộ chuỗi liên kết:

- Xác định được duy nhất settlement nguồn của invoice qua `settlementId` đã lưu trong invoice/item hoặc source key chuẩn.
- `settlement.utilityReadingId` trỏ trực tiếp tới reading.
- Settlement và reading đều `FINALIZED`, chưa bị xóa và có dấu thời gian finalized.
- Invoice, settlement và reading cùng property, phòng, lượt thuê và kỳ tính tiền.
- `ELECTRICITY` chỉ đọc bộ chỉ số điện; `WATER` chỉ đọc bộ chỉ số nước.
- `current >= previous` và `usage = current - previous` theo độ chính xác đã lưu.

Khi hydrate legacy:

- `previous`, `current` và `usage` lấy từ finalized reading.
- `unitPrice` lấy từ finalized reading liên kết vì hóa đơn legacy từng lưu tổng phí vào trường đơn giá; `amount` luôn lấy từ `InvoiceItem` để giữ nguyên giá trị chứng từ. Không dùng cấu hình hiện tại.
- Không update invoice, item, settlement hoặc reading; không backfill khi đọc.
- Nếu bất kỳ điều kiện nào thất bại, trả `utilityUsage: null` và ghi log kỹ thuật không chứa PII. UI hiển thị thông báo thiếu dữ liệu chỉ số nhưng vẫn hiển thị số tiền chứng từ.

Fallback chỉ áp dụng cho endpoint chi tiết. Danh sách báo cáo không hydrate từng invoice để tránh truy vấn N+1; người dùng mở deep-link để tải chi tiết đầy đủ.

### 5. Báo cáo tháng thêm bộ lọc phòng

Giữ endpoint hiện tại và thêm query optional:

```http
GET /reports/monthly?billingYear=2026&billingMonth=6&roomId=<uuid>
GET /reports/monthly.csv?billingYear=2026&billingMonth=6&roomId=<uuid>
```

Contract:

- `billingYear` và `billingMonth` giữ nguyên và vẫn bắt buộc.
- `roomId` là UUID optional. Bỏ qua field này nghĩa là `Tất cả phòng` trong property được cấp quyền.
- Có `roomId` thì invoices, payments, debts và các totals trong report đều phải cùng room để response không trộn dữ liệu toàn property với dữ liệu một phòng.
- Kỳ report dựa trên `Invoice.billingYear/billingMonth`, không dựa trên ngày phát hành hoặc ngày thanh toán.
- Kết quả invoice loại `DRAFT`, gồm các trạng thái đã phát hành kể cả `CANCELLED`; invoice hủy không được cộng vào totals hiệu lực.
- Phòng inactive hoặc đã lưu trữ vẫn tra cứu được hóa đơn lịch sử. `roomId` không tồn tại hoặc thuộc property khác trả `404` để tránh lộ tài nguyên.
- CSV dùng cùng bộ lọc và quy tắc totals với JSON.

Response giữ nguyên các field hiện có. Mỗi invoice đã có đủ `id`, `roomCode`, `invoiceNumber`, kỳ, trạng thái và số tiền để Frontend tạo nhãn/link. Không đưa URL công khai vào API response.

### 6. Deep-link và in hóa đơn

- Frontend dùng semantic link `/invoices?invoiceId={invoiceId}`.
- Query string chỉ chứa invoice ID; không chứa nội dung hóa đơn, PII hoặc token chia sẻ.
- Sau điều hướng, Frontend gọi `GET /invoices/:id`; dữ liệu trên URL không được xem là bằng chứng phân quyền.
- API yêu cầu session và role đọc hiện có. Truy vấn invoice luôn kèm property scope; invoice không tồn tại hoặc khác property trả cùng một `404`.
- Không tạo public share link, signed URL hoặc tenant portal trong P6-005.
- `In hóa đơn` dùng `window.print()` và print stylesheet. Web và bản in dùng cùng một invoice detail response; không có API tạo/lưu PDF và không thực hiện phép tính tài chính riêng khi in.

## Luồng dữ liệu

```text
Finalized UtilityReading
        |
        v
Finalized Settlement -- utilityReadingId
        |
        | validate property/room/tenancy/period
        v
Invoice + InvoiceItem.metadata.utilityUsage (immutable snapshot)
        |
        +--> GET /invoices/:id --> typed utilityUsage --> web/print
        |
        +--> GET /reports/monthly[?roomId] --> invoice link
```

Đối với legacy invoice, nhánh đọc đi từ invoice tới settlement rồi tới finalized reading, dựng typed response trong bộ nhớ và không ghi ngược database.

## Tác động truy vấn và index

- Không cần index JSON metadata vì snapshot chỉ được đọc cùng invoice item theo `invoiceId`, không dùng làm điều kiện tìm kiếm.
- Query report phải bắt đầu bằng `propertyId`, sau đó `billingYear`, `billingMonth` và optional `roomId`; không được tải toàn bộ property rồi lọc room trong application memory.
- Index hiện có trên invoice theo room/status và period chưa tối ưu đầy đủ cho report property/kỳ. Backend/Database Agent phải đo bằng `EXPLAIN ANALYZE`; nếu dữ liệu thực tế cần tối ưu, thêm index migration riêng cho `(property_id, billing_year, billing_month, room_id)` với điều kiện `deleted_at IS NULL`. Việc này là tối ưu độc lập, không phải schema requirement của P6-005.
- Legacy hydrate dùng khóa chính settlement/reading và chỉ chạy cho một invoice detail, do đó không yêu cầu index metadata hoặc batch join.

## Bảo mật

- Session, RBAC và property scope được áp dụng ở server cho report, CSV và invoice detail.
- Tất cả lookup fallback phải kiểm tra property gián tiếp qua room; không tin `settlementId`, `sourceUtilityReadingId` hoặc `roomId` chỉ vì chúng nằm trong metadata.
- Cross-property và unknown invoice/room dùng `404`; unauthenticated dùng `401` hoặc redirect đăng nhập ở web.
- Response và bản in chỉ chứa dữ liệu chứng từ cần thiết; không bổ sung CCCD, địa chỉ hoặc điện thoại.
- Financial responses nên dùng cache private/no-store theo convention hiện có và không được cache chung giữa property/user.
- Print là thao tác client-side read-only, không tạo audit mutation hoặc thay đổi trạng thái invoice.

## Contract kiểm thử

Backend và Database:

1. Invoice mới snapshot đúng điện/nước, gồm số thập phân, usage bằng 0, unit, unitPrice và amount.
2. Thay đổi pricing config hoặc reading sau phát hành không đổi typed snapshot của invoice.
3. Invoice issuance bị từ chối khi reading không finalized hoặc sai property/room/tenancy/period.
4. Legacy fallback thành công chỉ với liên kết settlement-reading hợp lệ; không phát sinh database write.
5. Legacy thiếu liên kết, liên kết mơ hồ, sai scope hoặc dữ liệu phép trừ sai trả `utilityUsage: null`.
6. `roomId` lọc đồng nhất invoices, payments, debts và totals; omitted `roomId` giữ hành vi toàn property.
7. Room/invoice khác property và ID không tồn tại đều không làm lộ metadata.
8. Report dùng billing month của invoice; `CANCELLED` xuất hiện nhưng không cộng totals, `DRAFT` không xuất hiện.
9. CSV và JSON áp dụng cùng room/kỳ.

Frontend và QA:

1. Item có typed data hiển thị `previous -> current = usage`, đúng unit, unitPrice và amount; UI không tự tính lại amount.
2. `utilityUsage: null` hiển thị trạng thái thiếu chỉ số, không hiển thị số 0 giả.
3. Link report mở đúng invoice ID khi có nhiều invoice cùng room/tháng.
4. Deep-link chưa đăng nhập, sai property và invoice không tồn tại không hiển thị dữ liệu cũ.
5. Print preview lấy đúng invoice đang chọn, ẩn navigation/action, không gọi mutation hoặc API PDF.
6. Desktop/mobile, keyboard và Axe đạt acceptance criteria trong brief/UX spec.

## Tương thích và triển khai

- Không migration dữ liệu và không backfill hóa đơn cũ.
- API chỉ thêm field nullable và query optional; client hiện tại tiếp tục hoạt động.
- Metadata cũ được giữ nguyên. Parser phải kiểm tra `schemaVersion` và shape trước khi expose typed data.
- Có thể triển khai Backend trước Frontend. Frontend cũ bỏ qua field mới; Frontend mới vẫn xử lý `null` cho invoice legacy.
- Khi rollback Frontend, snapshot vẫn là metadata vô hại. Khi rollback Backend, dữ liệu invoice và totals không đổi; metadata mới được phiên bản cũ bỏ qua.

## Trade-off và phương án không chọn

- Chọn JSON metadata thay vì thêm cột/bảng để giữ thay đổi additive và snapshot nằm cùng item tài chính. Đổi lại, cần parser runtime chặt chẽ và không dùng metadata cho truy vấn báo cáo.
- Không tính chỉ số từ amount vì giá, làm tròn hoặc điều chỉnh lịch sử có thể làm kết quả sai.
- Không luôn đọc UtilityReading cho invoice mới vì reading có thể bị điều chỉnh về sau; snapshot invoice mới là nguồn hiển thị chính.
- Không backfill tự động invoice cũ vì không phải mọi liên kết lịch sử đều đủ chắc chắn.
- Không sinh PDF server-side vì tăng chi phí lưu trữ, bảo mật và vận hành ngoài phạm vi P6-005.
