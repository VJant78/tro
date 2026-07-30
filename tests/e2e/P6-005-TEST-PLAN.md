# P6-005 QA test plan

## Phạm vi

Xác minh snapshot chỉ số điện/nước trên hóa đơn, fallback hóa đơn cũ, tra cứu theo phòng/kỳ, deep-link có phân quyền, CSV cùng bộ lọc và bản in responsive. Không kiểm thử sinh PDF phía server hoặc public share link vì ngoài phạm vi P6-005.

## Dữ liệu chuẩn

- Property A: phòng P1, P2; phòng P3 ở trạng thái `INACTIVE`.
- Property B: phòng B1 và một hóa đơn riêng để kiểm tra cô lập dữ liệu.
- Kỳ chính: `billingYear=2026`, `billingMonth=6`; thêm hóa đơn phát hành tháng 7 nhưng thuộc kỳ tháng 6.
- P1 có hai hóa đơn cùng kỳ với ID khác nhau; một hóa đơn `CANCELLED`.
- Hóa đơn mới có snapshot điện `120 -> 145`, nước `30 -> 35`; amount và đơn giá đã chốt.
- Hóa đơn legacy gồm: một record có đúng một finalized reading hợp lệ, một record không có liên kết rõ ràng và một record có nhiều liên kết mơ hồ.

## Ma trận kiểm thử

| ID        | Tầng                   | Kịch bản                                                                                   | Kết quả bắt buộc                                                                                                                                                                          |
| --------- | ---------------------- | ------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| SNAP-01   | API + PostgreSQL       | Tạo hóa đơn mới từ settlement đã finalized                                                 | Item điện/nước lưu và trả đủ `previousReading`, `currentReading`, `quantity`, `unit`, `unitPrice`, `amount`; sửa pricing/reading sau đó không đổi snapshot hóa đơn.                       |
| SNAP-02   | Component              | Mở hóa đơn mới có điện `120 -> 145` và nước `30 -> 35`                                     | Hiển thị lần lượt `25 kWh`, `5 m3`, đúng đơn giá và amount server trả; UI không tự tính lại total.                                                                                        |
| SNAP-03   | API + Component        | Chỉ số cũ bằng mới; hóa đơn chỉ có một loại tiện ích                                       | Hiển thị lượng dùng `0` đúng đơn vị; không tạo dòng tiện ích không tồn tại.                                                                                                               |
| LEG-01    | API + PostgreSQL       | Legacy invoice thiếu snapshot nhưng có đúng một finalized reading cùng room/tenancy/period | Trả fallback chỉ số read-only; amount/total vẫn lấy từ invoice; không ghi ngược metadata vào invoice.                                                                                     |
| LEG-02    | API + Component        | Legacy invoice không có reading hoặc liên kết mơ hồ/void                                   | Không suy đoán hay trả số `0` giả; UI báo thiếu dữ liệu chỉ số và vẫn hiển thị amount lịch sử.                                                                                            |
| REPORT-01 | API + PostgreSQL       | Lọc `roomId=P1`, tháng 6/2026                                                              | Chỉ trả hóa đơn P1 có `billingYear=2026`, `billingMonth=6`; không dựa vào `issuedOn`, `dueOn` hoặc ngày thanh toán.                                                                       |
| REPORT-02 | API + Component        | Chọn `Tất cả phòng`, tháng 6/2026 và phân trang                                            | Chỉ trả dữ liệu Property A đúng kỳ, đúng limit/page; empty/error/retry không giữ kết quả cũ sai bộ lọc.                                                                                   |
| REPORT-03 | API + Component        | P1 có nhiều hóa đơn cùng tháng                                                             | Mỗi invoice là một record riêng, có số hóa đơn/khoảng kỳ phân biệt được và link mang chính xác ID tương ứng.                                                                              |
| REPORT-04 | API + PostgreSQL       | Hóa đơn `CANCELLED` và hóa đơn của phòng `INACTIVE`                                        | Cả hai vẫn tra cứu được; cancelled có nhãn rõ, mở được nhưng không cộng vào tổng hiệu lực; phòng inactive không biến mất khỏi tra cứu lịch sử.                                            |
| LINK-01   | Component + E2E        | Mở `/invoices?invoiceId={id}` và bấm từng link của hai hóa đơn P1 cùng tháng               | Luôn chọn/tải đúng invoice ID, đúng phòng và kỳ; refresh trực tiếp không rơi về hóa đơn đầu tiên.                                                                                         |
| LINK-02   | Component              | Invoice ID không tồn tại hoặc detail lỗi                                                   | Hiển thị lỗi chung tiếng Việt và CTA quay lại; không hiển thị dữ liệu hóa đơn đã chọn trước đó.                                                                                           |
| SEC-01    | API                    | Không có session gọi list report, CSV hoặc invoice detail                                  | Trả `401`, response không chứa dữ liệu hóa đơn.                                                                                                                                           |
| SEC-02    | API + PostgreSQL       | Session Property A truy cập invoice/room/report của Property B                             | Trả `404` cho invoice detail và không trả record Property B trong report/CSV; không lộ metadata qua message/log response.                                                                 |
| SEC-03    | API + Component        | VIEWER hợp lệ xem và in hóa đơn                                                            | Đọc được dữ liệu được phép, không có mutation action; thao tác xem/in không thay đổi invoice, payment, settlement hoặc reading.                                                           |
| CSV-01    | API                    | Tải CSV với P1 + tháng 6/2026                                                              | Request dùng cùng `roomId`, `billingYear`, `billingMonth` đang áp dụng; CSV chỉ chứa record tương ứng và không chứa P2/tháng khác.                                                        |
| CSV-02    | API                    | Tải CSV với tất cả phòng và giá trị bắt đầu bằng `=`, `+`, `-`, `@`                        | Giữ đúng filter/property scope và chống CSV formula injection theo helper hiện có.                                                                                                        |
| PRINT-01  | Component + Playwright | Bấm `In hóa đơn` sau khi detail tải xong                                                   | Gọi print cho đúng invoice đang chọn; nút disabled khi loading/error; không phát sinh request mutation.                                                                                   |
| PRINT-02  | Playwright             | Render `print` ở A4 portrait, hóa đơn thường và dài hai trang                              | Có phòng, số hóa đơn, kỳ, payer, dòng tiền, chỉ số cũ/mới/lượng dùng, tổng/đã trả/còn thu/trạng thái; ẩn navigation, filter, form và action; nhóm số liệu không chồng lấp/cắt bất hợp lý. |
| RESP-01   | Playwright + Axe       | Report và invoice detail tại 1440x900, 1024x768, 768x1024, 430x932, 390x844, 360x800       | Không overflow ngang/overlap; link/control tối thiểu 44x44 px; nội dung chỉ số không ellipsis; Axe không có lỗi nghiêm trọng.                                                             |
| RESP-02   | Component + Playwright | Keyboard filter, mở deep-link, retry và in; zoom 200%                                      | Thứ tự focus hợp lý, label/heading/live region đúng, phép tính và action vẫn đọc và thao tác được.                                                                                        |

