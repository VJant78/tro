# UI/UX Spec - Luồng vận hành phòng trọ

## 1. Mục tiêu và phạm vi

Đặc tả này chuyển các phát hiện trong `reports/UX-AUDIT.md` thành yêu cầu triển khai cho ứng dụng quản lý phòng trọ. Ưu tiên thao tác rõ, ít bước, an toàn dữ liệu và dùng tốt trên desktop lẫn mobile; không yêu cầu thay đổi nhận diện thương hiệu hoặc làm giao diện cầu kỳ.

Phạm vi gồm app shell, tám tab chính, trạng thái list-detail, thao tác theo vai trò trong lần thuê, đổi người đại diện, chuyển/rời/trả phòng, chốt tiền và tạo hóa đơn, phản hồi hệ thống, định dạng dữ liệu, responsive và accessibility.

## 2. Kiến trúc thông tin

Giữ đúng tám tab, không tạo tab riêng cho Lần thuê, Thanh toán hoặc Nhật ký:

| Tab        | Nhiệm vụ chính                                                                 |
| ---------- | ------------------------------------------------------------------------------ |
| Tổng quan  | KPI tháng và danh sách việc cần xử lý                                          |
| Phòng      | Thông tin phòng, giá, sức chứa và người đang ở                                 |
| Người thuê | Hồ sơ, phòng hiện tại, vai trò, lịch sử và thao tác theo người/nhóm            |
| Chốt tiền  | Chốt cuối tháng hoặc trả phòng gồm tiền phòng, điện, nước và tiền đã trả trước |
| Hóa đơn    | Tra cứu hóa đơn, xem chi tiết và ghi nhận thanh toán                           |
| Công nợ    | Theo dõi khoản chưa thu hết và thu nhanh                                       |
| Báo cáo    | Tổng hợp theo kỳ và xuất CSV                                                   |
| Cài đặt    | Một cấu hình chung về đơn giá, ngày chốt, hạn thu, tiền tệ và múi giờ          |

`Lần thuê` là một phần của Phòng và Người thuê. `Thanh toán` nằm trong Hóa đơn và Công nợ. Nhật ký chỉ xuất hiện trong khu vực quản trị khi được triển khai sau.

## 3. App shell và điều hướng

### Desktop từ 1024 px

- Dùng sidebar cố định bên trái, hiển thị đủ tám tab bằng icon và nhãn tiếng Việt.
- Khu vực tài khoản đặt cuối sidebar, gồm tên người dùng và `Đăng xuất`.
- Nội dung chính không bị sidebar che và không cuộn ngang ở độ rộng 1024 px trở lên.
- Tab hiện tại có trạng thái active bằng màu, icon và chữ; không chỉ dựa vào màu.
- Tiêu đề trang ngắn, khớp chính xác với tab hoặc nhiệm vụ hiện tại.

### Mobile dưới 768 px

- Dùng bottom navigation cố định gồm `Tổng quan`, `Phòng`, `Chốt tiền`, `Công nợ` và `Thêm`.
- `Thêm` mở drawer chứa `Người thuê`, `Hóa đơn`, `Báo cáo`, `Cài đặt` và `Đăng xuất`.
- Khi route thuộc drawer đang active, nút `Thêm` cũng có trạng thái active và drawer đánh dấu đúng mục hiện tại.
- Drawer có tiêu đề, nút đóng, đóng được bằng Escape hoặc chạm lớp nền, khóa focus và trả focus về nút `Thêm` sau khi đóng.
- Bottom navigation không che nội dung cuối trang; content có safe-area/padding tương ứng.
- Không render tám tab trên một hàng và không cho phép trang cuộn ngang.

### Tablet 768-1023 px

- Có thể dùng sidebar thu gọn hoặc drawer, nhưng phải giữ nhãn có thể đọc được và không phụ thuộc tooltip cho điều hướng chính.
- List-detail có thể chuyển từ hai cột sang một cột theo không gian thực tế.

