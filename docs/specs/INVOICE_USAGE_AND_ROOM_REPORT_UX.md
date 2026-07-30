# UX Spec - Chỉ số điện nước trên hóa đơn và tra cứu theo phòng

## 1. Mục tiêu

Giúp chủ trọ và người thuê hiểu ngay cách tính tiền điện, nước trên từng hóa đơn; đồng thời giúp chủ trọ tìm và mở đúng hóa đơn theo phòng, theo kỳ mà không phải nhớ mã hóa đơn.

Thay đổi giữ luồng hiện tại đơn giản:

- Chi tiết hóa đơn bổ sung chỉ số cũ, chỉ số mới, lượng đã dùng, đơn giá và thành tiền.
- Chi tiết hóa đơn có nút `In hóa đơn`.
- Báo cáo bổ sung bộ lọc `Phòng` và `Kỳ`.
- Mỗi hóa đơn trong báo cáo có link dễ hiểu, ví dụ `Hóa đơn Phòng P1 tháng 6/2026`, mở đúng `/invoices?invoiceId={invoiceId}`.

Không tạo tab mới, không tạo một trang báo cáo hóa đơn riêng và không thay đổi luồng chốt tiền hoặc ghi nhận thanh toán.

## 2. Nguyên tắc nội dung

- Dữ liệu chỉ số trên hóa đơn là dữ liệu đã chốt của chính hóa đơn đó. UI không lấy chỉ số hiện tại của phòng để tính lại hóa đơn cũ.
- Công thức hiển thị: `chỉ số cũ → chỉ số mới = đã dùng`.
- Tiền và đơn vị tuân theo `docs/ui-ux-spec.md`: tiền theo `vi-VN`, điện dùng `kWh`, nước dùng `m³`, ngày theo `dd/MM/yyyy`.
- Không dùng mã UUID làm nội dung chính. Tên phòng và kỳ là thông tin nhận diện ưu tiên; mã hóa đơn là thông tin phụ để đối chiếu.
- Nếu dữ liệu lịch sử không đủ chỉ số cũ/mới, không tự suy đoán. Hiển thị `Chưa có đủ chỉ số để đối chiếu` nhưng vẫn giữ đơn giá và thành tiền nếu hóa đơn có các giá trị này.
- Dữ liệu tiền và chỉ số của hóa đơn đã phát hành là read-only trên màn hình này.

## 3. Luồng chi tiết hóa đơn

### 3.1 Điểm vào

Người dùng có thể mở chi tiết hóa đơn từ:

1. Danh sách trong tab `Hóa đơn`.
2. Link hóa đơn trong tab `Báo cáo`.
3. Deep-link `/invoices?invoiceId={invoiceId}` từ các màn hình khác.

Khi có `invoiceId` hợp lệ, hóa đơn tương ứng được chọn và chi tiết được hiển thị. Trên mobile, viewport phải đưa người dùng đến phần chi tiết hoặc mở chi tiết thành màn hình/panel toàn chiều rộng để không phải tự tìm lại record vừa chọn.

Nếu `invoiceId` không tồn tại hoặc không thuộc phạm vi người dùng được phép xem, hiển thị lỗi chung `Không tìm thấy hóa đơn hoặc bạn không có quyền xem.` và CTA `Quay lại danh sách hóa đơn`; không làm lộ hóa đơn của cơ sở khác.

### 3.2 Header và hành động

Header chi tiết giữ tiêu đề `Chi tiết hóa đơn`, mã hóa đơn và trạng thái hiện tại. Bổ sung action `In hóa đơn` có icon in và nhãn chữ.

- Desktop: `In hóa đơn` đặt ở góc phải header chi tiết.
- Mobile: đặt ngay dưới mã/trạng thái, rộng theo nội dung hoặc toàn hàng nếu không đủ chỗ; vùng chạm tối thiểu 44 x 44 px.
- Nút chỉ khả dụng khi chi tiết hóa đơn đã tải xong.
- Trong lúc chuẩn bị bản in, nút disabled và đổi nhãn thành `Đang chuẩn bị`.
- `Ghi nhận thanh toán` vẫn là primary action của nghiệp vụ thu tiền. `In hóa đơn` là secondary action, không cạnh tranh thị giác với nút ghi nhận.

