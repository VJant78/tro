import { FormEvent, useEffect, useMemo, useState } from "react";
import { Button, StatusBadge } from "@repo/ui";
import { ApiError, apiFetch } from "../api";
import type { Invoice, PaymentMethod } from "../billing/types";
import type { Room, RoomListResponse } from "../rooms/types";
import type { SettlementPreview } from "../utilities/types";

const emptyPayment = {
  amount: "",
  method: "CASH" as PaymentMethod,
  notes: "",
};

export function InvoicesPage() {
  const [settlements, setSettlements] = useState<SettlementPreview[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [selectedSettlementId, setSelectedSettlementId] = useState("");
  const [selectedInvoiceId, setSelectedInvoiceId] = useState("");
  const [payment, setPayment] = useState(emptyPayment);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  const finalizedSettlements = useMemo(
    () =>
      settlements.filter(
        (settlement) => settlement.id && settlement.status === "FINALIZED",
      ),
    [settlements],
  );
  const selectedInvoice = useMemo(
    () => invoices.find((invoice) => invoice.id === selectedInvoiceId) ?? null,
    [invoices, selectedInvoiceId],
  );

  async function load() {
    setIsLoading(true);
    setError(null);
    try {
      const [settlementResponse, invoiceResponse, roomResponse] =
        await Promise.all([
          apiFetch<SettlementPreview[]>("/settlements"),
          apiFetch<Invoice[]>("/invoices"),
          apiFetch<RoomListResponse>("/rooms?limit=100&sort=code:asc"),
        ]);
      setSettlements(settlementResponse);
      setInvoices(invoiceResponse);
      setRooms(roomResponse.data);
      setSelectedInvoiceId(
        (current) => current || invoiceResponse[0]?.id || "",
      );
      setSelectedSettlementId(
        (current) =>
          current || settlementResponse.find((item) => item.id)?.id || "",
      );
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
    setPayment((current) => ({
      ...current,
      amount:
        current.amount && current.amount !== "0"
          ? current.amount
          : selectedInvoice.outstandingAmount,
    }));
  }, [selectedInvoice]);

  async function createInvoice(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedSettlementId) return;
    setIsSaving(true);
    setError(null);
    try {
      const invoice = await apiFetch<Invoice>("/invoices/from-settlement", {
        method: "POST",
        body: JSON.stringify({ settlementId: selectedSettlementId }),
      });
      await load();
      setSelectedInvoiceId(invoice.id);
      setPayment({ ...emptyPayment, amount: invoice.outstandingAmount });
    } catch (saveError) {
      setError(messageFor(saveError));
    } finally {
      setIsSaving(false);
    }
  }

  async function createPayment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedInvoice || Number(selectedInvoice.outstandingAmount) <= 0)
      return;
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
      <section className="rooms-list" aria-labelledby="invoices-title">
        <div className="section-heading">
          <div>
            <h1 id="invoices-title">Hoa don</h1>
            <p>{invoices.length} hoa don da tao</p>
          </div>
        </div>

        {error ? (
          <div className="notice error" role="alert">
            {error}
          </div>
        ) : null}

        <form
          className="invoice-create"
          onSubmit={(event) => void createInvoice(event)}
        >
          <label className="field">
            Ky da chot
            <select
              onChange={(event) => setSelectedSettlementId(event.target.value)}
              value={selectedSettlementId}
            >
              <option value="">Chon ky chot</option>
              {finalizedSettlements.map((settlement) => (
                <option key={settlement.id ?? ""} value={settlement.id ?? ""}>
                  Phong {roomCodeFor(settlement.roomId, rooms)} -{" "}
                  {formatDate(settlement.periodStart)} den{" "}
                  {formatDate(settlement.periodEnd)}
                </option>
              ))}
            </select>
          </label>
          <div className="form-actions">
            <Button type="submit" disabled={isSaving || !selectedSettlementId}>
              Tao hoa don
            </Button>
          </div>
        </form>

        {isLoading ? (
          <div className="room-list-stack">
            <div className="skeleton-row" />
            <div className="skeleton-row" />
          </div>
        ) : invoices.length === 0 ? (
          <div className="empty-state">
            <strong>Chua co hoa don</strong>
          </div>
        ) : (
          <div className="room-list-stack">
            {invoices.map((invoice) => (
              <button
                className="room-row"
                data-active={invoice.id === selectedInvoiceId}
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
                    Phong {invoice.roomCode ?? invoice.roomId.slice(0, 8)} -{" "}
                    {invoice.payerTenantName ?? "Nguoi dai dien"}
                  </small>
                  <small>
                    Con thu: {formatMoney(invoice.outstandingAmount)}
                  </small>
                </span>
                <StatusBadge tone={statusTone(invoice.status)}>
                  {statusLabel(invoice.status)}
                </StatusBadge>
              </button>
            ))}
          </div>
        )}
      </section>

      <section className="room-detail" aria-labelledby="invoice-detail-title">
        <div className="section-heading">
          <div>
            <h2 id="invoice-detail-title">Chi tiet hoa don</h2>
            <p>
              {selectedInvoice ? selectedInvoice.invoiceNumber : "Chon hoa don"}
            </p>
          </div>
        </div>

        {selectedInvoice ? (
          <>
            <div className="settlement-grid invoice-facts">
              <Fact
                label="Ky tinh"
                value={`${formatDate(selectedInvoice.billingPeriodStart)} - ${formatDate(selectedInvoice.billingPeriodEnd)}`}
              />
              <Fact label="Han thu" value={formatDate(selectedInvoice.dueOn)} />
              <Fact
                label="Tong tien"
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
            </div>

            <div className="invoice-items">
              {selectedInvoice.items.map((item) => (
                <div className="invoice-item-row" key={item.id}>
                  <span>
                    <strong>{item.description}</strong>
                    <small>
                      {Number(item.quantity).toLocaleString("vi-VN")}{" "}
                      {item.unit ?? ""}
                    </small>
                  </span>
                  <strong>{formatMoney(item.amount)}</strong>
                </div>
              ))}
            </div>

            <form
              className="room-form"
              onSubmit={(event) => void createPayment(event)}
            >
              <div className="form-grid">
                <label className="field">
                  So tien thu
                  <input
                    disabled={Number(selectedInvoice.outstandingAmount) <= 0}
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
                    disabled={Number(selectedInvoice.outstandingAmount) <= 0}
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
                  disabled={Number(selectedInvoice.outstandingAmount) <= 0}
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
                    Number(selectedInvoice.outstandingAmount) <= 0 ||
                    Number(payment.amount) <= 0
                  }
                >
                  Ghi nhan thanh toan
                </Button>
              </div>
            </form>
          </>
        ) : (
          <div className="empty-state">
            <strong>Chua chon hoa don</strong>
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

function statusTone(status: string) {
  if (status === "PAID") return "success";
  if (status === "PARTIALLY_PAID") return "warning";
  if (status === "CANCELLED") return "danger";
  return "neutral";
}

function statusLabel(status: string) {
  if (status === "PAID") return "Da thu";
  if (status === "PARTIALLY_PAID") return "Thu mot phan";
  if (status === "CANCELLED") return "Da huy";
  return "Dang thu";
}

function formatMoney(value: string | number) {
  return new Intl.NumberFormat("vi-VN").format(Number(value)) + " VND";
}

function formatDate(value: string) {
  if (!value) return "-";
  return new Intl.DateTimeFormat("vi-VN").format(new Date(`${value}T00:00:00`));
}

function roomCodeFor(roomId: string, rooms: Room[]) {
  return rooms.find((room) => room.id === roomId)?.code ?? roomId.slice(0, 8);
}

function messageFor(error: unknown) {
  if (error instanceof ApiError) return error.message;
  if (error instanceof Error) return error.message;
  return "Co loi xay ra";
}
