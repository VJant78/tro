# Product Brief: Chỉ số sử dụng trên hóa đơn và tra cứu theo phòng

## Trạng thái

- Task: `P6-005`.
- Giai đoạn: Product discovery, sẵn sàng để Lead review và lập kế hoạch kỹ thuật.
- Phạm vi: hóa đơn điện/nước, báo cáo tra cứu hóa đơn theo phòng và tháng, in/lưu PDF bằng trình duyệt.
- Rủi ro: Cao vì dữ liệu hiển thị phải khớp snapshot tài chính, đúng phạm vi property và không làm sai lịch sử hóa đơn đã phát hành.

## Vấn đề

Hóa đơn hiện chỉ cho người xem biết số tiền điện và nước. Người thuê không thấy chỉ số cũ, chỉ số mới và lượng đã dùng nên khó tự đối chiếu phép tính. Chủ trọ cũng chưa có luồng đơn giản để chọn phòng và tháng, tìm đúng hóa đơn rồi mở hoặc in hóa đơn đó.

## Goal

1. Trên chi tiết hóa đơn, mỗi khoản điện và nước hiển thị rõ chỉ số cũ, chỉ số mới, lượng dùng, đơn giá và thành tiền.
2. Trên Báo cáo, người dùng có thể lọc theo phòng và tháng tính tiền, sau đó mở đúng hóa đơn từ kết quả.
3. Hóa đơn có bố cục in phù hợp để người dùng dùng chức năng Print/Save as PDF sẵn có của trình duyệt.
4. Hóa đơn và link hóa đơn luôn nằm sau đăng nhập, kiểm tra quyền và phạm vi property; không tạo link công khai.

## Người dùng và quyền

- OWNER, MANAGER, STAFF và VIEWER đã được cấp quyền trong property có thể tra cứu, xem và in hóa đơn theo quyền đọc hóa đơn hiện có.
- Việc xem/in không phải mutation và không thay đổi invoice, payment, settlement hay utility reading.
- Người chưa đăng nhập nhận `401` hoặc được chuyển đến đăng nhập.
- Người đã đăng nhập nhưng không thuộc property không được biết hóa đơn có tồn tại; API trả `404` theo quy ước chống rò rỉ dữ liệu hiện có.
- Báo cáo và link chi tiết không bổ sung CCCD, địa chỉ, số điện thoại hoặc dữ liệu nhạy cảm không cần thiết.

## Luồng chính

### Xem mức sử dụng trên hóa đơn

1. Người dùng mở một hóa đơn từ tab Hóa đơn, Công nợ hoặc Báo cáo.
2. Nếu hóa đơn có khoản điện, giao diện hiển thị chỉ số cũ, chỉ số mới, phép trừ/lượng dùng, đơn giá và thành tiền điện.
3. Nếu hóa đơn có khoản nước, giao diện hiển thị cùng cấu trúc cho nước.
4. Các khoản tiền phòng, phí, giảm trừ, số đã thanh toán và còn phải thu giữ hành vi hiện tại.
5. Người dùng có thể bấm `In hóa đơn`; trình duyệt mở hộp thoại in và có thể chọn `Save as PDF` nếu môi trường hỗ trợ.

### Tra cứu hóa đơn theo phòng và tháng

1. Trong tab Báo cáo, người dùng chọn tháng/năm tính tiền và chọn một phòng hoặc `Tất cả phòng`.
2. Hệ thống trả về các hóa đơn thuộc đúng property và có `billingYear/billingMonth` trùng bộ lọc.
3. Mỗi kết quả hiển thị tối thiểu: mã/tên phòng, số hóa đơn, kỳ hoặc khoảng thời gian tính tiền, trạng thái, tổng tiền, đã thanh toán và còn phải thu.
4. Link có nhãn dễ hiểu, ví dụ `Hóa đơn Phòng P1 tháng 06/2026`, mở đúng chi tiết hóa đơn tương ứng.
5. Khi quay lại Báo cáo, bộ lọc phòng và tháng gần nhất trong phiên giao diện được giữ nếu luồng điều hướng hiện tại cho phép.

