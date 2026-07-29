import { useEffect, useState } from "react";
import { StatusBadge } from "@repo/ui";
import { ApiError, apiFetch } from "../api";
import type { DebtSummary } from "../billing/types";

export function DebtsPage() {
  const [debts, setDebts] = useState<DebtSummary[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function load() {
      setIsLoading(true);
      setError(null);
      try {
        setDebts(await apiFetch<DebtSummary[]>("/debts"));
      } catch (loadError) {
        setError(messageFor(loadError));
      } finally {
        setIsLoading(false);
      }
    }
    void load();
  }, []);

  const totalDebt = debts.reduce(
    (total, debt) => total + Number(debt.totalOutstanding),
    0,
  );

  return (
    <div className="debt-layout">
      <section className="rooms-list" aria-labelledby="debts-title">
        <div className="section-heading">
          <div>
            <h1 id="debts-title">Cong no</h1>
            <p>{formatMoney(totalDebt)} dang can thu</p>
          </div>
          <StatusBadge tone={totalDebt > 0 ? "warning" : "success"}>
            {totalDebt > 0 ? "Con no" : "Da het no"}
          </StatusBadge>
        </div>

        {error ? (
          <div className="notice error" role="alert">
            {error}
          </div>
        ) : null}

        {isLoading ? (
          <div className="room-list-stack">
            <div className="skeleton-row" />
            <div className="skeleton-row" />
          </div>
        ) : debts.length === 0 ? (
          <div className="empty-state">
            <strong>Chua co cong no</strong>
          </div>
        ) : (
          <div className="debt-grid">
            {debts.map((debt) => (
              <article
                className="debt-row"
                key={`${debt.roomId}-${debt.payerTenantId}`}
              >
                <div className="section-heading compact">
                  <div>
                    <h3>Phong {debt.roomCode ?? debt.roomId.slice(0, 8)}</h3>
                    <p>{debt.payerTenantName ?? "Nguoi dai dien"}</p>
                  </div>
                  <strong>{formatMoney(debt.totalOutstanding)}</strong>
                </div>
                <div className="invoice-items">
                  {debt.invoices.map((invoice) => (
                    <div className="invoice-item-row" key={invoice.id}>
                      <span>
                        <strong>{invoice.invoiceNumber}</strong>
                        <small>
                          {formatDate(invoice.billingPeriodStart)} -{" "}
                          {formatDate(invoice.billingPeriodEnd)}
                        </small>
                      </span>
                      <span>{formatMoney(invoice.outstandingAmount)}</span>
                    </div>
                  ))}
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function formatMoney(value: string | number) {
  return new Intl.NumberFormat("vi-VN").format(Number(value)) + " VND";
}

function formatDate(value: string) {
  if (!value) return "-";
  return new Intl.DateTimeFormat("vi-VN").format(new Date(`${value}T00:00:00`));
}

function messageFor(error: unknown) {
  if (error instanceof ApiError) return error.message;
  if (error instanceof Error) return error.message;
  return "Co loi xay ra";
}