## 4. Quy tắc màn hình chung

### Danh sách và chi tiết

- Desktop ưu tiên layout list-detail hai cột khi cần thao tác liên tục; mobile hiển thị danh sách trước, chi tiết mở thành màn hình riêng hoặc panel toàn chiều rộng.
- Dòng đang chọn, tiêu đề chi tiết và dữ liệu form luôn cùng một record.
- Trạng thái tạo mới không có dòng active; form rỗng và tiêu đề bắt đầu bằng `Tạo`.
- Bấm một record phải nạp đầy đủ dữ liệu rồi mới hiện trạng thái active.
- Reload không được tạo trạng thái dòng đã chọn nhưng form rỗng.
- Trạng thái không có dữ liệu phải giải thích ngắn và có một CTA phù hợp.

### Hành động

- Mỗi màn hình chỉ có một primary action rõ ràng.
- Action ít dùng hoặc có rủi ro nằm trong menu phụ; action nguy hiểm dùng màu cảnh báo và xác nhận riêng.
- Icon button phải có accessible name và tooltip nếu ý nghĩa không quen thuộc.
- Vùng chạm tối thiểu 44 x 44 px.

## 5. Đặc tả theo tab

### Tổng quan

- Hiển thị KPI tháng hiện tại: số phòng đang thuê, tổng phải thu, đã thu, còn thu và quá hạn.
- Bên dưới là hàng đợi việc cần làm: phòng chưa chốt, hóa đơn sắp đến hạn và công nợ quá hạn.
- Mỗi mục dẫn thẳng đến màn hình đã lọc tương ứng; không dùng dashboard như một trang báo cáo tĩnh.

### Phòng

- Desktop dùng danh sách bên trái và chi tiết bên phải. Mobile dùng danh sách card và trang/panel chi tiết.
- Card/dòng phòng ưu tiên mã phòng, trạng thái, giá phòng và số người hiện tại/tối đa.
- Chi tiết phòng đang thuê phải hiển thị đại diện rõ ràng, danh sách người đang ở và ngày bắt đầu của lần thuê.
- Trạng thái `Trống`/`Đang thuê` được suy ra từ lần thuê và chỉ hiển thị read-only.
- `Bảo trì` chỉ cho phép khi phòng trống. `Ngừng dùng` là action riêng có confirm và bị chặn khi còn người đang ở.
- Giá phòng được nhập tại Phòng, định dạng VND; không lặp lại giá phòng trong Cài đặt.

### Người thuê

- Có tìm kiếm theo tên/số điện thoại và filter theo phòng.
- Record ưu tiên tên, trạng thái, phòng hiện tại và vai trò `Đại diện`/`Ở chung`.
- Người chưa có lần thuê active có trạng thái `Chưa ở`; không mặc định thành `Đang ở` khi vừa tạo hồ sơ.
- Khi người thuê đang ở được chọn, chi tiết hiển thị phòng, ngày vào, vai trò và toàn bộ người đang ở cùng phòng.
- Dropdown phòng của người đang ở chỉ hiển thị phòng hiện tại và disabled. Thay đổi phòng phải đi qua action chuyển phòng có xác nhận.

#### Action theo vai trò

| Trạng thái người thuê            | Action chính       | Action phụ                                         |
| -------------------------------- | ------------------ | -------------------------------------------------- |
| Chưa ở                           | `Xếp vào phòng`    | `Sửa hồ sơ`                                        |
| Người ở chung đang ở             | `Chuyển người này` | `Rời phòng`, `Sửa hồ sơ`                           |
| Đại diện, không có người ở chung | `Chuyển cả phòng`  | `Kết thúc thuê`, `Sửa hồ sơ`                       |
| Đại diện, còn người ở chung      | `Chuyển cả phòng`  | `Kết thúc thuê`, `Đổi người đại diện`, `Sửa hồ sơ` |

