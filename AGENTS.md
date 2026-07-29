# AGENTS.md — Team Operating Contract

Codex phải đọc tệp này trước khi thực hiện bất kỳ thay đổi nào.

## 1. Mục tiêu

Xây dựng website có khả năng bảo trì, kiểm thử, bảo mật và triển khai ổn định. Không tối ưu tốc độ giao hàng bằng cách bỏ qua chất lượng nền tảng.

## 2. Thứ tự ưu tiên

1. Yêu cầu và acceptance criteria.
2. An toàn dữ liệu và bảo mật.
3. Tính đúng đắn và test.
4. Khả năng bảo trì.
5. Hiệu năng và trải nghiệm.
6. Tốc độ triển khai.

## 3. Quy trình bắt buộc

Trước khi sửa code:
- Đọc task và tài liệu liên quan.
- Xác nhận phạm vi file được phép sửa.
- Kiểm tra phụ thuộc với task khác.
- Viết kế hoạch ngắn trong task.

Trong khi sửa:
- Giữ thay đổi nhỏ, tập trung.
- Không refactor ngoài phạm vi nếu không cần thiết.
- Cập nhật test cùng thay đổi hành vi.
- Ghi quyết định kiến trúc đáng kể vào `docs/decisions/`.

Trước khi hoàn thành:
- Chạy lint, typecheck và test liên quan.
- Tự review diff.
- Cập nhật trạng thái task và tài liệu.
- Nêu rõ rủi ro hoặc phần chưa kiểm chứng.

## 4. File ownership

- Product: `docs/specs/**`, yêu cầu trong `tasks/**`.
- UI/UX: `docs/specs/**`, tài liệu thiết kế; không sửa logic backend.
- Frontend: `apps/web/**`, `packages/ui/**`.
- Backend: `apps/api/**`, server code trong app.
- Database: `packages/database/**`.
- QA: `tests/**`, test files; production fixes cần Lead phê duyệt.
- Security: báo cáo/review; không tự thay đổi rộng.
- DevOps: `.github/**`, Docker, deployment và runbook.
- Lead: có quyền tích hợp toàn repo nhưng phải tránh ghi đè công việc đang diễn ra.

## 5. Cấm

- Không commit secrets, token, khóa API hoặc dữ liệu thật.
- Không vô hiệu hóa test để làm CI xanh.
- Không dùng `any` hoặc bỏ validation chỉ để qua typecheck.
- Không thay đổi public API/schema mà thiếu migration và tài liệu.
- Không chạy destructive command nếu task không yêu cầu rõ.
- Không merge trực tiếp vào `main`.

## 6. Definition of Done

Một task chỉ hoàn thành khi:
- Acceptance criteria đạt.
- Test phù hợp được thêm/cập nhật và chạy thành công.
- Không còn lỗi lint/typecheck liên quan.
- Tài liệu được cập nhật.
- QA review xong; Security review nếu chạm auth, dữ liệu, upload, payment hoặc quyền truy cập.
- Lead đã review diff và tích hợp.

## 7. Giao tiếp giữa agent

Mỗi handoff phải gồm:
- Đã làm gì.
- File đã thay đổi.
- Cách kiểm tra.
- Rủi ro/giả định.
- Việc còn lại và agent phù hợp tiếp theo.

## 8. Agent instructions

Đọc hướng dẫn vai trò tại `.codex/agents/<role>.md`. Khi xung đột, `AGENTS.md` có ưu tiên cao hơn.
