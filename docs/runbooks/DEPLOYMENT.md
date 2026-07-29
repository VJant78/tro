# Deployment Runbook

1. Xác nhận CI xanh và migration đã review.
2. Sao lưu dữ liệu nếu migration có rủi ro.
3. Deploy database-compatible backend trước.
4. Chạy smoke test API.
5. Deploy frontend.
6. Chạy E2E/smoke test production.
7. Theo dõi error rate, latency và logs.
8. Rollback khi vượt ngưỡng đã định.