### 3.3 Dòng điện và nước

Trong danh sách dòng tiền, `Điện` và `Nước` dùng cùng một cấu trúc nội dung:

```text
Điện
125 kWh → 142 kWh = 17 kWh
3.500 VND/kWh                         59.500 VND
```

```text
Nước
30 m³ → 34 m³ = 4 m³
15.000 VND/m³                         60.000 VND
```

Quy tắc hiển thị:

- Tên khoản thu là `Điện` hoặc `Nước`.
- Dòng đối chiếu đọc theo thứ tự `cũ → mới = đã dùng`.
- `Đã dùng` bằng `mới - cũ` và phải trùng với quantity dùng để tính thành tiền.
- Đơn giá đặt dưới dòng đối chiếu; thành tiền căn phải trên desktop và vẫn nổi bật trên mobile.
- Thành tiền bằng lượng đã dùng nhân đơn giá theo quy tắc làm tròn nghiệp vụ. UI hiển thị dữ liệu server trả về, không tự sửa số tiền đã phát hành.
- Không hiển thị số thập phân vô nghĩa. Chỉ giữ phần thập phân khi đồng hồ thực tế có chỉ số lẻ.
- Dòng tiền phòng và các dòng khác giữ cách trình bày hiện tại.

Ví dụ accessible name cho cả dòng: `Điện, chỉ số cũ 125 kilowatt giờ, chỉ số mới 142 kilowatt giờ, đã dùng 17 kilowatt giờ, đơn giá 3.500 đồng, thành tiền 59.500 đồng`.

### 3.4 Trường hợp dữ liệu bất thường

| Trường hợp                                    | Cách hiển thị                                                                        |
| --------------------------------------------- | ------------------------------------------------------------------------------------ |
| Đủ chỉ số                                     | Hiển thị đầy đủ `cũ → mới = đã dùng`, đơn giá và thành tiền                          |
| Thiếu chỉ số cũ hoặc mới                      | `Chưa có đủ chỉ số để đối chiếu`; không hiển thị phép trừ giả                        |
| Chỉ số mới nhỏ hơn chỉ số cũ trong dữ liệu cũ | Hiển thị số đã lưu và cảnh báo `Chỉ số cần được kiểm tra`; không cho sửa tại hóa đơn |
| Lượng dùng bằng 0                             | Hiển thị đầy đủ, ví dụ `142 kWh → 142 kWh = 0 kWh`                                   |
| Không có khoản điện hoặc nước                 | Không tạo dòng rỗng; chỉ hiển thị các khoản có trong hóa đơn                         |

## 4. Luồng Báo cáo theo phòng và kỳ

### 4.1 Bộ lọc

Thanh filter của `Báo cáo` gồm:

- `Phòng`: dropdown, mặc định `Tất cả phòng`; option hiển thị `Phòng {mã phòng}` và sắp xếp tự nhiên theo mã phòng.
- `Kỳ`: month picker, giá trị dạng tháng/năm, mặc định tháng hiện tại.
- Primary action `Xem báo cáo`.
- Secondary action `Tải CSV`, giữ nguyên cả filter phòng và kỳ đang áp dụng.

Chỉ áp dụng filter khi người dùng bấm `Xem báo cáo`; việc đổi option chưa tự gọi API. Điều này tránh danh sách nhảy liên tục trên mobile và giữ hành vi hiện có dễ hiểu.

Desktop hiển thị `Phòng`, `Kỳ` và hai action trên cùng một toolbar khi đủ chỗ. Mobile xếp `Phòng` và `Kỳ` thành một cột; hai action nằm dưới, không tràn ngang. Filter đang áp dụng phải được giữ khi người dùng quay lại từ chi tiết hóa đơn bằng nút Back của trình duyệt.

### 4.2 Danh sách hóa đơn trong kỳ

Khu vực `Hóa đơn trong kỳ` giữ bảng trên desktop và card label-value trên mobile. Cột/giá trị chính:

- `Hóa đơn`: link có nhãn `Hóa đơn Phòng {mã phòng} tháng {tháng}/{năm}`.
- `Mã hóa đơn`: hiển thị phụ để đối chiếu.
- `Tổng`.
- `Còn thu`.
- `Trạng thái` bằng chữ, không chỉ bằng màu.

