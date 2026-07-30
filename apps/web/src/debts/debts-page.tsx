import { FormEvent, useEffect, useMemo, useState } from "react";
import { Button, StatusBadge } from "@repo/ui";
import { apiFetch, messageFor } from "../api";
import {
  formatDate,
  formatDateTime,
  formatMoney,
  makeIdempotencyKey,
  normalizeMoneyInput,
} from "../format";
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

type PaymentAttempt = {
  invoiceId: string;
  amount: string;
  method: PaymentMethod;
  notes: string;
  idempotencyKey: string;
  paidAt: string;
};

export function DebtsPage() {
  const [debts, setDebts] = useState<DebtSummary[]>([]);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [filters, setFilters] = useState(() => ({
    roomId: new URLSearchParams(window.location.search).get("roomId") ?? "",
    payerTenantId: "",
    status: "" as DebtStatus | "",
  }));
  const [selectedDebtKey, setSelectedDebtKey] = useState("");
  const [selectedInvoiceId, setSelectedInvoiceId] = useState("");
  const [payment, setPayment] = useState(emptyPayment);
  const [paymentAttempt, setPaymentAttempt] = useState<PaymentAttempt | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
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

  useEffect(() => {
    setPaymentAttempt(null);
  }, [selectedInvoice?.id]);

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
    setSuccess(null);
    const confirmed = window.confirm(
      `Ghi nhận đã thu ${formatMoney(payment.amount)} cho hóa đơn ${selectedInvoice.invoiceNumber}?`,
    );
    if (!confirmed) {
      setIsSaving(false);
      return;
    }
    const attempt =
      paymentAttempt?.invoiceId === selectedInvoice.id &&
      paymentAttempt.amount === payment.amount &&
      paymentAttempt.method === payment.method &&
      paymentAttempt.notes === payment.notes
        ? paymentAttempt
        : {
            invoiceId: selectedInvoice.id,
            amount: payment.amount,
            method: payment.method,
            notes: payment.notes,
            idempotencyKey: makeIdempotencyKey(),
            paidAt: new Date().toISOString(),
          };
    setPaymentAttempt(attempt);
    try {
      await apiFetch("/payments", {
        method: "POST",
        headers: { "Idempotency-Key": attempt.idempotencyKey },
        body: JSON.stringify({
          invoiceId: selectedInvoice.id,
          amount: payment.amount,
          method: payment.method,
          paidAt: attempt.paidAt,
          notes: payment.notes || null,
        }),
      });
      setSuccess(
        `Đã thu ${formatMoney(payment.amount)} cho hóa đơn ${selectedInvoice.invoiceNumber}.`,
      );
      setPayment(emptyPayment);
      setPaymentAttempt(null);
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
            <h1 id="debts-title">Công nợ</h1>
            <p>{formatMoney(totalDebt)} đang cần thu</p>
          </div>
          <StatusBadge tone={totalDebt > 0 ? "warning" : "success"}>
            {totalDebt > 0 ? "Còn nợ" : "Đã hết nợ"}
          </StatusBadge>
        </div>

        <form className="toolbar debts-toolbar" onSubmit={applyFilters}>
          <select
            aria-label="Lọc phòng"
            onChange={(event) =>
              setFilters({ ...filters, roomId: event.target.value })
            }
            value={filters.roomId}
          >
            <option value="">Tất cả phòng</option>
            {rooms.map((room) => (
              <option key={room.id} value={room.id}>
                {room.code}
              </option>
            ))}
          </select>
          <select
            aria-label="Lọc người thuê"
            onChange={(event) =>
              setFilters({ ...filters, payerTenantId: event.target.value })
            }
            value={filters.payerTenantId}
          >
            <option value="">Tất cả người thuê</option>
            {tenants.map((tenant) => (
              <option key={tenant.id} value={tenant.id}>
                {tenant.fullName}
              </option>
            ))}
          </select>
          <select
            aria-label="Lọc trạng thái"
            onChange={(event) =>
              setFilters({
                ...filters,
                status: event.target.value as DebtStatus | "",
              })
            }
            value={filters.status}
          >
            <option value="">Tất cả trạng thái</option>
            <option value="OUTSTANDING">Đang nợ</option>
            <option value="PARTIALLY_PAID">Thu một phần</option>
            <option value="DUE_TODAY">Đến hạn hôm nay</option>
            <option value="OVERDUE">Quá hạn</option>
          </select>
          <Button type="submit">Lọc</Button>
        </form>

        {error ? (
          <div className="notice error" role="alert">
            <span>{error}</span>
            <Button
              type="button"
              variant="secondary"
              onClick={() => void load()}
            >
              Thử lại
            </Button>
          </div>
        ) : null}
        {success ? (
          <div className="notice success" aria-live="polite">
            {success}
          </div>
        ) : null}

        {isLoading ? (
          <div className="room-list-stack">
            <div className="skeleton-row" />
            <div className="skeleton-row" />
          </div>
        ) : debts.length === 0 ? (
          <div className="empty-state">
            <strong>Không có công nợ theo bộ lọc</strong>
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
                  <strong>Phòng {debt.roomCode ?? "-"}</strong>
                  <small>{debt.payerTenantName ?? "Chưa xác định"}</small>
                  <small>
                    {debt.invoiceCount} hóa đơn · hạn gần nhất{" "}
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
            <h2 id="debt-detail-title">Chi tiết công nợ</h2>
            <p>
              {selectedDebt
                ? `Phòng ${selectedDebt.roomCode ?? "-"}`
                : "Chọn công nợ"}
            </p>
          </div>
        </div>

        {selectedDebt && selectedInvoice ? (
          <>
            <div className="settlement-grid invoice-facts">
              <Fact
                label="Người đại diện"
                value={selectedDebt.payerTenantName ?? "-"}
              />
              <Fact
                label="Tổng nợ"
                value={formatMoney(selectedDebt.totalOutstanding)}
              />
              <Fact
                label="Hạn gần nhất"
                value={formatDate(selectedDebt.nearestDueOn)}
              />
              <Fact
                label="Trạng thái"
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
                label="Tổng hóa đơn"
                value={formatMoney(selectedInvoice.totalAmount)}
              />
              <Fact
                label="Đã thu"
                value={formatMoney(selectedInvoice.paidAmount)}
              />
              <Fact
                label="Còn thu"
                value={formatMoney(selectedInvoice.outstandingAmount)}
              />
              <Fact label="Hạn thu" value={formatDate(selectedInvoice.dueOn)} />
            </div>

            <div className="invoice-items">
              {selectedInvoice.paymentAllocations.length === 0 ? (
                <div className="empty-state">
                  <strong>Chưa có thanh toán</strong>
                </div>
              ) : (
                selectedInvoice.paymentAllocations.map((allocation) => (
                  <div
                    className="invoice-item-row"
                    key={`${allocation.paymentNumber ?? "payment"}-${allocation.allocatedAt}`}
                  >
                    <span>
                      <strong>
                        {allocation.paymentNumber ?? "Thanh toán"}
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
                  Số tiền thu
                  <input
                    inputMode="numeric"
                    onChange={(event) =>
                      setPayment({
                        ...payment,
                        amount: normalizeMoneyInput(event.target.value),
                      })
                    }
                    value={payment.amount}
                  />
                  <small className="field-hint">
                    Còn tối đa {formatMoney(selectedInvoice.outstandingAmount)}
                  </small>
                </label>
                <label className="field">
                  Hình thức
                  <select
                    onChange={(event) =>
                      setPayment({
                        ...payment,
                        method: event.target.value as PaymentMethod,
                      })
                    }
                    value={payment.method}
                  >
                    <option value="CASH">Tiền mặt</option>
                    <option value="BANK_TRANSFER">Chuyển khoản</option>
                    <option value="OTHER">Khác</option>
                  </select>
                </label>
              </div>
              <label className="field">
                Ghi chú
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
                  disabled={
                    isSaving ||
                    Number(payment.amount) <= 0 ||
                    Number(payment.amount) >
                      Number(selectedInvoice.outstandingAmount)
                  }
                >
                  {isSaving ? "Đang ghi nhận" : "Thu tiền"}
                </Button>
              </div>
            </form>
          </>
        ) : (
          <div className="empty-state">
            <strong>Chưa chọn công nợ</strong>
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
  if (status === "OVERDUE") return `Quá hạn ${daysOverdue} ngày`;
  if (status === "DUE_TODAY") return "Đến hạn hôm nay";
  if (status === "PARTIALLY_PAID") return "Thu một phần";
  return "Đang nợ";
}

function methodLabel(method: PaymentMethod | null) {
  if (method === "BANK_TRANSFER") return "Chuyển khoản";
  if (method === "OTHER") return "Khác";
  return "Tiền mặt";
}
