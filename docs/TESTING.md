# Testing Strategy — Phase 1

## Goals

Dam bao nghiep vu tai chinh cot loi co the kiem thu truoc khi code:

- Tinh dung `paidUntil`.
- Khong tao invoice/payment trung.
- Khong mat lich su tai chinh.
- Validation dung business rules.
- RBAC va thao tac nhay cam duoc chan.
- Transaction rollback khi loi giua chung.

## Assumptions

- `paidUntil` la exclusive boundary.
- Mui gio he thong duoc cau hinh va truyen ro vao service.
- Tien khong dung floating-point.
- Partial payment khong tang `paidUntil`.
- Huy payment tinh lai tu invoice/payment hop le.
- Payment API va utility cron idempotent.

## Test pyramid

- Unit: `PaymentPeriodCalculator`, utility calculation, validation schema, permission helper, invoice/debt status.
- Integration: API + database transaction, invoice creation, payment confirmation/cancellation, utility cron, RBAC, unique constraints.
- E2E: luong quan trong tu tao phong den thanh toan, dien nuoc, cong no va permission.
- Manual: responsive, loading/empty/error/success, confirm nguy hiem, accessibility co ban.

## Required PaymentPeriodCalculator cases

| ID      | Case                                   | Expected                                    |
| ------- | -------------------------------------- | ------------------------------------------- |
| PPC-001 | Daily, start `2026-08-01`, cycles 1    | `2026-08-02 00:00`                          |
| PPC-002 | Daily, current `2026-08-02`, cycles 10 | `2026-08-12 00:00`                          |
| PPC-003 | Weekly, start `2026-08-01`, cycles 1   | `2026-08-08 00:00`                          |
| PPC-004 | Weekly, current `2026-08-08`, cycles 4 | `2026-09-05 00:00`                          |
| PPC-005 | Monthly anchor 15                      | Next month day 15                           |
| PPC-006 | Monthly anchor 28                      | February day 28                             |
| PPC-007 | Monthly anchor 29 non-leap             | `2026-02-28`                                |
| PPC-008 | Monthly anchor 29 leap                 | `2028-02-29`                                |
| PPC-009 | Monthly anchor 30                      | February last day                           |
| PPC-010 | Monthly anchor 31                      | February last day                           |
| PPC-011 | Anchor 31 recovery                     | `2026-02-28` then `2026-03-31`              |
| PPC-012 | Anchor 31 sequence                     | `31/01`, `28/02`, `31/03`, `30/04`, `31/05` |
| PPC-013 | Prepay 12 months from `2026-01-31`     | `2027-01-31`                                |
| PPC-014 | Partial payment                        | `paidUntil` unchanged                       |
| PPC-015 | Same idempotency key twice             | One payment, one `paidUntil` update         |
| PPC-016 | Cancel latest payment                  | Recalculate from valid records              |
| PPC-017 | Invalid cycles 0/negative/decimal      | Validation error                            |
| PPC-018 | Timezone boundary                      | Local midnight preserved                    |

## Utility invoice cron

- Active room with finalized reading creates one utility invoice.
- Re-running same period creates no duplicate.
- Two concurrent workers create at most one invoice.
- Missing final reading does not create official invoice.
- Pricing priority is tenancy, room, default system/property.
- Invoice snapshots price; later config change does not alter old invoice.
- Room without active tenancy is skipped.
- Batch failure does not create orphan invoice/header without items.

## Validation tests

- Duplicate active room code rejected.
- Negative rent, electricity price, water price rejected.
- New reading lower than previous rejected.
- End date before start date rejected.
- Two active tenancies for one room rejected.
- One tenant in two active tenancies rejected.
- Invoice total below zero rejected.
- Overpayment rejected if MVP does not support credit.
- Editing locked/paid invoice rejected without adjustment.
- Hard delete financial history rejected.

## RBAC tests

- Anonymous user cannot access dashboard.
- Owner can manage room, tenant, invoice and payment.
- Future viewer cannot create payment.
- User scoped to property A cannot view property B.
- User lacking finance permission cannot void payment.
- Direct API calls enforce server-side authorization.

## Transaction rollback tests

- Payment created but invoice update fails: rollback all.
- Invoice updated but `paidUntil` update fails: rollback all.
- Invoice item creation fails: no orphan invoice.
- Utility cron fails after header: no incomplete official invoice or status is failed/draft by design.
- Void payment fails writing audit: payment is not voided.
- Idempotency conflict does not write duplicate data.

