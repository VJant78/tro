import { useEffect, useState } from "react";
import { StatusBadge } from "@repo/ui";
import { ApiError, apiFetch } from "../api";
import type { DashboardSummary } from "../billing/types";

export function DashboardPage() {
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function load() {
      setIsLoading(true);
      setError(null);
      try {
        setSummary(await apiFetch<DashboardSummary>("/dashboard/summary"));
      } catch (loadError) {
        setError(messageFor(loadError));
      } finally {
        setIsLoading(false);
      }
    }
    void load();
  }, []);

  return (
    <>
      <div className="section-heading">
        <div>
          <h1>Dashboard</h1>
          <p>
            {summary
              ? `Thang ${summary.billingMonth}/${summary.billingYear}`
              : "Tong quan van hanh"}
          </p>
        </div>
        {summary ? (
          <StatusBadge
            tone={summary.needsAttention.length > 0 ? "warning" : "success"}
          >
            {summary.needsAttention.length > 0 ? "Can chu y" : "On dinh"}
          </StatusBadge>
        ) : null}
      </div>

      {error ? (
        <div className="notice error" role="alert">
          {error}
        </div>
      ) : null}

      {isLoading ? (
        <div className="metric-grid">
          <div className="skeleton-row" />
          <div className="skeleton-row" />
          <div className="skeleton-row" />
          <div className="skeleton-row" />
        </div>
      ) : summary ? (
        <>
          <div className="metric-grid">
            <Metric label="Tong phong" value={String(summary.totals.rooms)} />
            <Metric
              label="Dang thue"
              value={String(summary.totals.occupiedRooms)}
            />
            <Metric
              label="Can thu thang nay"
              value={formatMoney(summary.totals.currentMonthCollectable)}
            />
            <Metric
              label="Da thu thang nay"
              value={formatMoney(summary.totals.currentMonthCollected)}
            />
            <Metric
              label="Con thu thang nay"
              value={formatMoney(summary.totals.currentMonthOutstanding)}
            />
            <Metric
              label="Hoa don qua han"
              value={String(summary.totals.overdueInvoiceCount)}
            />
            <Metric
              label="Tien qua han"
              value={formatMoney(summary.totals.overdueAmount)}
            />
          </div>

          <section className="panel" aria-labelledby="attention-title">
            <div className="section-heading compact">
              <h2 id="attention-title">Can chu y</h2>
            </div>
            {summary.needsAttention.length === 0 ? (
              <div className="empty-state">
                <strong>Khong co canh bao</strong>
              </div>
            ) : (
              <div className="invoice-items">
                {summary.needsAttention.map((item) => (
                  <div
                    className="invoice-item-row"
                    key={`${item.roomId}-${item.payerTenantId}`}
                  >
                    <span>
                      <strong>
                        Phong {item.roomCode ?? item.roomId.slice(0, 8)}
                      </strong>
                      <small>
                        {item.payerTenantName ?? "Nguoi dai dien"} - qua han{" "}
                        {item.daysOverdue} ngay
                      </small>
                    </span>
                    <strong>{formatMoney(item.totalOutstanding)}</strong>
                  </div>
                ))}
              </div>
            )}
          </section>
        </>
      ) : null}
    </>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <article className="metric">
      <div className="metric-label">{label}</div>
      <div className="metric-value">{value}</div>
    </article>
  );
}

function formatMoney(value: string | number) {
  return new Intl.NumberFormat("vi-VN").format(Number(value)) + " VND";
}

function messageFor(error: unknown) {
  if (error instanceof ApiError) return error.message;
  if (error instanceof Error) return error.message;
  return "Co loi xay ra";
}
