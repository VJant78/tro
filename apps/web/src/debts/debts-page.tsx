import { FormEvent, useEffect, useMemo, useState } from "react";
import { Button, StatusBadge } from "@repo/ui";
import { ApiError, apiFetch } from "../api";
import type {
  DebtStatus,
  DebtSummary,
  Invoice,
  PaymentMethod,
} from "../billing/types";
import type { Room, RoomListResponse } from "../rooms/types";
import type { Tenant, TenantListResponse } from "../tenants/types";

const emptyPayment = {
  amount: "",
  method: "CASH" as PaymentMethod,
  notes: "",
};

export function DebtsPage() {
  const [debts, setDebts] = useState<DebtSummary[]>([]);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [filters, setFilters] = useState({
    roomId: "",
    payerTenantId: "",
    status: "" as DebtStatus | "",
  });
  const [selectedDebtKey, setSelectedDebtKey] = useState("");
  const [selectedInvoiceId, setSelectedInvoiceId] = useState("");
  const [payment, setPayment] = useState(emptyPayment);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  const selectedDebt = useMemo(
    () => debts.find((debt) => debtKey(debt) === selectedDebtKey) ?? null,
    [debts, selectedDebtKey],
  );
  const selectedInvoice = useMemo(
    () =>
      selectedDebt?.invoices.find(
        (invoice) => invoice.id === selectedInvoiceId,
      ) ??
      selectedDebt?.invoices[0] ??
      null,
    [selectedDebt, selectedInvoiceId],
  );
  const totalDebt = debts.reduce(
    (total, debt) => total + Number(debt.totalOutstanding),
    0,
  );

  async function load() {
    setIsLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (filters.roomId) params.set("roomId", filters.roomId);
      if (filters.payerTenantId)
        params.set("payerTenantId", filters.payerTenantId);
      if (filters.status) params.set("status", filters.status);

      const [debtResponse, roomResponse, tenantResponse] = await Promise.all([
        apiFetch<DebtSummary[]>(
          `/debts${params.toString() ? `?${params.toString()}` : ""}`,
        ),
        apiFetch<RoomListResponse>("/rooms?limit=100&sort=code:asc"),
        apiFetch<TenantListResponse>("/tenants?limit=100"),
      ]);
      setDebts(debtResponse);
      setRooms(roomResponse.data);
      setTenants(tenantResponse.data);
      setSelectedDebtKey((current) => {
        if (debtResponse.some((debt) => debtKey(debt) === current)) {
          return current;
        }
        return debtResponse[0] ? debtKey(debtResponse[0]) : "";
      });
    } catch (loadError) {
      setError(messageFor(loadError));
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  useEffect(() => {
    if (!selectedInvoice) return;
    setSelectedInvoiceId(selectedInvoice.id);
    setPayment((current) => ({
      ...current,
      amount:
        current.amount && current.amount !== "0"
          ? current.amount
          : selectedInvoice.outstandingAmount,
    }));
  }, [selectedInvoice]);

  async function applyFilters(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await load();
  }

  async function createPayment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedInvoice || Number(selectedInvoice.outstandingAmount) <= 0) {
      return;
    }
    setIsSaving(true);
    setError(null);
    try {
      await apiFetch("/payments", {
        method: "POST",
        headers: { "Idempotency-Key": crypto.randomUUID() },
        body: JSON.stringify({
          invoiceId: selectedInvoice.id,
          amount: payment.amount,
          method: payment.method,
          notes: payment.notes || null,
        }),
      });
      setPayment(emptyPayment);
      await load();
    } catch (saveError) {
      setError(messageFor(saveError));
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="billing-layout">
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

        <form className="toolbar debts-toolbar" onSubmit={applyFilters}>
          <select
            aria-label="Loc phong"
            onChange={(event) =>
              setFilters({ ...filters, roomId: event.target.value })
            }
            value={filters.roomId}
          >
            <option value="">Tat ca phong</option>
            {rooms.map((room) => (
              <option key={room.id} value={room.id}>
                {room.code}
              </option>
            ))}
          </select>
          <select
            aria-label="Loc nguoi thue"
            onChange={(event) =>
              setFilters({ ...filters, payerTenantId: event.target.value })
            }
            value={filters.payerTenantId}
          >
            <option value="">Tat ca nguoi thue</option>
            {tenants.map((tenant) => (
              <option key={tenant.id} value={tenant.id}>
                {tenant.fullName}
              </option>
            ))}
          </select>
          <select
            aria-label="Loc trang thai"
            onChange={(event) =>
              setFilters({
                ...filters,
                status: event.target.value as DebtStatus | "",
              })
            }
            value={filters.status}
          >
            <option value="">Tat ca trang thai</option>
            <option value="OUTSTANDING">Dang no</option>
            <option value="PARTIALLY_PAID">Thu mot phan</option>
            <option value="DUE_TODAY">Den han hom nay</option>
            <option value="OVERDUE">Qua han</option>
          </select>
          <Button type="submit">Loc</Button>
        </form>

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
          <div className="room-list-stack">
            {debts.map((debt) => (
              <button
                className="room-row"
                data-active={debtKey(debt) === selectedDebtKey}
                key={debtKey(debt)}
                onClick={() => {
                  setSelectedDebtKey(debtKey(debt));
                  setSelectedInvoiceId(debt.invoices[0]?.id ?? "");
                  setPayment({
                    ...emptyPayment,
                    amount: debt.invoices[0]?.outstandingAmount ?? "",
                  });
                }}
                type="button"
              >
                <span>
                  <strong>
                    Phong {debt.roomCode ?? debt.roomId.slice(0, 8)}
                  </strong>
                  <small>{debt.payerTenantName ?? "Nguoi dai dien"}</small>
                  <small>
                    {debt.invoiceCount} hoa don - han gan nhat{" "}
                    {formatDate(debt.nearestDueOn)}
                  </small>
                </span>
                <span className="debt-row-actions">
                  <StatusBadge tone={debtTone(debt.debtStatus)}>
                    {debtLabel(debt.debtStatus, debt.daysOverdue)}
                  </StatusBadge>
                  <strong>{formatMoney(debt.totalOutstanding)}</strong>
                </span>
              </button>
            ))}
          </div>
        )}
      </section>

      <section className="room-detail" aria-labelledby="debt-detail-title">
        <div className="section-heading">
          <div>
            <h2 id="debt-detail-title">Chi tiet cong no</h2>
            <p>
              {selectedDebt
                ? `Phong ${selectedDebt.roomCode ?? selectedDebt.roomId.slice(0, 8)}`
                : "Chon cong no"}
            </p>
          </div>
        </div>

        {selectedDebt && selectedInvoice ? (
          <>
            <div className="settlement-grid invoice-facts">
              <Fact
                label="Nguoi dai dien"
                value={selectedDebt.payerTenantName ?? "-"}
              />
              <Fact
                label="Tong no"
                value={formatMoney(selectedDebt.totalOutstanding)}
              />
              <Fact
                label="Han gan nhat"
                value={formatDate(selectedDebt.nearestDueOn)}
              />
              <Fact
                label="Trang thai"
                value={debtLabel(
                  selectedDebt.debtStatus,
                  selectedDebt.daysOverdue,
                )}
              />
            </div>

            <div className="invoice-items">
              {selectedDebt.invoices.map((invoice) => (
                <button
                  className="invoice-item-row invoice-select-row"
                  data-active={invoice.id === selectedInvoice.id}
                  key={invoice.id}
                  onClick={() => {
                    setSelectedInvoiceId(invoice.id);
                    setPayment({
                      ...emptyPayment,
                      amount: invoice.outstandingAmount,
                    });
                  }}
                  type="button"
                >
                  <span>
                    <strong>{invoice.invoiceNumber}</strong>
                    <small>
                      {formatDate(invoice.billingPeriodStart)} -{" "}
                      {formatDate(invoice.billingPeriodEnd)}
                    </small>
                  </span>
                  <span>{formatMoney(invoice.outstandingAmount)}</span>
                </button>
              ))}
            </div>

            <div className="settlement-grid invoice-facts">
              <Fact
                label="Tong hoa don"
                value={formatMoney(selectedInvoice.totalAmount)}
              />
              <Fact
                label="Da thu"
                value={formatMoney(selectedInvoice.paidAmount)}
              />
              <Fact
                label="Con thu"
                value={formatMoney(selectedInvoice.outstandingAmount)}
              />
              <Fact label="Han thu" value={formatDate(selectedInvoice.dueOn)} />
            </div>

            <div className="invoice-items">
              {selectedInvoice.paymentAllocations.length === 0 ? (
                <div className="empty-state">
                  <strong>Chua co thanh toan</strong>
                </div>
              ) : (
                selectedInvoice.paymentAllocations.map((allocation) => (
                  <div className="invoice-item-row" key={allocation.id}>
                    <span>
                      <strong>
                        {allocation.paymentNumber ?? allocation.paymentId}
                      </strong>
                      <small>
                        {methodLabel(allocation.paymentMethod)} -{" "}
                        {formatDateTime(
                          allocation.paidAt ?? allocation.allocatedAt,
                        )}
                      </small>
                    </span>
                    <strong>{formatMoney(allocation.amount)}</strong>
                  </div>
                ))
              )}
            </div>

            <form
              className="room-form"
              onSubmit={(event) => void createPayment(event)}
            >
              <div className="form-grid">
                <label className="field">
                  So tien thu
                  <input
                    inputMode="numeric"
                    onChange={(event) =>
                      setPayment({ ...payment, amount: event.target.value })
                    }
                    value={payment.amount}
                  />
                </label>
                <label className="field">
                  Hinh thuc
                  <select
                    onChange={(event) =>
                      setPayment({
                        ...payment,
                        method: event.target.value as PaymentMethod,
                      })
                    }
                    value={payment.method}
                  >
                    <option value="CASH">Tien mat</option>
                    <option value="BANK_TRANSFER">Chuyen khoan</option>
                    <option value="OTHER">Khac</option>
                  </select>
                </label>
              </div>
              <label className="field">
                Ghi chu
                <textarea
                  onChange={(event) =>
                    setPayment({ ...payment, notes: event.target.value })
                  }
                  value={payment.notes}
                />
              </label>
              <div className="form-actions">
                <Button
                  type="submit"
                  disabled={isSaving || Number(payment.amount) <= 0}
                >
                  Thu nhanh
                </Button>
              </div>
            </form>
          </>
        ) : (
          <div className="empty-state">
            <strong>Chua chon cong no</strong>
          </div>
        )}
      </section>
    </div>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <article className="pricing-cell">
      <small>{label}</small>
      <strong>{value}</strong>
    </article>
  );
}