- Đại diện không được chuyển/rời riêng khi phòng còn thành viên khác. Người dùng phải đổi đại diện trước.
- Không hiển thị đồng thời action cá nhân và action cả nhóm nếu nghiệp vụ không cho phép.

#### Modal đổi người đại diện

- Trigger: `Đổi người đại diện` trong khu vực lần thuê hiện tại.
- Hiển thị phòng, đại diện hiện tại và dropdown chỉ gồm người ở chung đang active trong cùng phòng.
- Sau khi chọn, hiển thị bản xem trước: người mới thành `Đại diện`, người cũ thành `Ở chung`; phòng và lần thuê không đổi; không chốt tiền.
- Primary action: `Xác nhận đổi đại diện`; secondary action: `Hủy`.
- Không cho chọn người đã rời, người ở phòng khác hoặc đại diện hiện tại.
- Thành công đóng modal, cập nhật chi tiết tại chỗ và thông báo `Đã đổi người đại diện phòng {mã phòng} sang {tên}`.
- Modal khóa focus, Escape để đóng khi chưa submit và trả focus về trigger.

#### Chuyển một người ở chung

- Chỉ áp dụng cho người ở chung.
- Modal yêu cầu phòng đích còn chỗ và ngày chuyển; hiển thị phòng cũ, phòng mới và người được chuyển.
- Confirm nêu rõ tenancy phòng cũ vẫn hoạt động, đại diện không đổi và không chốt tiền phòng cũ.
- Thành công cập nhật phòng mới của đúng một người; không tạo settlement/invoice cho phòng cũ.

#### Chuyển cả phòng

Dùng luồng có hướng dẫn theo thứ tự:

1. Chọn phòng đích và ngày chuyển.
2. Nhập chỉ số điện, nước bàn giao của phòng cũ; hiển thị chỉ số cũ read-only.
3. Xem tạm tính phòng cũ đến ngày chuyển: tiền phòng theo ngày, điện, nước, đã trả trước và còn thu.
4. Xác nhận `Chốt phòng cũ và chuyển cả phòng`.

- Chỉ hoàn tất chuyển sau khi chốt phòng cũ và tạo đúng một hóa đơn thành công.
- Phòng cũ thành `Trống`; phòng mới mở lần thuê mới với đủ thành viên và giữ đúng vai trò.
- Nếu một bước thất bại, hiển thị lỗi tại bước đó và không tạo trạng thái chuyển dở dang.

#### Rời phòng và kết thúc thuê

- `Rời phòng` chỉ áp dụng cho người ở chung và yêu cầu ngày rời. Không chốt tiền phòng nếu đại diện/lần thuê vẫn tiếp tục.
- `Kết thúc thuê` áp dụng cho toàn phòng, dùng cùng luồng chốt có hướng dẫn như chuyển cả phòng nhưng không yêu cầu phòng đích.
- Confirm cuối phải nêu phòng, ngày kết thúc và tổng còn thu.
- Không cho kết thúc toàn phòng nếu thiếu chỉ số hợp lệ hoặc chưa tạo được settlement/hóa đơn.

### Chốt tiền

- Đổi toàn bộ nhãn menu, heading và nội dung từ `Điện nước` thành `Chốt tiền`; route hiện tại có thể giữ để tránh thay đổi kỹ thuật không cần thiết.
- Kỳ chốt tự sinh từ ngày hiện tại và lần thuê; không yêu cầu nhập năm/tháng thủ công.
- Form theo thứ tự: phòng và kỳ; điện nước; tiền đã trả trước; tạm tính.
- `Điện cũ` và `Nước cũ` tự lấy từ bản ghi finalized gần nhất, read-only. `Điện mới` và `Nước mới` không được nhỏ hơn chỉ số cũ.
- Tạm tính tách rõ `Tiền phòng tháng {tháng}/{năm}`, tiền điện, tiền nước, tổng trước khấu trừ, đã trả trước, số dư kỳ trước và còn thu.
- Tiền đã trả trước trừ vào tổng hóa đơn, không chỉ trừ riêng tiền phòng. Phần dư được thể hiện rõ là số dư chuyển kỳ sau.
- Primary action duy nhất: `Chốt và tạo hóa đơn`.
- Một lần xác nhận tạo settlement finalized và đúng một hóa đơn; retry không được tạo trùng.
- Kỳ đã chốt hiển thị ở `Các kỳ đã chốt`; chọn một kỳ chỉ để xem, không cho submit lại.