## E2E tests

- Login, create room, create tenant, create monthly tenancy, create rent invoice, pay full, `paidUntil` increases.
- Partial payment leaves debt and does not change `paidUntil`.
- Enter utility reading, run billing job, utility invoice appears with correct total.
- Overdue invoice appears in debt list with overdue days.
- User without permission is blocked from financial mutation.

## Manual checklist

- Desktop and mobile responsive.
- Form errors are clear and focus the right input.
- Debt status not color-only.
- Confirm exists for void payment, lock invoice, retire room.
- Loading, empty, error and success states exist.
- Money formatting and timezone display are correct.
- Audit log shows actor, action, time and key old/new data.

## Quality gates before Phase 2

- Product brief, user stories and acceptance criteria reviewed by QA.
- Payment algorithm doc covers date convention, timezone, anchor, partial, cancel and idempotency.
- API design covers validation, error format, transaction and idempotency.
- Database design has unique constraints for invoice/payment duplicate prevention.
- Security doc has trust boundaries and permission model.

## UX-COMPLETE-001 test matrix

### Mục tiêu và nguyên tắc

Ma trận này là quality gate cho đợt hoàn thiện luồng vận hành sau UX audit. Các test tài chính và tenancy phải chạy với ngày cố định, dữ liệu xác định trước và PostgreSQL thật; không phụ thuộc ngày hiện tại của máy chạy test.

- Bất biến dữ liệu được kiểm tra ở API/integration và trực tiếp trong database, không chỉ dựa trên text UI.
- Mỗi thao tác thay đổi tenancy hoặc tài chính phải có happy path, validation/failure path, retry và kiểm tra transaction rollback.
- E2E phải kiểm tra request chỉ được gửi sau khi người dùng đã nhìn thấy ngày hiệu lực, phạm vi ảnh hưởng, số tiền và xác nhận.
- Test UI dùng tên/mã nghiệp vụ; UUID chỉ được dùng trong setup hoặc assertion kỹ thuật.
- Dữ liệu PostgreSQL của suite dùng namespace riêng và phải được dọn sạch sau khi chạy, kể cả khi test thất bại.

### Dữ liệu chuẩn

| Fixture           | Dữ liệu cố định                                                 |
| ----------------- | --------------------------------------------------------------- |
| Tài khoản         | Owner `qa.owner@example.test`; không dùng credential production |
| Phòng A           | `QA-A`, giá 600.000 VND/tháng, điện cũ 100, nước cũ 20          |
| Phòng B           | `QA-B`, trống, giá 900.000 VND/tháng, điện cũ 40, nước cũ 10    |
| Phòng C           | `QA-C`, trống hoặc bảo trì tùy case                             |
| Lần thuê A        | Bắt đầu `2026-08-01`, đại diện A1, người ở chung A2 và A3       |
| Ngày chuyển/trả   | `2026-08-16`; ngày chốt tháng `2026-08-31`                      |
| Chỉ số bàn giao A | Điện mới 160, nước mới 28                                       |
| Đơn giá chung     | Điện 3.500 VND/kWh, nước 15.000 VND/m³                          |

### Ma trận nghiệp vụ và API