## Business rules

### Dữ liệu điện/nước trên hóa đơn

- Lượng dùng điện bằng `chỉ số điện mới - chỉ số điện cũ`; đơn vị là `kWh`.
- Lượng dùng nước bằng `chỉ số nước mới - chỉ số nước cũ`; đơn vị là `m3`.
- Chỉ số mới không được nhỏ hơn chỉ số cũ theo rule utility reading hiện có. Nghiệp vụ thay đồng hồ/quay vòng vẫn là luồng riêng và không được suy đoán trong màn hình hóa đơn.
- Thành tiền hiển thị lấy từ invoice item đã phát hành. Giao diện không tự tính lại tổng hóa đơn từ giá cấu hình hiện tại.
- Với hóa đơn mới, chỉ số cũ, chỉ số mới, lượng dùng, đơn vị, đơn giá và thành tiền phải được snapshot từ finalized utility reading/settlement vào dữ liệu hóa đơn hoặc metadata bất biến tương đương khi tạo hóa đơn.
- Đơn giá và thành tiền dùng snapshot của invoice item, không dùng giá điện/nước hiện tại trong Cài đặt.
- Số lượng sử dụng hỗ trợ phần thập phân theo độ chính xác utility reading hiện có; không làm tròn thành số nguyên chỉ để hiển thị.
- Tiền hiển thị theo VND và quy tắc format hiện có. Chỉ số/đơn vị không được gắn nhầm ký hiệu tiền.
- Nếu lượng dùng bằng `0`, vẫn hiển thị đầy đủ chỉ số cũ, mới, lượng dùng `0` và thành tiền thực tế của invoice item.
- Nếu hóa đơn không có khoản điện hoặc nước thì không tạo dòng giả cho khoản đó.
- Hóa đơn đã phát hành/đã thanh toán là chứng từ lịch sử: thao tác xem hoặc in không được sửa snapshot, item, total, status hay reading liên quan.

### Tra cứu theo phòng và tháng

- Tháng báo cáo được xác định bằng `billingYear/billingMonth` của hóa đơn, không phải tháng của `issuedOn`, `dueOn` hay ngày thanh toán.
- Bộ lọc tháng mặc định là tháng nghiệp vụ hiện tại theo timezone cấu hình; người dùng có thể chọn tháng/năm khác.
- Bộ lọc phòng dùng định danh phòng ổn định; giao diện hiển thị mã/tên phòng thay vì UUID.
- `Tất cả phòng` trả về hóa đơn của mọi phòng mà người dùng được phép xem trong property hiện tại. Chọn một phòng chỉ trả về hóa đơn của phòng đó.
- Kết quả gồm các hóa đơn đã phát hành thuộc kỳ, kể cả `ISSUED`, `PARTIALLY_PAID`, `PAID`, `OVERDUE` và `CANCELLED`. Hóa đơn bị hủy phải có nhãn rõ và không được cộng vào tổng tài chính như hóa đơn còn hiệu lực.
- `DRAFT` không xuất hiện trong báo cáo hóa đơn đã phát hành.
- Nếu cùng một phòng có nhiều tenancy hoặc nhiều hóa đơn hợp lệ trong cùng tháng, mỗi hóa đơn là một kết quả riêng; khoảng thời gian và số hóa đơn giúp phân biệt.
- Phòng đã ngừng hoạt động nhưng có hóa đơn lịch sử vẫn phải tra cứu được theo tháng, không làm mất chứng từ.
- Kết quả không được tải không giới hạn; API áp dụng pagination/limit theo convention hiện có.
- Tổng số trên Báo cáo tiếp tục lấy từ invoice/payment records hiện có. Việc thêm link không tạo một nguồn tổng hợp tài chính thứ hai.