### Hóa đơn

- Là nơi tra cứu hóa đơn đã tạo, xem dòng tiền và ghi nhận thanh toán; không lặp lại luồng tạo hóa đơn thông thường.
- Dropdown kỳ hiển thị `Phòng {mã phòng} - {từ ngày} đến {đến ngày}`.
- Dòng tiền phòng dùng nhãn `Tiền phòng tháng {tháng}/{năm}`; kỳ không trọn tháng hiển thị thêm số ngày.
- Chi tiết luôn tách tổng hóa đơn, đã thanh toán và còn phải thu.
- `Ghi nhận thanh toán` có preview số tiền còn lại, chặn overpay và thông báo thành công cụ thể.

### Công nợ

- Chỉ hiển thị hóa đơn chưa thu đủ, ưu tiên khoản quá hạn.
- Mỗi record có phòng, đại diện, kỳ, tổng nợ, hạn thanh toán, số ngày quá hạn và trạng thái bằng chữ.
- Có filter theo phòng/trạng thái và action `Thu tiền` hoặc `Xem hóa đơn`.
- Badge không truyền đạt trạng thái chỉ bằng màu và phải đạt contrast WCAG AA.

### Báo cáo

- Desktop giữ bảng để so sánh nhiều dòng.
- Mobile chuyển mỗi dòng thành card; mỗi giá trị phải nằm cạnh nhãn tương ứng, tối thiểu gồm phòng, kỳ, tổng, đã thu/còn thu và trạng thái.
- Card không giả lập table bằng cách xếp toàn bộ header trước các giá trị.
- Nút xuất CSV giữ nguyên bộ lọc kỳ hiện tại và có trạng thái đang tải/thành công/lỗi.

### Cài đặt

- Chỉ dùng một cấu hình chung đang có hiệu lực; cập nhật cấu hình đó khi thay đổi, không yêu cầu chọn nhiều phiên bản.
- Gồm giá điện `/kWh`, giá nước `/m³`, ngày chốt, hạn thu, tiền tệ và múi giờ.
- Không có giá phòng trong Cài đặt.
- Nếu cần lịch sử cấu hình để tính đúng chứng từ cũ, hệ thống tự lưu phía sau; UI chính chỉ hiển thị cấu hình đang áp dụng.

## 6. Trạng thái và phản hồi

### Loading và submit

- Danh sách/detail dùng skeleton hoặc trạng thái tải giữ ổn định layout.
- Nút submit disabled và có trạng thái đang xử lý; chống double click.
- Không xóa dữ liệu form khi request thất bại.

### Thành công

- Create/update/chuyển/chốt/thanh toán đều có một thông báo thành công bằng tiếng Việt, nêu đối tượng và kết quả.
- Dữ liệu liên quan cập nhật tại chỗ; không buộc reload để thấy kết quả.
- Thông báo dùng `aria-live="polite"`.

### Lỗi

- Validation hiển thị cạnh trường và đưa focus tới lỗi đầu tiên khi submit.
- Lỗi nghiệp vụ được ánh xạ sang tiếng Việt, có hướng xử lý; không hiển thị thông báo API tiếng Anh thô.
- Các lỗi tối thiểu cần nội dung riêng: kỳ/chỉ số đã tồn tại, chỉ số mới nhỏ hơn chỉ số cũ, phòng đích hết chỗ, đại diện không thể rời, thanh toán vượt số còn thu và phiên đăng nhập hết hạn.
- Lỗi tải dữ liệu có nút `Thử lại`.

### Confirm