function debtKey(debt: DebtSummary) {
  return `${debt.roomId}:${debt.payerTenantId ?? "unknown"}`;
}

function debtTone(status: DebtStatus) {
  if (status === "OVERDUE") return "danger";
  if (status === "DUE_TODAY" || status === "PARTIALLY_PAID") return "warning";
  return "neutral";
}

function debtLabel(status: DebtStatus, daysOverdue: number) {
  if (status === "OVERDUE") return `Qua han ${daysOverdue} ngay`;
  if (status === "DUE_TODAY") return "Den han hom nay";
  if (status === "PARTIALLY_PAID") return "Thu mot phan";
  return "Dang no";
}

function methodLabel(method: PaymentMethod | null) {
  if (method === "BANK_TRANSFER") return "Chuyen khoan";
  if (method === "OTHER") return "Khac";
  return "Tien mat";
}

function formatMoney(value: string | number) {
  return new Intl.NumberFormat("vi-VN").format(Number(value)) + " VND";
}

function formatDate(value: string | null) {
  if (!value) return "-";
  return new Intl.DateTimeFormat("vi-VN").format(new Date(`${value}T00:00:00`));
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("vi-VN", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(value));
}

function messageFor(error: unknown) {
  if (error instanceof ApiError) return error.message;
  if (error instanceof Error) return error.message;
  return "Co loi xay ra";
}
