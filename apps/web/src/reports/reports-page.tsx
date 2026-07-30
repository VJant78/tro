import { FormEvent, useEffect, useRef, useState } from "react";
import { Button, StatusBadge } from "@repo/ui";
import { apiBaseUrl, apiFetch, messageFor } from "../api";
import { formatDate, formatDateTime, formatMoney } from "../format";
import type { MonthlyReport } from "../billing/types";
import type { RoomListResponse } from "../rooms/types";

const today = new Date();
const initialFilters = {
  billingYear: String(today.getFullYear()),
  billingMonth: String(today.getMonth() + 1),
  roomId: "",
};

type ReportFilters = typeof initialFilters;

export function ReportsPage() {
  const [filters, setFilters] = useState(initialFilters);
  const [appliedFilters, setAppliedFilters] = useState(initialFilters);
  const [rooms, setRooms] = useState<RoomListResponse["data"]>([]);
  const [report, setReport] = useState<MonthlyReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [downloadStatus, setDownloadStatus] = useState("");
  const [isDownloading, setIsDownloading] = useState(false);
  const roomSelectRef = useRef<HTMLSelectElement>(null);

  async function load(nextFilters: ReportFilters = appliedFilters) {
    setIsLoading(true);
    setError(null);
    try {
      const params = paramsFor(nextFilters);
      setReport(await apiFetch<MonthlyReport>(`/reports/monthly?${params}`));
    } catch (loadError) {
      setError(messageFor(loadError));
    } finally {
      setIsLoading(false);
    }
  }

  async function loadInitial() {
    setIsLoading(true);
    setError(null);
    try {
      const [roomResponse, reportResponse] = await Promise.all([
        apiFetch<RoomListResponse>("/rooms?limit=100&sort=code:asc"),
        apiFetch<MonthlyReport>(
          `/reports/monthly?${paramsFor(initialFilters)}`,
        ),
      ]);
      setRooms(roomResponse.data);
      setReport(reportResponse);
    } catch (loadError) {
      setReport(null);
      setError(messageFor(loadError));
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    void loadInitial();
  }, []);

  async function applyFilters(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextFilters = { ...filters };
    setAppliedFilters(nextFilters);
    await load(nextFilters);
  }

  async function downloadCsv() {
    setIsDownloading(true);
    setDownloadStatus("");
    setError(null);
    try {
      const response = await fetch(
        `${apiBaseUrl}/reports/monthly.csv?${paramsFor(appliedFilters)}`,
        { credentials: "include" },
      );
      if (!response.ok) throw new Error("Khong tai duoc CSV");
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `bao-cao-${appliedFilters.billingYear}-${appliedFilters.billingMonth.padStart(
        2,
        "0",
      )}${appliedFilters.roomId ? `-${roomCodeFor(rooms, appliedFilters.roomId)}` : ""}.csv`;
      link.click();
      URL.revokeObjectURL(url);
      setDownloadStatus("Đã tạo file CSV");
    } catch (downloadError) {
      setError(messageFor(downloadError));
    } finally {
      setIsDownloading(false);
    }
  }

  return (
    <div className="reports-layout">
      <section
        className="rooms-list"
        aria-busy={isLoading}
        aria-labelledby="reports-title"
      >
        <div className="section-heading">
          <div>
            <h1 id="reports-title">Báo cáo</h1>
            <p>
              {report
                ? `Kỳ ${formatDate(report.periodStart)} - ${formatDate(report.periodEnd)}`
                : "Doanh thu, công nợ và điện nước"}
            </p>
          </div>
        </div>

        <form className="toolbar report-toolbar" onSubmit={applyFilters}>
          <label className="field">
            Phòng
            <select
              onChange={(event) =>
                setFilters({ ...filters, roomId: event.target.value })
              }
              ref={roomSelectRef}
              value={filters.roomId}
            >
              <option value="">Tất cả phòng</option>
              {rooms.map((room) => (
                <option key={room.id} value={room.id}>
                  Phòng {room.code}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            Năm
            <input
              inputMode="numeric"
              onChange={(event) =>
                setFilters({ ...filters, billingYear: event.target.value })
              }
              value={filters.billingYear}
            />
          </label>
          <label className="field">
            Tháng
            <input
              inputMode="numeric"
              onChange={(event) =>
                setFilters({ ...filters, billingMonth: event.target.value })
              }
              value={filters.billingMonth}
            />
          </label>
          <div className="report-actions">
            <Button disabled={isLoading} type="submit">
              {isLoading ? "Đang tải" : "Xem báo cáo"}
            </Button>
            <Button
              type="button"
              disabled={isDownloading || isLoading}
              onClick={() => void downloadCsv()}
            >
              {isDownloading ? "Đang tải" : "Tải CSV"}
            </Button>
          </div>
        </form>

        {error ? (
          <div className="notice error" role="alert">
            <span>{error}</span>
            <Button
              type="button"
              variant="secondary"
              onClick={() =>
                void (rooms.length === 0 ? loadInitial() : load(appliedFilters))
              }
            >
              Thử lại
            </Button>
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
          <div aria-live="polite">
            <div className="metric-grid report-cash-metrics">
              <Metric
                hint="Giá trị hóa đơn gộp trong kỳ"
                label="Tổng phát sinh"
                value={formatMoney(report.totals.grossBilled)}
              />
              <Metric
                hint="Khoản thu theo ngày nhận tiền"
                label="Tiền thực thu"
                value={formatMoney(report.totals.cashReceived)}
              />
              <Metric
                hint="Khoản thu bị hủy theo ngày hủy"
                label="Tiền đã đảo"
                value={formatMoney(report.totals.cashReversed)}
              />
              <Metric
                hint="Phân bổ số dư, không phải tiền thu mới"
                label="Credit đã áp dụng"
                value={formatMoney(report.totals.creditApplied)}
              />
              <Metric
                hint="Còn phải thu sau các phân bổ"
                label="Công nợ ròng"
                value={formatMoney(report.totals.netOutstanding)}
              />
            </div>

            <section className="panel" aria-labelledby="report-invoices">
              <h2 id="report-invoices">Hóa đơn trong kỳ</h2>
              {report.invoices.length === 0 ? (
                <div className="empty-state report-invoice-empty">
                  <strong>
                    {invoiceEmptyMessage(report, appliedFilters, rooms)}
                  </strong>
                  {appliedFilters.roomId ? (
                    <Button
                      onClick={() => roomSelectRef.current?.focus()}
                      type="button"
                      variant="secondary"
                    >
                      Chọn phòng khác
                    </Button>
                  ) : (
                    <a className="text-link" href="/utilities">
                      Đi đến Chốt tiền
                    </a>
                  )}
                </div>
              ) : (
                <div className="report-table">
                  <div className="report-table-head">
                    <span>Hóa đơn</span>
                    <span>Trạng thái</span>
                    <span>Tổng</span>
                    <span>Còn thu</span>
                  </div>
                  {report.invoices.map((invoice) => (
                    <div className="report-table-row" key={invoice.id}>
                      <span
                        className="report-invoice-cell"
                        data-label="Hóa đơn"
                      >
                        <a
                          aria-label={`Xem hóa đơn Phòng ${invoice.roomCode ?? "-"} tháng ${report.billingMonth}/${report.billingYear}`}
                          className="text-link report-invoice-link"
                          href={`/invoices?invoiceId=${encodeURIComponent(invoice.id)}`}
                        >
                          Hóa đơn Phòng {invoice.roomCode ?? "-"} tháng{" "}
                          {report.billingMonth}/{report.billingYear}
                        </a>
                        <small>{invoice.invoiceNumber}</small>
                      </span>
                      <span data-label="Trạng thái">
                        <StatusBadge tone={invoiceStatusTone(invoice.status)}>
                          {invoiceStatusLabel(invoice.status)}
                        </StatusBadge>
                      </span>
                      <span data-label="Tổng">
                        {formatMoney(invoice.totalAmount)}
                      </span>
                      <span data-label="Còn thu">
                        {formatMoney(invoice.outstandingAmount)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </section>

            <section className="panel" aria-labelledby="report-payments">
              <h2 id="report-payments">Thanh toán trong kỳ</h2>
              {report.payments.length === 0 ? (
                <div className="empty-state">
                  <strong>Chưa có thanh toán</strong>
                </div>
              ) : (
                <div className="report-table">
                  <div className="report-table-head">
                    <span>Mã thu</span>
                    <span>Phòng</span>
                    <span>Ngày thu</span>
                    <span>Số tiền</span>
                  </div>
                  {report.payments.map((payment) => (
                    <div className="report-table-row" key={payment.id}>
                      <span data-label="Mã thu">{payment.paymentNumber}</span>
                      <span data-label="Phòng">{payment.roomCode ?? "-"}</span>
                      <span data-label="Ngày thu">
                        {formatDateTime(payment.paidAt)}
                      </span>
                      <span data-label="Số tiền">
                        {formatMoney(payment.amount)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </section>

            <section className="panel" aria-labelledby="report-debts">
              <h2 id="report-debts">Công nợ trong kỳ</h2>
              {report.debts.length === 0 ? (
                <div className="empty-state">
                  <strong>Không có công nợ</strong>
                </div>
              ) : (
                <div className="report-table">
                  <div className="report-table-head">
                    <span>Phòng</span>
                    <span>Đại diện</span>
                    <span>Còn thu</span>
                    <span>Trạng thái</span>
                  </div>
                  {report.debts.map((debt) => (
                    <div
                      className="report-table-row"
                      key={`${debt.roomId}-${debt.payerTenantId ?? "none"}`}
                    >
                      <span data-label="Phòng">{debt.roomCode ?? "-"}</span>
                      <span data-label="Đại diện">
                        {debt.payerTenantName ?? "Chưa có"}
                      </span>
                      <span data-label="Còn thu">
                        {formatMoney(debt.totalOutstanding)}
                      </span>
                      <span data-label="Trạng thái">
                        {labelForDebt(debt.debtStatus)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </div>
        ) : null}
      </section>
    </div>
  );
}

function Metric({
  hint,
  label,
  value,
}: {
  hint: string;
  label: string;
  value: string;
}) {
  return (
    <article aria-label={label} className="metric">
      <div className="metric-label">{label}</div>
      <div className="metric-value">{value}</div>
      <small className="metric-hint">{hint}</small>
    </article>
  );
}

function paramsFor(filters: ReportFilters) {
  const params = new URLSearchParams({
    billingYear: filters.billingYear,
    billingMonth: filters.billingMonth,
  });
  if (filters.roomId) params.set("roomId", filters.roomId);
  return params.toString();
}

function roomCodeFor(rooms: RoomListResponse["data"], roomId: string) {
  return rooms.find((room) => room.id === roomId)?.code ?? "phong";
}

function invoiceEmptyMessage(
  report: MonthlyReport,
  filters: ReportFilters,
  rooms: RoomListResponse["data"],
) {
  const period = `tháng ${report.billingMonth}/${report.billingYear}`;
  if (!filters.roomId) return `Chưa có hóa đơn trong ${period}.`;
  return `Phòng ${roomCodeFor(rooms, filters.roomId)} chưa có hóa đơn trong ${period}.`;
}

function invoiceStatusTone(
  status: MonthlyReport["invoices"][number]["status"],
) {
  if (status === "PAID") return "success";
  if (status === "PARTIALLY_PAID") return "warning";
  if (status === "CANCELLED") return "danger";
  return "neutral";
}

function invoiceStatusLabel(
  status: MonthlyReport["invoices"][number]["status"],
) {
  return (
    {
      DRAFT: "Nháp",
      ISSUED: "Đã phát hành",
      PARTIALLY_PAID: "Đã thu một phần",
      PAID: "Đã thu",
      OVERDUE: "Quá hạn",
      CANCELLED: "Đã hủy",
    } satisfies Record<MonthlyReport["invoices"][number]["status"], string>
  )[status];
}

function labelForDebt(status: MonthlyReport["debts"][number]["debtStatus"]) {
  return (
    {
      OUTSTANDING: "Còn thu",
      PARTIALLY_PAID: "Đã thu một phần",
      DUE_TODAY: "Đến hạn hôm nay",
      OVERDUE: "Quá hạn",
    } satisfies Record<MonthlyReport["debts"][number]["debtStatus"], string>
  )[status];
}