### Link, xác thực và in/PDF

- Mỗi link trỏ đến route chi tiết invoice ổn định bằng invoice identity; server luôn kiểm tra session, RBAC và property scope khi tải dữ liệu.
- Không đưa dữ liệu đầy đủ của hóa đơn vào query string, local URL hay token có thể chia sẻ công khai.
- Mở trực tiếp link khi chưa đăng nhập không được hiển thị dữ liệu hóa đơn. Sau đăng nhập, ứng dụng có thể quay lại link đích nếu cơ chế session hiện có hỗ trợ an toàn.
- Link không phải tenant portal, public share link, signed public URL hoặc file PDF tĩnh.
- `In hóa đơn` dùng print stylesheet và `window.print`/khả năng in chuẩn của trình duyệt. Hệ thống không sinh, lưu trữ hoặc gửi file PDF từ server trong P6-005.
- Bản in chỉ chứa nội dung chứng từ cần thiết; ẩn menu, bộ lọc, nút thao tác và thành phần quản trị không liên quan.
- Bản in phải có tối thiểu: mã/tên phòng, số hóa đơn, kỳ tính tiền, ngày phát hành/đến hạn nếu có, người đại diện/payer đã snapshot, các dòng tiền, chi tiết điện/nước, tổng tiền, đã thanh toán, còn phải thu và trạng thái.
- Giao diện web và bản in phải thể hiện cùng số liệu từ một invoice detail response, không gọi phép tính tài chính riêng cho chế độ in.

## User stories

- As a chủ trọ, I want hóa đơn hiển thị chỉ số điện/nước cũ và mới, so that tôi có thể giải thích cách tính tiền cho người thuê.
- As a người xem hóa đơn, I want thấy lượng dùng và đơn giá bên cạnh thành tiền, so that tôi tự đối chiếu được phép tính.
- As a chủ trọ, I want lọc Báo cáo theo phòng và tháng, so that tôi tìm đúng hóa đơn mà không phải dò toàn bộ danh sách.
- As a chủ trọ, I want mở hóa đơn trực tiếp từ kết quả Báo cáo, so that tôi có thể kiểm tra hoặc in ngay.
- As a chủ trọ, I want dùng chức năng in của trình duyệt để lưu PDF, so that tôi có thể gửi hoặc lưu chứng từ bằng công cụ có sẵn trên máy.
- As a người quản lý property, I want link hóa đơn vẫn yêu cầu đăng nhập và đúng quyền, so that dữ liệu tài chính không bị công khai ngoài hệ thống.

## Acceptance criteria

### AC1 - Hiển thị điện đầy đủ

- Given invoice có item điện với chỉ số cũ `120`, chỉ số mới `145`, đơn giá `3.500 VND/kWh` và amount `87.500 VND`, when mở chi tiết hóa đơn, then giao diện hiển thị `120`, `145`, `25 kWh`, `3.500 VND/kWh` và `87.500 VND` trên cùng ngữ cảnh khoản điện.

### AC2 - Hiển thị nước đầy đủ

- Given invoice có item nước với chỉ số cũ `30`, chỉ số mới `35`, đơn giá `15.000 VND/m3` và amount `75.000 VND`, when mở chi tiết hóa đơn, then giao diện hiển thị `30`, `35`, `5 m3`, `15.000 VND/m3` và `75.000 VND` trên cùng ngữ cảnh khoản nước.

### AC3 - Sử dụng bằng không và khoản không tồn tại

- Given chỉ số cũ bằng chỉ số mới, when xem hóa đơn, then lượng dùng hiển thị `0` với đúng đơn vị và không bị coi là thiếu dữ liệu.
- Given invoice chỉ có tiền phòng và không có item điện/nước, when xem hóa đơn, then giao diện không hiển thị chỉ số điện/nước giả bằng `0`.

### AC4 - Snapshot không bị tính lại

