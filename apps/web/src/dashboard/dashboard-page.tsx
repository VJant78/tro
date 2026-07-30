import { useEffect, useState } from "react";
import { StatusBadge } from "@repo/ui";
import { apiFetch, messageFor } from "../api";
import type { DashboardAction, DashboardSummary } from "../billing/types";
import { formatDate, formatMoney } from "../format";

export function DashboardPage() {
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [actions, setActions] = useState<DashboardAction[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function load() {
      setIsLoading(true);
      setError(null);
      try {
        const [summaryResponse, actionResponse] = await Promise.all([
          apiFetch<DashboardSummary>("/dashboard/summary"),
          apiFetch<
            | DashboardAction[]
            | { data?: DashboardAction[]; items?: DashboardAction[] }
          >("/dashboard/actions"),
        ]);
        setSummary(summaryResponse);
        setActions(
          Array.isArray(actionResponse)
            ? actionResponse
            : Array.isArray(actionResponse?.data)
              ? actionResponse.data
              : Array.isArray(actionResponse?.items)
                ? actionResponse.items
                : [],
        );
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
          <h1>Tổng quan</h1>
          <p>
            {summary
              ? `Tháng ${summary.billingMonth}/${summary.billingYear}`
              : "Việc cần làm và tình hình thu tiền"}
          </p>
        </div>
        {summary ? (
          <StatusBadge tone={actions.length > 0 ? "warning" : "success"}>
            {actions.length > 0 ? "Cần xử lý" : "Ổn định"}
          </StatusBadge>
        ) : null}
      </div>

      {error ? (
        <div className="notice error" role="alert">
          <span>{error}</span>
          <button
            className="ui-button ui-button-secondary"
            onClick={() => window.location.reload()}
            type="button"
          >
            Thử lại
          </button>
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
            <Metric label="Tổng phòng" value={String(summary.totals.rooms)} />
            <Metric
              label="Đang thuê"
              value={String(summary.totals.occupiedRooms)}
            />
            <Metric
              label="Cần thu tháng này"
              value={formatMoney(summary.totals.currentMonthCollectable)}
            />
            <Metric
              label="Đã thu tháng này"
              value={formatMoney(summary.totals.currentMonthCollected)}
            />
            <Metric
              label="Còn thu tháng này"
              value={formatMoney(summary.totals.currentMonthOutstanding)}
            />
            <Metric
              label="Hóa đơn quá hạn"
              value={String(summary.totals.overdueInvoiceCount)}
            />
            <Metric
              label="Tiền quá hạn"
              value={formatMoney(summary.totals.overdueAmount)}
            />
          </div>

          <section className="panel" aria-labelledby="attention-title">
            <div className="section-heading compact">
              <div>
                <h2 id="attention-title">Việc cần làm</h2>
                <p>Ưu tiên các kỳ chưa chốt và khoản sắp đến hạn.</p>
              </div>
            </div>
            {actions.length === 0 ? (
              <div className="empty-state">
                <strong>Không có việc tồn đọng</strong>
              </div>
            ) : (
              <div className="action-queue">
                {actions.map((item) => (
                  <div className="action-row" key={item.id}>
                    <span>
                      <StatusBadge tone={actionTone(item.kind)}>
                        {actionLabel(item.kind)}
                      </StatusBadge>
                      <strong>Phòng {item.roomCode ?? "-"}</strong>
                      <small>{actionContext(item)}</small>
                    </span>
                    <span className="action-row-end">
                      {item.amount ? (
                        <strong>{formatMoney(item.amount)}</strong>
                      ) : null}
                      <a
                        className="ui-button ui-button-secondary"
                        href={targetUrl(item)}
                      >
                        Xử lý
                      </a>
                    </span>
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

function actionTone(
  kind: DashboardAction["kind"],
): "neutral" | "warning" | "danger" {
  return kind === "OVERDUE"
    ? "danger"
    : kind === "DUE_TODAY" ||
        kind === "INVOICE_PENDING" ||
        kind === "ACTION_REQUIRED"
      ? "warning"
      : "neutral";
}

function actionLabel(kind: DashboardAction["kind"]) {
  return (
    {
      UNSETTLED_PERIOD: "Chưa chốt kỳ",
      INVOICE_PENDING: "Chưa có hóa đơn",
      ACTION_REQUIRED: "Cần kiểm tra",
      DUE_SOON: "Sắp đến hạn",
      DUE_TODAY: "Đến hạn hôm nay",
      OVERDUE: "Quá hạn",
    } satisfies Record<DashboardAction["kind"], string>
  )[kind];
}

function actionContext(item: DashboardAction) {
  if (item.periodStart && item.periodEnd) {
    return `Kỳ ${formatDate(item.periodStart)} - ${formatDate(item.periodEnd)}`;
  }
  if (item.dueOn) return `Hạn thu ${formatDate(item.dueOn)}`;
  return item.reason ?? "Mở để xử lý";
}

function targetUrl(item: DashboardAction) {
  const params = new URLSearchParams(item.target.params ?? {});
  const query = params.toString();
  return `${item.target.route}${query ? `?${query}` : ""}`;
}