Ví dụ link:

```text
Hóa đơn Phòng P1 tháng 6/2026
INV-20260630-ABC
```

Link điều hướng trong cùng ứng dụng tới:

```text
/invoices?invoiceId={invoiceId}
```

Link dùng semantic `<a>` để có thể mở tab mới bằng hành vi chuẩn của trình duyệt. Accessible name phải đủ ngữ cảnh, ví dụ `Xem hóa đơn Phòng P1 tháng 6/2026`.

Nếu hóa đơn là kỳ không trọn tháng, nhãn link vẫn dùng tháng của `billingPeriodEnd`; khoảng ngày chi tiết được hiển thị trong màn hình Hóa đơn, không kéo dài nhãn báo cáo.

### 4.3 Empty state

- Không có hóa đơn cho tất cả phòng trong kỳ: `Chưa có hóa đơn trong tháng 6/2026.` và CTA `Đi đến Chốt tiền`.
- Không có hóa đơn cho một phòng: `Phòng P1 chưa có hóa đơn trong tháng 6/2026.` và CTA `Chọn phòng khác` để focus lại dropdown Phòng.
- Báo cáo vẫn có thể hiển thị các phần thanh toán/công nợ khác nếu API trả về dữ liệu; empty state của hóa đơn chỉ nằm trong section `Hóa đơn trong kỳ`.

## 5. Responsive

### Desktop từ 1024 px

- Tab Hóa đơn giữ list-detail hai cột hiện tại.
- Dòng điện/nước dùng ba vùng: nội dung đối chiếu, đơn giá và thành tiền; không làm thay đổi chiều rộng cột khi số thay đổi.
- Báo cáo dùng bảng có header semantic và link hóa đơn là vùng focus rõ ràng.
- Không có horizontal overflow tại 1024 x 768 và 1440 x 900.

### Tablet 768-1023 px

- Cho phép list-detail chuyển một cột theo quy tắc hiện có.
- Toolbar báo cáo được wrap theo hàng hoàn chỉnh; label không tách khỏi control.

### Mobile dưới 768 px

- Chi tiết hóa đơn là một cột. Mỗi dòng điện/nước hiển thị theo thứ tự: tên, phép đối chiếu, đơn giá, thành tiền.
- Không rút gọn phép đối chiếu bằng ellipsis; wrap tại khoảng trắng nếu cần.
- Báo cáo đổi mỗi hóa đơn thành card, trong đó link hóa đơn đứng đầu và các giá trị có label riêng.
- Nút `In hóa đơn`, link hóa đơn và các control có vùng chạm tối thiểu 44 x 44 px.
- Không có horizontal overflow tại 360, 390 và 430 px.

## 6. Trạng thái giao diện

### Loading

- Khi tải danh sách hoặc deep-link, giữ khung list-detail ổn định bằng skeleton.
- Skeleton chi tiết có header, nhóm tổng tiền và ba dòng khoản thu; không hiển thị dữ liệu của hóa đơn được chọn trước đó trong lúc tải hóa đơn mới.
- Báo cáo giữ filter thao tác được nhưng disable `Xem báo cáo` trong lúc tải; nút đổi thành `Đang tải`.

### Empty

- Hóa đơn không có record: giữ nội dung hiện tại `Chưa có hóa đơn` và CTA `Đi đến Chốt tiền`.
- Chưa chọn hóa đơn: `Chọn một hóa đơn để xem chi tiết.`
- Empty state báo cáo theo quy tắc tại mục 4.3.

### Error

- Lỗi tải chi tiết hoặc báo cáo hiển thị bằng tiếng Việt trong `role="alert"`, có nút `Thử lại`.
- Retry giữ nguyên `invoiceId`, phòng và kỳ đã chọn.
- Không hiển thị message kỹ thuật hoặc dữ liệu từ hóa đơn không thuộc quyền truy cập.
- Nếu in bị chặn hoặc trình duyệt không mở được print dialog, hiển thị `Không thể mở bản in. Hãy thử lại.` và giữ nguyên màn hình.

### Success

- Điều hướng từ Báo cáo sang Hóa đơn không cần toast; tiêu đề chi tiết và trạng thái selected là phản hồi đủ rõ.
- In dùng print dialog của trình duyệt, không hiển thị thông báo thành công sau khi dialog đóng vì ứng dụng không biết người dùng đã in hay hủy.