- Given giá điện/nước trong Cài đặt đã thay đổi sau khi invoice được phát hành, when mở lại hoặc in invoice, then chỉ số, đơn giá, amount và tổng tiền vẫn theo snapshot của invoice tại thời điểm phát hành.
- Given invoice đã `PAID`, when người dùng xem hoặc in, then không có mutation nào tới invoice, reading, settlement, allocation hoặc payment.

### AC5 - Tương thích hóa đơn cũ

- Given legacy invoice chưa có metadata chỉ số nhưng có liên kết duy nhất, hợp lệ đến finalized utility reading của cùng room/tenancy/period, when mở invoice, then hệ thống có thể hiển thị chỉ số từ liên kết đó mà không sửa invoice và vẫn dùng invoice item amount làm thành tiền.
- Given legacy invoice không có liên kết reading rõ ràng, when mở invoice, then amount cũ vẫn hiển thị, các chỉ số không được đặt giả bằng `0`, và UI ghi rõ `Không có dữ liệu chỉ số cho hóa đơn cũ`.
- Given dữ liệu reading liên kết và invoice item amount không khớp do lịch sử điều chỉnh, when mở invoice, then thành tiền và total của invoice vẫn là giá trị chứng từ; UI không âm thầm tính lại hoặc ghi đè lịch sử.

### AC6 - Lọc đúng phòng và tháng

- Given Phòng P1 có invoice với `billingYear=2026`, `billingMonth=6` và P2 có invoice cùng tháng, when chọn P1 và `06/2026`, then kết quả chỉ chứa invoice của P1 trong tháng 06/2026.
- Given invoice phát hành ngày `02/07/2026` nhưng có `billingYear=2026`, `billingMonth=6`, when lọc `06/2026`, then invoice vẫn xuất hiện; when lọc `07/2026`, then invoice không xuất hiện chỉ vì ngày phát hành.
- Given chọn `Tất cả phòng` và `06/2026`, when tải báo cáo, then kết quả chỉ gồm invoice tháng 06/2026 trong property được cấp quyền và được phân trang theo contract.

### AC7 - Nhiều hóa đơn và trạng thái lịch sử

- Given P1 có hai invoice hợp lệ cho hai khoảng ở khác nhau trong cùng tháng, when lọc P1 và tháng đó, then cả hai xuất hiện thành hai dòng với số hóa đơn và khoảng thời gian phân biệt được.
- Given một invoice đã `CANCELLED`, when báo cáo trả invoice đó, then dòng có nhãn `Đã hủy`, mở được để đối chiếu lịch sử và không được cộng vào tổng hóa đơn hiệu lực.
- Given phòng đã `INACTIVE` nhưng có invoice lịch sử, when lọc đúng phòng/tháng, then invoice vẫn được tìm thấy.

### AC8 - Link mở đúng hóa đơn

- Given kết quả có link `Hóa đơn Phòng P1 tháng 06/2026`, when người dùng đã đăng nhập và có quyền bấm link, then ứng dụng mở chi tiết đúng invoice ID, đúng P1 và đúng kỳ 06/2026.
- Given hai invoice cùng phòng/tháng, when bấm từng link, then mỗi link mở đúng invoice tương ứng, không chỉ mở invoice đầu tiên của tháng.

### AC9 - Bảo vệ link

- Given người dùng chưa đăng nhập mở URL chi tiết invoice, when ứng dụng/API xử lý, then không có dữ liệu hóa đơn được hiển thị và response là `401` hoặc chuyển đến đăng nhập.
- Given người dùng property A mở URL invoice thuộc property B, when API xử lý, then trả `404` và không lộ metadata invoice/property B.
- Given VIEWER hợp lệ mở hoặc in invoice, when request hoàn tất, then chỉ có quyền đọc; không xuất hiện action mutation ngoài quyền.

### AC10 - In và lưu PDF qua trình duyệt

