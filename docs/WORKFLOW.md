# Multi-Agent Delivery Workflow

## Giai đoạn 1 — Discovery
Product tạo product brief, user stories và acceptance criteria. UI/UX bổ sung user flow và trạng thái giao diện. Lead xác định ranh giới hệ thống.

## Giai đoạn 2 — Planning
Lead chia yêu cầu thành task độc lập, xác định dependency, file ownership, reviewer và mức rủi ro. Task không đủ acceptance criteria không được bắt đầu.

## Giai đoạn 3 — Parallel implementation
Frontend, Backend và Database chỉ chạy song song khi phạm vi file không giao nhau. Mỗi task dùng branch hoặc Git worktree riêng.

Ví dụ:
```bash
git worktree add ../worktrees/frontend-feature -b feat/frontend-feature
git worktree add ../worktrees/api-feature -b feat/api-feature
```

## Giai đoạn 4 — Verification
QA chạy test plan. Security review các thay đổi liên quan đến auth, authorization, dữ liệu nhạy cảm, input, upload, webhook, payment hoặc external integration.

## Giai đoạn 5 — Integration
Lead review diff, kiểm tra hợp đồng API/schema, merge theo dependency, chạy toàn bộ quality gate và cập nhật tài liệu.

## Quy tắc khóa file

Trước khi bắt đầu, agent ghi file scope trong task. Nếu file cần sửa đã thuộc task khác đang `in-progress`, agent phải dừng và chuyển yêu cầu cho Lead.

## Handoff template

```md
### Handoff
- Summary:
- Changed files:
- Verification:
- Risks/assumptions:
- Remaining work:
- Suggested next owner:
```