| ID          | Mức                       | Tình huống / thao tác                                                                              | Kết quả bắt buộc                                                                                                                                                                                  |
| ----------- | ------------------------- | -------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| UX-TEN-001  | Integration + PostgreSQL  | Đổi đại diện từ A1 sang A2 trong cùng lần thuê                                                     | A2 là đại diện duy nhất; A1 thành người ở chung; tenancy, room và membership vẫn giữ nguyên; không tạo settlement/invoice; có audit old/new actor/time.                                           |
| UX-TEN-002  | Integration + PostgreSQL  | Retry hoặc gửi đồng thời yêu cầu đổi A1 sang A2                                                    | Kết quả cuối luôn có đúng một đại diện; không có trạng thái tạm thời hai đại diện hoặc không có đại diện; retry trả kết quả idempotent hoặc conflict có kiểm soát.                                |
| UX-TEN-003  | Validation                | Đổi đại diện sang chính A1, người đã rời, người thuộc phòng khác hoặc tenant không tồn tại         | Bị từ chối bằng mã lỗi nghiệp vụ ổn định; không record nào bị thay đổi và không có audit thành công giả.                                                                                          |
| UX-TEN-004  | Integration + PostgreSQL  | Chuyển riêng người ở chung A2 từ QA-A sang QA-B ngày `2026-08-16`                                  | Tenancy QA-A vẫn active, A1 vẫn đại diện, A3 vẫn ở QA-A; không tạo reading/settlement/invoice cho QA-A; A2 có membership mới ở QA-B đúng ngày.                                                    |
| UX-TEN-005  | Boundary                  | Chuyển người ở chung với ngày trước ngày vào, trùng/chéo membership hoặc sang phòng không khả dụng | Request bị chặn; toàn bộ room, tenancy, membership và tài chính giữ nguyên.                                                                                                                       |
| UX-TEN-006  | Integration + PostgreSQL  | Đổi đại diện A1 sang A2 rồi chuyển riêng A1                                                        | A2 tiếp tục là đại diện QA-A; A1 được chuyển với vai trò hợp lệ tại phòng đích; QA-A không bị chốt.                                                                                               |
| UX-TEN-007  | Integration + PostgreSQL  | Chuyển cả nhóm QA-A sang QA-B ngày `2026-08-16`, nhập chỉ số bàn giao hợp lệ                       | QA-A có reading finalized, settlement prorate đến ngày chuyển và đúng một invoice; tenancy QA-A kết thúc; phòng QA-A thành Trống; tenancy QA-B bắt đầu đúng ngày với đủ A1/A2/A3 và đúng vai trò. |
| UX-TEN-008  | Financial assertion       | Kiểm tra hóa đơn phòng cũ của UX-TEN-007                                                           | Tiền phòng tính theo rule prorate đã duyệt; điện = `(160-100)*3.500`; nước = `(28-20)*15.000`; trả trước trừ vào tổng hóa đơn; snapshot giá/phòng/người thanh toán không đổi về sau.              |
| UX-TEN-009  | Transaction failure       | Ép lỗi khi tạo invoice sau khi đã chuẩn bị settlement của chuyển cả nhóm                           | Rollback toàn bộ: tenancy cũ chưa kết thúc, phòng chưa đổi trạng thái, không có membership mới, reading/settlement/invoice dở dang. UI có thể retry.                                              |
| UX-TEN-010  | Idempotency               | Gửi lại cùng yêu cầu chuyển cả nhóm/chốt phòng với cùng source hoặc idempotency key                | Không tạo trùng tenancy, membership, reading, settlement hoặc invoice; trả lại kết quả cũ hoặc phản hồi idempotent theo API contract.                                                             |
| UX-ROOM-001 | Integration + PostgreSQL  | Tạo tenancy, chuyển người ở chung, kết thúc/chuyển cả nhóm                                         | `VACANT/OCCUPIED` luôn được suy ra từ active tenancy; chuyển một người không làm QA-A trống; kết thúc nhóm làm QA-A trống.                                                                        |
| UX-ROOM-002 | API + UI                  | Cố sửa tay `VACANT/OCCUPIED`; bật bảo trì/ngừng dùng khi còn người                                 | API không nhận sửa occupancy trực tiếp; UI không có control chỉnh tay; bảo trì/ngừng dùng bị chặn khi còn active occupancy theo rule.                                                             |
| UX-BILL-001 | Integration + PostgreSQL  | `Chốt và tạo hóa đơn` cuối tháng thành công                                                        | Settlement finalized và đúng một invoice được tạo trong cùng transaction; tổng hóa đơn bằng tiền phòng + điện + nước - số dư/trả trước theo rule.                                                 |
| UX-BILL-002 | Idempotency + concurrency | Double-click, retry sau timeout và hai request đồng thời cho cùng phòng/kỳ                         | Chỉ có một settlement finalized và một invoice; constraint/source key ngăn bản ghi trùng.                                                                                                         |
| UX-BILL-003 | Transaction failure       | Ép lỗi tạo invoice hoặc item trong thao tác chốt                                                   | Không để settlement finalized không có invoice và không có invoice/header/item mồ côi; phản hồi lỗi cho phép retry an toàn.                                                                       |
| UX-BILL-004 | Validation                | Chỉ số mới nhỏ hơn cũ, thiếu reading trả phòng, duplicate kỳ, tiền âm hoặc ngày ngoài tenancy      | Không đóng tenancy/chốt kỳ; lỗi tiếng Việt chỉ rõ trường và cách xử lý; dữ liệu cũ không đổi.                                                                                                     |
| UX-AUTH-001 | Integration + E2E         | Đăng nhập, đăng xuất, gọi API bằng cookie/session cũ                                               | Logout hủy session phía server và clear cookie; API cũ trả `401/403` theo contract; Back/refresh không mở lại route quản trị và chuyển về login.                                                  |
| UX-AUTH-002 | UI/E2E                    | Mở login trong production-like build                                                               | Email/mật khẩu không được điền sẵn; mật khẩu không xuất hiện trong HTML/JS hoặc log test.                                                                                                         |