- Bắt buộc cho đổi đại diện, chuyển/rời/kết thúc thuê, chốt tiền, ghi nhận thanh toán, hủy hóa đơn, ngừng dùng phòng và các thao tác tài chính không thể hoàn tác.
- Confirm nêu đối tượng, ngày hiệu lực, tác động và số tiền nếu có.
- Nút nguy hiểm dùng nhãn hành động cụ thể, không dùng `Đồng ý` chung chung.

## 7. Nội dung và định dạng

- Toàn bộ menu, heading, label, trạng thái, validation và thông báo dùng tiếng Việt có dấu thống nhất.
- Không dùng UUID làm tiêu đề/phụ đề chính. Ưu tiên mã phòng, tên người thuê và mã hóa đơn.
- Tiền hiển thị theo `vi-VN`, có nhóm nghìn và hậu tố `VND`, ví dụ `600.000 VND`.
- Giá điện hiển thị `3.500 VND/kWh`; giá nước hiển thị `15.000 VND/m³`.
- Chỉ số đồng hồ dùng `kWh` và `m³`, không gắn `VND`.
- Input tiền chấp nhận số người dùng nhập hợp lệ, định dạng khi blur và gửi API dưới dạng integer; paste có dấu chấm/phẩy phải normalize an toàn hoặc báo lỗi rõ.
- Ngày hiển thị `dd/MM/yyyy`; khoảng thời gian dùng `dd/MM/yyyy đến dd/MM/yyyy`.

## 8. Accessibility

- Dùng semantic landmarks, heading đúng cấp, có skip link tới nội dung chính trên desktop.
- Mọi input có label; lỗi liên kết bằng `aria-describedby` và trạng thái invalid rõ ràng.
- Toàn bộ luồng dùng được bằng keyboard, focus indicator dễ thấy và thứ tự focus theo bố cục.
- Modal/drawer khóa focus, hỗ trợ Escape và trả focus về trigger.
- Text thường và badge đạt tối thiểu WCAG AA 4.5:1; trạng thái luôn có chữ/icon ngoài màu.
- Hỗ trợ zoom 200% không mất nội dung hoặc chồng lấp thao tác.
- Table có header đúng semantic; card mobile giữ nhãn cho từng giá trị.
- Icon-only action có accessible name mô tả cả hành động và đối tượng.

## 9. Acceptance criteria tổng

1. Desktop 1024 và 1440 px hiển thị sidebar, không có horizontal overflow và nội dung không bị che.
2. Mobile 360, 390 và 430 px hiển thị bottom navigation năm mục; `Thêm` mở đúng drawer và `documentElement.scrollWidth <= clientWidth + 2` trên mọi route.
3. Ở Phòng và Người thuê, selected record luôn khớp heading/form; tạo mới luôn reset selection và dữ liệu.
4. Người thuê đang ở chỉ thấy action hợp vai trò; người ở chung chuyển/rời riêng không chốt phòng cũ.
5. Đổi đại diện chỉ hoán đổi vai trò trong cùng lần thuê, không đóng membership, không tạo tenancy, settlement hoặc invoice mới.
6. Chuyển cả phòng và kết thúc thuê bắt buộc nhập ngày, chỉ số, xem tạm tính và confirm trước khi chốt/tạo hóa đơn.
7. `Chốt và tạo hóa đơn` tạo đúng một settlement finalized và một invoice; retry không tạo trùng.
8. Tab/menu hiển thị `Chốt tiền`, kỳ tự sinh và chỉ số cũ tự lấy/read-only.
9. Báo cáo mobile dùng card có cặp label-value; không cần cuộn ngang để đọc record.
10. Tiền, đơn giá, chỉ số và ngày đúng định dạng/đơn vị; toàn bộ nội dung vận hành dùng tiếng Việt có dấu.
11. Mỗi thao tác ghi dữ liệu có loading, success và error rõ; lỗi nghiệp vụ không lộ message tiếng Anh thô.
12. Axe không còn lỗi color contrast nghiêm trọng; navigation, drawer, modal và form hoàn thành được chỉ bằng keyboard.

