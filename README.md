# Codex Multi-Agent Web Starter

Mẫu monorepo để tổ chức nhiều AI agent làm việc như một nhóm phát triển website trong VS Code/Codex.

## Vai trò

- Lead/Orchestrator: phân tích, chia task, quản lý phụ thuộc và tích hợp.
- Product: yêu cầu, user story, acceptance criteria.
- UI/UX: luồng người dùng, layout, responsive, accessibility.
- Frontend: ứng dụng web, component, state, SEO.
- Backend: API, nghiệp vụ, xác thực và tích hợp.
- Database: schema, migration, seed và truy vấn.
- QA: test plan, unit/integration/E2E và regression.
- Security: threat model, authorization, validation và secrets.
- DevOps: CI/CD, container, môi trường và observability.

## Bắt đầu nhanh

```bash
cp .env.example .env
npm install
npm run check
```

Mở thư mục này bằng VS Code, sau đó yêu cầu agent Lead đọc `AGENTS.md` và `docs/WORKFLOW.md` trước khi nhận việc.

## Quy trình chuẩn

1. Tạo yêu cầu trong `docs/specs/`.
2. Lead tạo task từ `tasks/TEMPLATE.md` và đưa vào `tasks/backlog/`.
3. Mỗi task có owner, phạm vi file và acceptance criteria rõ ràng.
4. Mỗi agent làm trên branch/worktree riêng.
5. QA và Security review trước khi Lead tích hợp.
6. Chạy `npm run check` trước khi merge.

## Cấu trúc

```text
apps/                 Ứng dụng triển khai
packages/             Thư viện dùng chung
.codex/agents/        Hướng dẫn vai trò agent
AGENTS.md              Quy tắc gốc Codex
CODEOWNERS.md          Quyền sở hữu logic theo vùng
TASKS.md               Bảng điều phối hiện tại
docs/                  Kiến trúc, đặc tả, quyết định, runbook
tasks/                 Hàng đợi công việc theo trạng thái
scripts/               Script hỗ trợ workflow
.github/               CI và mẫu issue/PR
.vscode/               Cấu hình workspace
```

## Lệnh hữu ích

```bash
npm run dev             # chạy các workspace có script dev
npm run build           # build toàn bộ
npm run lint            # lint toàn bộ
npm run typecheck       # kiểm tra TypeScript
npm run test            # unit/integration test
npm run test:e2e        # E2E
npm run check           # lint + typecheck + test
npm run task:new -- "Tên task"
```

## Nguyên tắc quan trọng

- Không để hai agent cùng sửa một file trong cùng thời điểm.
- Agent review không tự sửa production code trừ khi Lead yêu cầu.
- Mọi thay đổi schema/API phải có tài liệu tương ứng.
- Không commit secrets hoặc `.env`.
- Mọi task phải có điều kiện hoàn thành kiểm chứng được.
