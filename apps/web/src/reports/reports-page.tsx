import { FormEvent, useEffect, useState } from "react";
import { Button } from "@repo/ui";
import { ApiError, apiBaseUrl, apiFetch } from "../api";
import type { MonthlyReport } from "../billing/types";

const today = new Date();

export function ReportsPage() {
  const [filters, setFilters] = useState({
    billingYear: String(today.getFullYear()),
    billingMonth: String(today.getMonth() + 1),
  });
  const [report, setReport] = useState<MonthlyReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [downloadStatus, setDownloadStatus] = useState("");

  async function load() {
    setIsLoading(true);
    setError(null);
    try {
      const params = paramsFor(filters);
      setReport(await apiFetch<MonthlyReport>(`/reports/monthly?${params}`));
    } catch (loadError) {
      setError(messageFor(loadError));
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function applyFilters(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await load();
  }

  async function downloadCsv() {
    setDownloadStatus("");
    setError(null);
    try {
      const response = await fetch(
        `${apiBaseUrl}/reports/monthly.csv?${paramsFor(filters)}`,
        { credentials: "include" },
      );
      if (!response.ok) throw new Error("Khong tai duoc CSV");
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `bao-cao-${filters.billingYear}-${filters.billingMonth.padStart(
        2,
        "0",
      )}.csv`;
      link.click();
      URL.revokeObjectURL(url);
      setDownloadStatus("Da tao file CSV");
    } catch (downloadError) {
      setError(messageFor(downloadError));
    }
  }

  return (
    <div className="reports-layout">
      <section className="rooms-list" aria-labelledby="reports-title">
        <div className="section-heading">
          <div>
            <h1 id="reports-title">Bao cao</h1>
            <p>
              {report
                ? `Ky ${formatDate(report.periodStart)} - ${formatDate(report.periodEnd)}`
                : "Doanh thu, cong no va dien nuoc"}
            </p>
          </div>
        </div>

        <form className="toolbar report-toolbar" onSubmit={applyFilters}>
          <label className="field">
            Nam
            <input
              inputMode="numeric"
              onChange={(event) =>
                setFilters({ ...filters, billingYear: event.target.value })
              }
              value={filters.billingYear}
            />
          </label>
          <label className="field">
            Thang
            <input
              inputMode="numeric"
              onChange={(event) =>
                setFilters({ ...filters, billingMonth: event.target.value })
              }
              value={filters.billingMonth}
            />
          </label>
          <div className="report-actions">
            <Button type="submit">Xem bao cao</Button>
            <Button type="button" onClick={() => void downloadCsv()}>
              Tai CSV
            </Button>
          </div>
        </form>

        {error ? (
          <div className="notice error" role="alert">
            {error}
          </div>
        ) : null}
        {downloadStatus ? (
          <div className="notice">
            <strong>{downloadStatus}</strong>
          </div>
        ) : null}

        {isLoading ? (
          <div className="metric-grid">
            <div className="skeleton-row" />
            <div className="skeleton-row" />
            <div className="skeleton-row" />
            <div className="skeleton-row" />
          </div>
        ) : report ? (
          <>
            <div className="metric-grid">
              <Metric
                label="Tong hoa don"
                value={formatMoney(report.totals.invoiceTotal)}
              />
              <Metric
                label="Da thu"
                value={formatMoney(report.totals.collected)}
              />
              <Metric
                label="Con thu"
                value={formatMoney(report.totals.outstanding)}
              />
              <Metric
                label="Qua han"
                value={formatMoney(report.totals.overdue)}
              />
              <Metric
                label="Tien dien"
                value={formatMoney(report.totals.electricity)}
              />
              <Metric
                label="Tien nuoc"
                value={formatMoney(report.totals.water)}
              />
            </div>

            <section className="panel" aria-labelledby="report-invoices">
              <h2 id="report-invoices">Hoa don trong ky</h2>
              <div className="report-table">
                <div className="report-table-head">
                  <span>Hoa don</span>
                  <span>Phong</span>
                  <span>Tong</span>
                  <span>Con thu</span>
                </div>
                {report.invoices.map((invoice) => (
                  <div className="report-table-row" key={invoice.id}>
                    <span>{invoice.invoiceNumber}</span>
                    <span>
                      {invoice.roomCode ?? invoice.roomId.slice(0, 8)}
                    </span>
                    <span>{formatMoney(invoice.totalAmount)}</span>
                    <span>{formatMoney(invoice.outstandingAmount)}</span>
                  </div>
                ))}
              </div>
            </section>

            <section className="panel" aria-labelledby="report-payments">
              <h2 id="report-payments">Thanh toan trong ky</h2>
              {report.payments.length === 0 ? (
                <div className="empty-state">
                  <strong>Chua co thanh toan</strong>
                </div>
              ) : (
                <div className="report-table">
                  <div className="report-table-head">
                    <span>Ma thu</span>
                    <span>Phong</span>
                    <span>Ngay thu</span>
                    <span>So tien</span>
                  </div>
                  {report.payments.map((payment) => (
                    <div className="report-table-row" key={payment.id}>
                      <span>{payment.paymentNumber}</span>
                      <span>
                        {payment.roomCode ?? payment.roomId.slice(0, 8)}
                      </span>
                      <span>{formatDateTime(payment.paidAt)}</span>
                      <span>{formatMoney(payment.amount)}</span>
                    </div>
                  ))}
                </div>
              )}
            </section>

            <section className="panel" aria-labelledby="report-debts">
              <h2 id="report-debts">Cong no trong ky</h2>
              {report.debts.length === 0 ? (
                <div className="empty-state">
                  <strong>Khong co cong no</strong>
                </div>
              ) : (
                <div className="report-table">
                  <div className="report-table-head">
                    <span>Phong</span>
                    <span>Dai dien</span>
                    <span>Con thu</span>
                    <span>Trang thai</span>
                  </div>
                  {report.debts.map((debt) => (
                    <div
                      className="report-table-row"
                      key={`${debt.roomId}-${debt.payerTenantId ?? "none"}`}
                    >
                      <span>{debt.roomCode ?? debt.roomId.slice(0, 8)}</span>
                      <span>{debt.payerTenantName ?? "Chua co"}</span>
                      <span>{formatMoney(debt.totalOutstanding)}</span>
                      <span>{labelForDebt(debt.debtStatus)}</span>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </>
        ) : null}
      </section>
    </div>
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

function paramsFor(filters: { billingYear: string; billingMonth: string }) {
  return new URLSearchParams({
    billingYear: filters.billingYear,
    billingMonth: filters.billingMonth,
  }).toString();
}

function formatMoney(value: string | number) {
  return new Intl.NumberFormat("vi-VN").format(Number(value)) + " VND";
}

function formatDate(value: string) {
  if (!value) return "-";
  return new Intl.DateTimeFormat("vi-VN").format(new Date(`${value}T00:00:00`));
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("vi-VN", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(value));
}

function labelForDebt(status: MonthlyReport["debts"][number]["debtStatus"]) {
  return (
    {
      OUTSTANDING: "Con thu",
      PARTIALLY_PAID: "Da thu mot phan",
      DUE_TODAY: "Den han hom nay",
      OVERDUE: "Qua han",
    } satisfies Record<MonthlyReport["debts"][number]["debtStatus"], string>
  )[status];
}

function messageFor(error: unknown) {
  if (error instanceof ApiError) return error.message;
  if (error instanceof Error) return error.message;
  return "Co loi xay ra";
}