- Given invoice detail đã tải thành công, when bấm `In hóa đơn`, then hộp thoại in của trình duyệt được mở và người dùng có thể chọn Save as PDF nếu trình duyệt/hệ điều hành hỗ trợ.
- Given xem print preview ở khổ A4, when render, then menu, navigation, bộ lọc và nút thao tác bị ẩn; số hóa đơn, phòng, kỳ, payer, item, chi tiết chỉ số, tổng, đã trả, còn phải thu và trạng thái vẫn đọc được, không chồng lấp hoặc bị cắt ngang bất hợp lý.
- Given API invoice detail lỗi hoặc chưa tải xong, when người dùng thao tác in, then hệ thống không in một chứng từ rỗng/sai và hiển thị trạng thái lỗi hoặc vô hiệu hóa nút in.

### AC11 - Responsive và trạng thái giao diện

- Given viewport desktop hoặc mobile `360/390/430 px`, when mở báo cáo và invoice detail, then không có horizontal overflow/overlap, nhãn chỉ số vẫn gắn đúng giá trị và primary touch target tối thiểu `44 x 44 px`.
- Given không có invoice khớp bộ lọc, when tải báo cáo, then hiển thị empty state tiếng Việt nêu rõ phòng/tháng đang chọn và không hiển thị link giả.
- Given request báo cáo hoặc invoice thất bại, when UI nhận lỗi, then hiển thị thông báo tiếng Việt có thể retry và không giữ dữ liệu cũ dưới bộ lọc mới như thể đó là kết quả đúng.

## Edge cases và backward compatibility

- Chỉ có điện hoặc chỉ có nước: chỉ render tiện ích tồn tại trên invoice.
- Chỉ số có phần thập phân: giữ độ chính xác có ý nghĩa, không làm thay đổi amount đã snapshot.
- Reading bị void hoặc thiếu liên kết sau khi invoice cũ đã phát hành: không dùng reading đó để dựng dữ liệu; giữ amount và hiển thị trạng thái thiếu chỉ số.
- Hóa đơn điều chỉnh: link vẫn mở được; chỉ hiển thị chỉ số khi adjustment có metadata utility rõ ràng, không sao chép mù từ hóa đơn gốc.
- Hóa đơn chuyển/trả phòng giữa tháng: report dùng `billingYear/billingMonth`; dòng kết quả và bản in phải có khoảng thời gian thực tế để tránh hiểu là đủ tháng.
- Thay đổi người đại diện: invoice cũ tiếp tục hiển thị payer snapshot cũ theo business rule hiện tại.
- Đổi mã/tên phòng: liên kết vẫn dùng room ID ổn định. Với hóa đơn mới, ưu tiên snapshot nhãn phòng; legacy invoice có thể hiển thị nhãn phòng hiện tại nhưng không được làm thay đổi identity của invoice.
- Tháng không có hóa đơn, phòng chưa từng có hóa đơn hoặc filter không hợp lệ: trả empty state hoặc validation error rõ ràng, không fallback sang tháng/phòng khác.
- Browser không hỗ trợ Save as PDF: chức năng Print vẫn hoạt động; ứng dụng không cam kết cung cấp PDF server-side thay thế.
- Popup/print bị trình duyệt chặn: UI giữ nguyên hóa đơn và hướng dẫn ngắn gọn dùng chức năng in của trình duyệt; không gửi lại mutation.
- Route cũ `/invoices` và API list/detail hiện có phải tiếp tục hoạt động. Trường mới trong response phải additive hoặc version-compatible; client cũ không bị bắt buộc dùng metadata mới.
- Không bulk-update total/item/status của invoice cũ. Nếu cần backfill metadata, đó phải là migration/reconciliation riêng có dry-run và audit, ngoài phạm vi P6-005.

## Chỉ số thành công