## Quality gate

- Component/API tests mới đạt cùng `npm run check`.
- PostgreSQL E2E chạy trên schema đã migrate, fixture cô lập theo property và cleanup chỉ dữ liệu do test tạo.
- Playwright lưu evidence desktop/mobile/print; không có console error, failed request ngoài case cố ý hoặc Axe serious/critical.
- Security gate phải đạt toàn bộ `SEC-*` trước nghiệm thu.

## Handoff

- **Đã làm:** Lập ma trận QA P6-005 cho snapshot mới, legacy fallback/missing, filter phòng/kỳ, nhiều hóa đơn, cancelled, phòng inactive, deep-link, security, CSV, print và responsive.
- **File thay đổi:** `tests/e2e/P6-005-TEST-PLAN.md`.
- **Cách kiểm tra:** Review mapping `SNAP/LEG/REPORT/LINK/SEC/CSV/PRINT/RESP` với AC1-AC11 của brief và UX spec.
- **Rủi ro/giả định:** Contract snapshot và pagination cuối cùng chưa được Architecture/Backend khóa; tên field/endpoint trong test executable phải bám contract được Lead phê duyệt.
- **Việc còn lại:** Backend/Database triển khai contract, Frontend triển khai UI; QA sau đó viết component/API/PostgreSQL/Playwright tests theo matrix này.
- **Agent tiếp theo:** Architecture hoặc Backend Agent.