## 7. Trạng thái in hóa đơn

Khi bấm `In hóa đơn`, mở print preview của trình duyệt cho đúng hóa đơn đang chọn. Bản in phải dùng chính dữ liệu đang hiển thị và gồm:

- Tên cơ sở/nhà trọ nếu có trong cấu hình.
- Tiêu đề `HÓA ĐƠN PHÒNG {mã phòng} - THÁNG {tháng}/{năm}`.
- Mã hóa đơn, người đại diện, kỳ tính, ngày phát hành và hạn thu.
- Các dòng tiền phòng, điện, nước và khoản khác.
- Điện/nước đầy đủ `cũ → mới = đã dùng`, đơn giá và thành tiền.
- Tổng hóa đơn, đã thanh toán và còn phải thu.
- Ghi chú hóa đơn nếu có.

Print CSS phải:

- Ẩn sidebar, bottom navigation, danh sách hóa đơn, filter, form ghi nhận thanh toán, toast và tất cả action button.
- Không in màu nền trang hoặc shadow trang trí; chữ đen trên nền trắng, đường phân cách rõ.
- Không để một dòng điện/nước hoặc nhóm tổng tiền bị tách qua hai trang khi còn đủ chỗ.
- Phù hợp giấy A4 portrait với lề tối thiểu 12 mm và vẫn đọc được khi in đen trắng.
- Không phụ thuộc màu để biểu đạt trạng thái thanh toán.

## 8. Accessibility

- Dùng heading theo thứ tự: `Hóa đơn`/`Báo cáo` là `h1`, section chi tiết và `Hóa đơn trong kỳ` là `h2`.
- Dòng điện và nước là nhóm nội dung có tên; không dùng ký hiệu mũi tên làm thông tin duy nhất. Screen reader phải đọc được `chỉ số cũ`, `chỉ số mới`, `đã dùng`, `đơn giá`, `thành tiền`.
- Ký hiệu `→` có thể hiển thị trực quan nhưng accessible text phải diễn đạt bằng từ.
- Dropdown Phòng và month picker Kỳ có label liên kết đúng; lỗi filter được nối bằng `aria-describedby`.
- Loading dùng `aria-busy`; lỗi dùng `role="alert"`; cập nhật kết quả báo cáo dùng `aria-live="polite"` mà không tự chuyển focus.
- Focus của link báo cáo rõ ở contrast WCAG AA. Sau điều hướng, focus vào heading `Chi tiết hóa đơn` hoặc vùng nội dung chính theo cơ chế router hiện có.
- Tất cả luồng filter, mở hóa đơn và in hoàn thành được bằng keyboard; thứ tự focus theo thứ tự hiển thị.
- Zoom 200% không làm mất phép tính điện/nước, thành tiền hoặc action in.

## 9. Yêu cầu dữ liệu bàn giao cho triển khai

Frontend không suy ngược chỉ số từ thành tiền. Mỗi dòng điện/nước của hóa đơn cần dữ liệu snapshot tối thiểu:

| Dữ liệu           | Ý nghĩa                            |
| ----------------- | ---------------------------------- |
| `itemType`        | Phân biệt `ELECTRICITY` và `WATER` |
| `previousReading` | Chỉ số cũ tại kỳ đã chốt           |
| `currentReading`  | Chỉ số mới tại kỳ đã chốt          |
| `quantity`        | Lượng đã dùng đã chốt              |
| `unit`            | `kWh` hoặc `m³`                    |
| `unitPrice`       | Đơn giá áp dụng cho hóa đơn        |
| `amount`          | Thành tiền đã phát hành            |

Báo cáo cần danh sách phòng có quyền xem và hỗ trợ filter theo `roomId` cùng `billingYear`, `billingMonth`. Mỗi invoice trong kết quả phải có `id`, `roomCode`, `billingPeriodStart`, `billingPeriodEnd`, `invoiceNumber`, `status`, `totalAmount` và `outstandingAmount`.

API phải áp dụng authorization theo cơ sở/property cho danh sách phòng, báo cáo và deep-link hóa đơn. UI không phải hàng rào bảo mật.

## 10. Acceptance criteria