## 10. Ma trận kiểm thử bàn giao

| Nhóm          | Viewport / môi trường           | Kiểm tra bắt buộc                                                                                             |
| ------------- | ------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| Desktop       | 1440 x 900, 1024 x 768          | Sidebar, list-detail, form/action không chồng lấp, bảng báo cáo                                               |
| Tablet        | 768 x 1024                      | Điều hướng thu gọn, layout một/hai cột, modal không vượt màn hình                                             |
| Mobile        | 360 x 800, 390 x 844, 430 x 932 | Bottom nav/drawer, không overflow, card báo cáo, action 44 px, form một cột                                   |
| Zoom          | Desktop 200%                    | Không mất nội dung/action; focus và label vẫn đọc được                                                        |
| Keyboard      | Desktop và mobile emulation     | Tab order, focus trap, Escape, trả focus, submit và validation                                                |
| Accessibility | Các route chính                 | Axe contrast/label/landmark; trạng thái không chỉ dùng màu                                                    |
| Nghiệp vụ     | API test + PostgreSQL smoke     | Chuyển người ở chung; đổi đại diện rồi chuyển người cũ; chuyển cả nhóm; trả phòng giữa tháng; chốt idempotent |

E2E tối thiểu phải phủ:

1. Cuối tháng: phòng chưa chốt -> nhập chỉ số -> tạm tính -> chốt và tạo hóa đơn -> thu một phần -> thu đủ.
2. Người ở chung chuyển phòng: chỉ người đó đổi phòng, phòng cũ tiếp tục active và không có settlement/invoice mới.
3. Đổi đại diện: vai trò hoán đổi, phòng/lần thuê giữ nguyên; sau đó đại diện cũ chuyển riêng thành công.
4. Chuyển cả phòng: chốt phòng cũ theo ngày/chỉ số, tạo hóa đơn, mở lần thuê mới đúng thành viên/vai trò.
5. Trả phòng giữa tháng: tính tiền phòng theo ngày, điện nước theo chỉ số, trừ tiền đã trả trước vào tổng và lưu số dư nếu thừa.
6. Mobile: đi qua đủ tám tab bằng bottom navigation/drawer mà không có horizontal overflow.

## 11. Thu tien va lich su thu

- Khong them menu chinh. Tai chi tiet Phong dang thue co hai action `Thu tien` va `Lich su thu`.
- Form Thu tien hien ten phong/dai dien read-only; field gom so tien, ngay gio, hinh thuc, nguoi nop tuy chon va ghi chu.
- Truoc confirm, preview tach tung cong no se duoc tru theo FIFO va phan con lai se thanh tra truoc.
- Sau confirm, success message neu ro tong thu, tong tru cong no va credit con lai.
- Lich su sap xep moi nhat truoc, hien receipt number, ngay gio, amount, method, nguoi nop, status va breakdown allocation/credit.
- Action `Huy lan thu` chi hien cho OWNER/MANAGER, dung confirm ro tac dong va bat buoc ly do.
- Tai Chot tien, `Da thu truoc: X VND (N lan)` la read-only, co link xem lich su; preview van tach tong ky, da thu truoc, con thu va du chuyen ky sau.
- Tai Cong no, receipt vua thu lam outstanding cap nhat ngay lap tuc; khong yeu cau reload thu cong.
- Mobile dung modal/drawer full-width hop ly, khong che primary action va khong cuon ngang.

## 12. Non-goals

- Không thiết kế lại branding hoặc yêu cầu pixel-perfect.
- Không thêm menu chính cho Lần thuê, Thanh toán hoặc Nhật ký.
- Không xây tenant self-service, phân quyền nhân viên chi tiết hoặc automation thu tiền.
- Không batch chốt nhiều phòng trong một lần xác nhận.
- Không đưa lịch sử cấu hình kỹ thuật ra màn hình chính.