### Ma trận hành trình và giao diện

| ID        | Viewport / route                         | Thao tác                                                                                     | Kết quả bắt buộc                                                                                                                                                                  |
| --------- | ---------------------------------------- | -------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| UX-UI-001 | Desktop + mobile, `/tenants`             | Mở `Chuyển người này`, `Rời phòng`, `Đổi người đại diện`, `Chuyển cả phòng`, `Kết thúc thuê` | Dialog hiển thị trường ngày hiệu lực; không dùng ngày ẩn hoặc ngày hệ thống ngoài ý muốn; nút xác nhận nêu phòng, ngày và số người bị ảnh hưởng.                                  |
| UX-UI-002 | Desktop + mobile, `/tenants`             | Chọn người ở chung và đại diện                                                               | Người ở chung chỉ thấy action cá nhân; đại diện thấy action toàn phòng và đổi đại diện; đại diện cũ chỉ chuyển/rời riêng sau khi đổi vai trò nếu còn người khác.                  |
| UX-UI-003 | Desktop + mobile, `/tenants`             | Hủy confirm rồi xác nhận chuyển/trả phòng                                                    | Hủy không gửi mutation; xác nhận chỉ gửi đúng một request với ngày đang hiển thị; submit bị disable trong lúc chờ.                                                                |
| UX-UI-004 | Desktop + mobile, `/utilities`           | Chốt cuối tháng hoặc trả phòng                                                               | Tab/H1 là `Chốt tiền`; kỳ tự sinh; điện/nước cũ read-only; preview hiện tiền phòng, điện, nước, trả trước và còn thu; primary action là `Chốt và tạo hóa đơn`.                    |
| UX-UI-005 | Desktop + mobile, `/rooms` và `/tenants` | Load, chọn dòng, bấm tạo mới, reload                                                         | Active row, heading và form luôn cùng một record/mode; tạo mới bỏ active row và reset; không có selected-but-empty.                                                               |
| UX-UI-006 | Desktop + mobile, `/`                    | Fixture có phòng chưa chốt, đã chốt chưa có hóa đơn, sắp đến hạn và quá hạn                  | Dashboard hiển thị đủ bốn nhóm theo đúng ưu tiên; mỗi dòng có phòng, kỳ, lý do, tiền nếu có và CTA tới đúng record; không hiện `Ổn định` khi còn việc.                            |
| UX-UI-007 | Desktop + mobile, các mutation chính     | Tạo/sửa phòng, tenant, đổi/chuyển/trả phòng, chốt tiền, thu tiền và lỗi tương ứng            | Có một feedback thành công duy nhất, nội dung gồm đối tượng/kết quả; lỗi nghiệp vụ bằng tiếng Việt, đặt đúng vùng; loading chặn submit lặp; message được công bố qua `aria-live`. |
| UX-UI-008 | Mobile `/reports`                        | Hiển thị ít nhất 3 record, mã/tên dài                                                        | Mỗi record là khối label-value dễ ghép; Tổng/Còn thu/trạng thái không mất nhãn và không cần suy luận thứ tự cột.                                                                  |
| UX-UI-009 | Toàn bộ route                            | Kiểm tra nội dung và định dạng                                                               | Menu/heading/label/trạng thái dùng tiếng Việt có dấu; không dùng UUID làm subtitle chính; tiền theo `vi-VN` có VND; điện/nước có kWh, m³ và đơn giá đúng.                         |

### Responsive và accessibility