- 100% hóa đơn mới có item điện/nước từ settlement hợp lệ chứa đủ snapshot chỉ số cũ, mới, lượng dùng, đơn vị, đơn giá và amount.
- 100% link kết quả report mở đúng invoice trong test matrix phòng/tháng/nhiều tenancy.
- Không có trường hợp unauthenticated hoặc cross-property đọc được invoice qua link trực tiếp.
- Print preview desktop và mobile không mất các trường tài chính/chỉ số bắt buộc.
- Hóa đơn legacy thiếu dữ liệu không hiển thị chỉ số giả hoặc làm thay đổi total lịch sử.

## Non-goals

- Không xây tenant portal hoặc tài khoản đăng nhập cho người thuê.
- Không tạo public share link, token xem hóa đơn công khai hoặc link không cần đăng nhập.
- Không sinh, lưu, ký số, gửi email/Zalo hoặc quản lý file PDF trên server.
- Không tùy biến template hóa đơn phức tạp, logo động, kéo thả bố cục hoặc nhiều mẫu in.
- Không thay đổi thuật toán tính điện/nước, giá, settlement, proration, FIFO, credit hoặc công nợ.
- Không cho sửa chỉ số/đơn giá trực tiếp từ invoice detail hoặc Báo cáo.
- Không thêm biểu đồ tiêu thụ, so sánh nhiều tháng hoặc cảnh báo mức dùng bất thường.
- Không thực hiện bulk backfill bắt buộc cho invoice cũ trong phase này.
- Không thay đổi CSV ngoài việc bảo đảm link/UI mới không làm sai report hiện có.

## Technical constraints

- Reuse React, NestJS, Prisma, PostgreSQL, invoice detail và monthly report hiện có.
- Money tiếp tục dùng Decimal/integer, không dùng floating point. Utility reading giữ precision hiện có.
- Dữ liệu hiển thị phải lấy từ invoice snapshot; fallback legacy chỉ dùng finalized reading liên kết duy nhất và không được thay đổi chứng từ.
- Mọi API list/detail phải authenticated, property-scoped, RBAC, validated và không log dữ liệu nhạy cảm.
- Thay đổi response ưu tiên additive; nếu thay public contract/schema phải có migration, tài liệu compatibility và test.
- Không tạo nguồn total/usage thứ hai ở frontend. Backend trả dữ liệu hiển thị đã chuẩn hóa hoặc metadata snapshot có contract rõ ràng.
- Dùng `billingYear/billingMonth` và timezone cấu hình cho filter; không suy ra kỳ từ thời gian máy client.
- Link dùng route nội bộ ổn định; không chứa session, secret, PII hoặc invoice payload trong URL.
- Print stylesheet phải dùng nội dung DOM của invoice detail đã authorize; không fetch từ public endpoint hoặc nhúng credential vào tài liệu.
- Query report phải có pagination/limit và index/filter strategy phù hợp; không quét/xuất toàn bộ dữ liệu không giới hạn.
- Security review bắt buộc vì feature mở rộng bề mặt đọc dữ liệu tài chính; P7 origin/CSRF và rate limiting vẫn là điều kiện trước khi public Internet.

## Open decisions đã chốt bằng giả định bảo thủ

Không còn quyết định Product mở trước implementation. Các điểm chưa được người dùng chỉ định được chốt như sau:

