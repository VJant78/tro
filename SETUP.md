# Thiết lập trong VS Code và Codex

## 1. Yêu cầu
- Git
- Node.js 20+
- VS Code
- Codex IDE extension hoặc Codex CLI

## 2. Khởi tạo
```bash
unzip codex-multi-agent-web-starter.zip
cd codex-multi-agent-web-starter
git init
git add .
git commit -m "chore: initialize multi-agent repository"
cp .env.example .env
npm install
code .
```

## 3. Bắt đầu dự án thật
Yêu cầu Lead Agent:

```text
Read AGENTS.md and LEAD_PROMPT.md. Create the first product discovery task for my website idea. Do not implement code until product requirements and acceptance criteria are approved.
```

## 4. Chạy agent song song
- Mỗi agent dùng branch hoặc worktree riêng.
- Lead ghi file scope trong từng task.
- Agent chỉ sửa file trong scope.
- QA/Security nhận diff sau implementation.

## 5. Thay placeholder bằng stack thật
Mẫu repo không ép framework. Lead có thể khởi tạo Next.js/NestJS/Express/Fastify/Prisma theo product brief mà vẫn giữ nguyên cấu trúc quản trị agent.