| ID          | Công cụ / phạm vi                                                                                                                        | Assertion                                                                                                                                     |
| ----------- | ---------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| UX-RWD-001  | Playwright tại 360, 390 và 430 px trên `/`, `/rooms`, `/tenants`, `/utilities`, `/invoices`, `/debts`, `/reports`, `/settings`, `/login` | `document.documentElement.scrollWidth <= document.documentElement.clientWidth + 2`; không có control, dialog, table/card hoặc text bị cắt/đè. |
| UX-RWD-002  | Playwright tại 768, 1024 và 1440 px                                                                                                      | Navigation, form hai cột/bảng và modal không đổi kích thước bất ngờ; active route rõ; screenshot không có overlap.                            |
| UX-RWD-003  | Mobile navigation                                                                                                                        | Bốn mục thường dùng và menu `Thêm` truy cập được; target chạm tối thiểu 44 x 44 px; focus/active state rõ và không cuộn ngang.                |
| UX-A11Y-001 | Axe trên mọi route ở desktop và 390 px                                                                                                   | Không có violation `color-contrast`; text thường tối thiểu 4.5:1; badge vẫn có nhãn chữ, không truyền trạng thái chỉ bằng màu.                |
| UX-A11Y-002 | Keyboard/manual                                                                                                                          | Có thể đi qua navigation, form và action bằng keyboard; modal trap focus, Escape đóng, đóng xong trả focus về trigger; focus không bị che.    |
| UX-A11Y-003 | Zoom/high contrast/manual                                                                                                                | Zoom 200% và Windows high contrast vẫn đọc/ thao tác được; status, error và success không mất nghĩa.                                          |

### PostgreSQL clean-state end-to-end

Suite này chạy tuần tự trên database test riêng, ví dụ tên có hậu tố run ID. Không chạy trên database local chứa dữ liệu người dùng và không dùng lệnh truncate/drop nếu chưa xác nhận đúng database test.

1. Xác minh connection string trỏ đến database test và schema rỗng; chạy migration hiện hành.
2. Seed duy nhất owner, cấu hình chung, QA-A/QA-B/QA-C và tenant A1/A2/A3 theo fixture ở trên.
3. Đăng nhập; xác nhận Dashboard, Phòng và Người thuê phản ánh đúng clean state.
4. Tạo tenancy QA-A; xác nhận trạng thái phòng được suy ra là Đang thuê.
5. Đổi đại diện A1 → A2; xác nhận bất biến và audit; retry để kiểm tra idempotency.
6. Chuyển riêng A1 sang QA-B; xác nhận QA-A không có settlement/invoice và A2 vẫn đại diện.
7. Chuyển cả nhóm còn lại từ QA-A sang QA-C ngày `2026-08-16`; nhập reading; preview; confirm; xác nhận settlement và invoice phòng cũ, trạng thái hai phòng và lịch sử thành viên.
8. Chốt cuối tháng cho phòng đang thuê; retry/double-submit; ghi nhận thanh toán một phần rồi đủ; xác nhận Hóa đơn, Công nợ, Dashboard và Báo cáo cùng số liệu.
9. Đăng xuất; dùng session cũ gọi API và Back/refresh để xác nhận invalidation.
10. Chạy responsive screenshots và Axe trên dữ liệu vừa tạo; lưu artifact khi fail, không lưu credential/PII.
11. Cleanup trong `finally`: xóa theo run ID theo thứ tự phụ thuộc hoặc drop schema/database test đã xác minh; đóng connection và server test.
12. Xác nhận sau cleanup không còn room, tenant, tenancy, membership, reading, settlement, invoice, invoice item, payment, session hoặc audit record mang run ID. Cleanup thất bại làm suite thất bại và in đúng danh sách record còn sót.

### Exit criteria

- Tất cả case `UX-TEN`, `UX-ROOM`, `UX-BILL` và `UX-AUTH` pass trên PostgreSQL thật; không chỉ pass bằng in-memory repository.
- E2E clean-state pass ít nhất hai lần liên tiếp để phát hiện lỗi idempotency và phụ thuộc thứ tự.
- Không còn horizontal overflow tại 360/390/430 px và không còn Axe `color-contrast` violation trên route trong phạm vi.
- Không có record test còn sót sau cleanup; không có secret hoặc dữ liệu người thật trong artifact.
- Lỗi test phải giữ screenshot, trace, request/response đã che dữ liệu nhạy cảm và database assertion liên quan.

### Rủi ro cần Lead theo dõi

- Rule prorate phải dùng đúng quy ước ngày đã chốt trong business rules; test không tự định nghĩa lại số ngày tính tiền.
- Nếu API chưa có idempotency key công khai, cần chứng minh bằng unique constraint/source key và transaction dưới concurrent request.
- Test ép lỗi transaction cần fault-injection hoặc repository double có kiểm soát; không được làm hỏng database dùng chung.
- Audit log và logout chạm dữ liệu nhạy cảm/session, cần Security review trước khi đạt Definition of Done.