| Chủ đề                         | Quyết định cho P6-005                                                                                               | Lý do                                                       |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| Nơi đặt tra cứu                | Bổ sung filter và danh sách link trong tab Báo cáo hiện có; không thêm tab menu mới                                 | Giữ luồng đơn giản và đúng chức năng tab                    |
| Phạm vi filter phòng           | Có `Tất cả phòng` và một phòng cụ thể; tháng mặc định là tháng nghiệp vụ hiện tại                                   | Hỗ trợ tra cứu nhanh mà không mất báo cáo tổng              |
| Khóa thời gian                 | Dùng `billingYear/billingMonth` của invoice                                                                         | Ổn định với invoice phát hành hoặc thanh toán khác tháng    |
| Nhiều invoice cùng phòng/tháng | Hiển thị từng invoice riêng, phân biệt bằng số invoice và period                                                    | Không giả định một phòng luôn chỉ có một chứng từ mỗi tháng |
| Invoice bị hủy                 | Vẫn hiện để đối chiếu, gắn nhãn và loại khỏi tổng hiệu lực                                                          | Bảo toàn lịch sử tài chính                                  |
| Dữ liệu hóa đơn mới            | Snapshot đầy đủ utility usage tại lúc tạo invoice                                                                   | Không bị đổi theo reading/config sau này                    |
| Invoice legacy thiếu metadata  | Chỉ fallback từ finalized reading có liên kết duy nhất; nếu không thì hiện `Không có dữ liệu chỉ số cho hóa đơn cũ` | Không đoán hoặc làm sai chứng từ                            |
| PDF                            | Chỉ dùng Print/Save as PDF của browser                                                                              | Đủ nhu cầu, không tạo hạ tầng PDF/server mới                |
| Chia sẻ hóa đơn                | Chỉ link nội bộ có session và property authorization                                                                | Người dùng đã loại trừ tenant portal/public link            |
| Quyền in                       | Giống quyền đọc invoice, kể cả VIEWER; in không tạo mutation                                                        | Least privilege và nhất quán với API hiện có                |
| Nhãn link                      | `Hóa đơn Phòng <mã> tháng MM/YYYY`; thêm số invoice/period khi cần phân biệt                                        | Dễ hiểu và xử lý được nhiều invoice                         |
| Phòng đổi tên/ngừng dùng       | Link dựa vào room/invoice ID ổn định; hóa đơn lịch sử vẫn tra cứu được                                              | Không làm mất lịch sử do thay đổi master data               |

## Dependencies và Definition of Ready

- Phụ thuộc invoice detail, utility reading/settlement snapshot và monthly report đã có từ P4/P5/P6.
- Architecture/Backend phải chốt contract additive cho utility snapshot và legacy fallback trước khi Frontend tích hợp.
- Database Agent chỉ cần migration nếu dữ liệu snapshot hiện có chưa đủ; migration không được sửa total lịch sử.
- UI/UX xác nhận invoice detail/print layout và report state trên desktop/mobile.
- Security xác nhận direct-link authorization, property isolation và không rò rỉ dữ liệu trong URL/print.
- QA chuẩn bị matrix invoice mới/legacy, nhiều tenancy cùng tháng, cancelled, inactive room, RBAC/cross-property và print styles.
- Product discovery được xem là hoàn tất khi Lead chấp nhận brief này; implementation chỉ bắt đầu sau khi task có file ownership, API/schema contract và test plan.

## Handoff

- Summary: Đã định nghĩa yêu cầu P6-005 cho snapshot/hiển thị chỉ số điện nước trên hóa đơn, tra cứu invoice theo phòng và tháng, link chi tiết có xác thực và in/lưu PDF qua trình duyệt.
- Changed files: `docs/specs/INVOICE_USAGE_AND_ROOM_REPORT_BRIEF.md` (file mới duy nhất).
- Verification: Đối chiếu `AGENTS.md`, Product Agent instructions, `LEAD_PROMPT.md`, `TASKS.md`, `docs/WORKFLOW.md`, business rules, user stories, acceptance criteria, API/database design và brief P6-004; tự review AC theo Given/When/Then và compatibility invoice cũ.
- Risks/assumptions: Legacy invoice có thể thiếu utility metadata; chỉ cho phép fallback từ finalized reading liên kết duy nhất. Browser/OS quyết định khả năng Save as PDF. P7 hardening vẫn chặn public Internet.
- Remaining work: Lead review/freeze brief; Architecture + Database + Backend chốt snapshot/API/migration; UI/UX + Frontend thiết kế và tích hợp; QA + Security review trước release.
- Suggested next owner: Lead Agent, sau đó Architecture và Security review contract trước khi phân công implementation.