1. Với hóa đơn có điện từ 125 đến 142 kWh, chi tiết hiển thị `125 kWh → 142 kWh = 17 kWh`, đúng đơn giá và đúng thành tiền do API trả về.
2. Với hóa đơn có nước từ 30 đến 34 m³, chi tiết hiển thị `30 m³ → 34 m³ = 4 m³`, đúng đơn giá và thành tiền.
3. Nếu thiếu một chỉ số, UI hiển thị `Chưa có đủ chỉ số để đối chiếu` và không tự tạo phép trừ.
4. `In hóa đơn` chỉ bật sau khi chi tiết tải xong và mở print preview cho đúng hóa đơn đang chọn.
5. Bản in A4 chứa thông tin phòng, kỳ, từng khoản thu, phép đối chiếu điện/nước và nhóm tổng tiền; không chứa navigation, form thanh toán hoặc action button.
6. Báo cáo có filter `Phòng` mặc định `Tất cả phòng` và filter `Kỳ` mặc định tháng hiện tại; bấm `Xem báo cáo` gửi cả hai filter đã chọn.
7. Chọn Phòng P1 và kỳ 6/2026 chỉ hiển thị hóa đơn thuộc P1 trong kỳ đó ở section hóa đơn.
8. Mỗi record có link `Hóa đơn Phòng P1 tháng 6/2026`; kích hoạt link mở `/invoices?invoiceId={invoiceId}` và chọn đúng hóa đơn.
9. `Tải CSV` sử dụng cùng filter phòng và kỳ đang áp dụng.
10. Empty state nêu đúng phòng/kỳ, lỗi có `Thử lại`, và retry không làm mất filter hoặc deep-link.
11. Desktop 1024/1440 px và mobile 360/390/430 px không cuộn ngang; dòng chỉ số, thành tiền, filter và action không chồng lấp.
12. Các luồng xem chi tiết, lọc báo cáo, mở link và in dùng được bằng keyboard; Axe không có lỗi nghiêm trọng về label, tên link, heading, contrast hoặc trạng thái động.

## 11. Ma trận kiểm thử đề xuất

| Nhóm             | Kiểm tra                                                                           |
| ---------------- | ---------------------------------------------------------------------------------- |
| Nội dung hóa đơn | Điện/nước đủ chỉ số, bằng 0, có số lẻ, thiếu chỉ số, chỉ số bất thường             |
| Deep-link        | `invoiceId` hợp lệ, không tồn tại, không có quyền, refresh trực tiếp               |
| Báo cáo          | Tất cả phòng, một phòng, có/không có hóa đơn, giữ filter khi Back, CSV cùng filter |
| Print            | A4 portrait, đen trắng, hóa đơn dài hai trang, ẩn app shell/form/action            |
| Responsive       | 1440 x 900, 1024 x 768, 768 x 1024, 430 x 932, 390 x 844, 360 x 800                |
| Accessibility    | Keyboard, focus sau điều hướng, screen reader cho phép tính, zoom 200%, Axe        |

### Handoff

- Summary: Đã đặc tả luồng hiển thị chỉ số điện/nước trên hóa đơn, in hóa đơn và tra cứu hóa đơn theo phòng/kỳ trong Báo cáo cho desktop/mobile.
- Changed files: `docs/specs/INVOICE_USAGE_AND_ROOM_REPORT_UX.md`.
- Verification: Đối chiếu với `AGENTS.md`, `.codex/agents/ui-ux.md`, `docs/ui-ux-spec.md`, giao diện và test hiện tại của `invoices`/`reports`; tự review đủ loading, empty, error, accessibility, responsive và print states.
- Risks/assumptions: API hiện tại chưa thể hiện các trường snapshot chỉ số cũ/mới trong `InvoiceItem`; Backend/Database cần xác nhận nguồn dữ liệu lịch sử và không được suy ngược từ thành tiền. Filter phòng cần được authorization theo property.
- Remaining work: Product/BA xác nhận acceptance criteria; Backend/Database chốt contract và persistence snapshot; Frontend triển khai UI/print; QA kiểm thử theo ma trận; Security review authorization của deep-link và report filter.
- Suggested next owner: Product Agent xác nhận yêu cầu, sau đó Backend/Database Agent chốt data contract trước khi Frontend Agent triển khai.
