import { FormEvent, useEffect, useMemo, useState } from "react";
import { Button, StatusBadge } from "@repo/ui";
import { apiFetch, messageFor } from "../api";
import type { Invoice, PaymentMethod } from "../billing/types";
import {
  formatDate,
  formatMoney,
  makeIdempotencyKey,
  normalizeMoneyInput,
} from "../format";

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

export function InvoicesPage() {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [selectedInvoiceId, setSelectedInvoiceId] = useState("");
  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null);
  const [payment, setPayment] = useState(emptyPayment);
  const [paymentAttempt, setPaymentAttempt] = useState<PaymentAttempt | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [printError, setPrintError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isDetailLoading, setIsDetailLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [canRecordPayment, setCanRecordPayment] = useState(false);

  const listedInvoice = useMemo(
    () => invoices.find((invoice) => invoice.id === selectedInvoiceId) ?? null,
    [invoices, selectedInvoiceId],
  );

  async function loadDetail(invoiceId: string) {
    setSelectedInvoiceId(invoiceId);
    setSelectedInvoice(null);
    setDetailError(null);
    setPrintError(null);
    setIsDetailLoading(true);
    try {
      setSelectedInvoice(
        await apiFetch<Invoice>(`/invoices/${encodeURIComponent(invoiceId)}`),
      );
    } catch (loadError) {
      setDetailError(messageFor(loadError, "Không tải được chi tiết hóa đơn."));
    } finally {
      setIsDetailLoading(false);
    }
  }

  async function load() {
    setIsLoading(true);
    setError(null);
    try {
      const [invoiceResponse, currentUser] = await Promise.all([
        apiFetch<Invoice[]>("/invoices"),
        apiFetch<{ role: "OWNER" | "MANAGER" | "STAFF" | "VIEWER" }>(
          "/auth/me",
        ),
      ]);
      setInvoices(invoiceResponse);
      setCanRecordPayment(currentUser.role !== "VIEWER");
      const requestedInvoiceId = new URLSearchParams(
        window.location.search,
      ).get("invoiceId");
      const targetInvoiceId =
        requestedInvoiceId || selectedInvoiceId || invoiceResponse[0]?.id || "";
      if (targetInvoiceId) {
        await loadDetail(targetInvoiceId);
      } else {
        setSelectedInvoiceId("");
        setSelectedInvoice(null);
      }
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

  useEffect(() => {
    setPaymentAttempt(null);
  }, [selectedInvoiceId]);

  function selectInvoice(invoice: Invoice) {
    const url = new URL(window.location.href);
    url.searchParams.set("invoiceId", invoice.id);
    window.history.replaceState({}, "", url);
    setPayment({ ...emptyPayment, amount: invoice.outstandingAmount });
    void loadDetail(invoice.id);
  }

  function printInvoice() {
    setPrintError(null);
    try {
      window.print();
    } catch {
      setPrintError("Không thể mở bản in. Hãy thử lại.");
    }
  }

  async function createPayment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedInvoice || Number(selectedInvoice.outstandingAmount) <= 0)
      return;
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
      <section className="rooms-list" aria-labelledby="invoices-title">
        <div className="section-heading">
          <div>
            <h1 id="invoices-title">Hóa đơn</h1>
            <p>{invoices.length} hóa đơn đã tạo</p>
          </div>
        </div>

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
        ) : invoices.length === 0 ? (
          <div className="empty-state">
            <strong>Chưa có hóa đơn</strong>
            <a className="text-link" href="/utilities">
              Đi đến Chốt tiền
            </a>
          </div>
        ) : (
          <div className="room-list-stack">
            {invoices.map((invoice) => (
              <button
                className="room-row"
                data-active={invoice.id === selectedInvoiceId}
                key={invoice.id}
                onClick={() => selectInvoice(invoice)}
                type="button"
              >
                <span>
                  <strong>{invoice.invoiceNumber}</strong>
                  <small>
                    Phòng {invoice.roomCode ?? "-"} ·{" "}
                    {invoice.payerTenantName ?? "Chưa xác định"}
                  </small>
                  <small>
                    Còn thu: {formatMoney(invoice.outstandingAmount)}
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

      <section
        className="room-detail invoice-detail-panel"
        aria-busy={isDetailLoading}
        aria-labelledby="invoice-detail-title"
      >
        <div className="section-heading invoice-screen-heading">
          <div>
            <h2 id="invoice-detail-title">Chi tiết hóa đơn</h2>
            <p>
              {selectedInvoice
                ? selectedInvoice.invoiceNumber
                : (listedInvoice?.invoiceNumber ?? "Chọn hóa đơn")}
            </p>
          </div>
          <Button
            className="invoice-print-action"
            disabled={!selectedInvoice || isDetailLoading}
            onClick={printInvoice}
            type="button"
            variant="secondary"
          >
            In hóa đơn
          </Button>
        </div>

        {detailError ? (
          <div className="notice error" role="alert">
            <span>{detailError}</span>
            <Button
              type="button"
              variant="secondary"
              onClick={() => void loadDetail(selectedInvoiceId)}
            >
              Thử lại
            </Button>
          </div>
        ) : isDetailLoading ? (
          <div
            className="invoice-detail-skeleton"
            aria-label="Đang tải hóa đơn"
          >
            <div className="skeleton-row" />
            <div className="skeleton-row" />
            <div className="skeleton-row" />
          </div>
        ) : selectedInvoice ? (
          <div className="invoice-print-sheet">
            <h3 className="invoice-document-title">
              HÓA ĐƠN PHÒNG {selectedInvoice.roomCode ?? "-"} - THÁNG{" "}
              {invoiceMonthLabel(selectedInvoice)}
            </h3>
            <div className="settlement-grid invoice-facts">
              <Fact label="Mã hóa đơn" value={selectedInvoice.invoiceNumber} />
              <Fact
                label="Người đại diện"
                value={selectedInvoice.payerTenantName ?? "Chưa xác định"}
              />
              <Fact
                label="Kỳ tính"
                value={`${formatDate(selectedInvoice.billingPeriodStart)} - ${formatDate(selectedInvoice.billingPeriodEnd)}`}
              />
              <Fact
                label="Ngày phát hành"
                value={formatDate(selectedInvoice.issuedOn)}
              />
              <Fact label="Hạn thu" value={formatDate(selectedInvoice.dueOn)} />
              <Fact
                label="Tổng hóa đơn"
                value={formatMoney(selectedInvoice.totalAmount)}
              />
              <Fact
                label="Đã thanh toán"
                value={formatMoney(selectedInvoice.paidAmount)}
              />
              <Fact
                label="Còn phải thu"
                value={formatMoney(selectedInvoice.outstandingAmount)}
              />
              <Fact
                label="Trạng thái"
                value={statusLabel(selectedInvoice.status)}
              />
            </div>

            <div className="invoice-items">
              {selectedInvoice.items.map((item) => (
                <div
                  aria-label={invoiceItemAccessibleLabel(item)}
                  className={`invoice-item-row${item.itemType === "RENT" ? " invoice-item-row-rent" : ""}`}
                  key={item.id}
                >
                  <span className="invoice-item-main">
                    <strong>
                      {invoiceItemLabel(
                        item.itemType,
                        item.description,
                        selectedInvoice,
                      )}
                    </strong>
                    {isUtilityItem(item.itemType) ? (
                      item.utilityUsage ? (
                        <UtilityEquation usage={item.utilityUsage} />
                      ) : (
                        <small className="utility-usage-unavailable">
                          Chưa có đủ chỉ số để đối chiếu
                        </small>
                      )
                    ) : (
                      <small>
                        {formatDecimal(item.quantity)} {item.unit ?? ""}
                      </small>
                    )}
                  </span>
                  {item.itemType !== "RENT" ? (
                    <span className="invoice-item-money">
                      <small>Đơn giá</small>
                      <strong>
                        {formatMoney(
                          item.utilityUsage?.unitPrice ?? item.unitPrice,
                        )}
                      </strong>
                    </span>
                  ) : null}
                  <span className="invoice-item-money">
                    <small>Thành tiền</small>
                    <strong>{formatMoney(item.amount)}</strong>
                  </span>
                </div>
              ))}
            </div>

            {printError ? (
              <div className="notice error invoice-print-error" role="alert">
                {printError}
              </div>
            ) : null}

            {canRecordPayment ? (
              <form
                className="room-form invoice-payment-form"
                onSubmit={(event) => void createPayment(event)}
              >
                <div className="form-grid">
                  <label className="field">
                    Số tiền thu
                    <input
                      disabled={Number(selectedInvoice.outstandingAmount) <= 0}
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
                      Còn tối đa{" "}
                      {formatMoney(selectedInvoice.outstandingAmount)}
                    </small>
                  </label>
                  <label className="field">
                    Hình thức
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
                      <option value="CASH">Tiền mặt</option>
                      <option value="BANK_TRANSFER">Chuyển khoản</option>
                      <option value="OTHER">Khác</option>
                    </select>
                  </label>
                </div>
                <label className="field">
                  Ghi chú
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
                      Number(payment.amount) <= 0 ||
                      Number(payment.amount) >
                        Number(selectedInvoice.outstandingAmount)
                    }
                  >
                    {isSaving ? "Đang ghi nhận" : "Ghi nhận thanh toán"}
                  </Button>
                </div>
              </form>
            ) : null}
          </div>
        ) : (
          <div className="empty-state">
            <strong>Chưa chọn hóa đơn</strong>
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

function UtilityEquation({
  usage,
}: {
  usage: NonNullable<Invoice["items"][number]["utilityUsage"]>;
}) {
  const unit = displayUnit(usage.unit);
  return (
    <span className="utility-equation">
      <span>
        <small>Chỉ số cũ</small>
        <strong>
          {formatDecimal(usage.previous)} {unit}
        </strong>
      </span>
      <span aria-hidden="true" className="utility-equation-symbol">
        →
      </span>
      <span>
        <small>Chỉ số mới</small>
        <strong>
          {formatDecimal(usage.current)} {unit}
        </strong>
      </span>
      <span aria-hidden="true" className="utility-equation-symbol">
        =
      </span>
      <span>
        <small>Đã dùng</small>
        <strong>
          {formatDecimal(usage.usage)} {unit}
        </strong>
      </span>
    </span>
  );
}

function isUtilityItem(itemType: string) {
  return itemType === "ELECTRICITY" || itemType === "WATER";
}

function displayUnit(unit: "kWh" | "m3") {
  return unit === "m3" ? "m³" : unit;
}

function formatDecimal(value: string) {
  const numeric = Number(value);
  return Number.isFinite(numeric)
    ? new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 6 }).format(
        numeric,
      )
    : value;
}

function invoiceItemAccessibleLabel(item: Invoice["items"][number]) {
  if (item.itemType === "RENT") {
    return `${item.description}, thành tiền ${formatMoney(item.amount)}`;
  }
  if (!isUtilityItem(item.itemType)) {
    return `${item.description}, đơn giá ${formatMoney(item.unitPrice)}, thành tiền ${formatMoney(item.amount)}`;
  }
  if (!item.utilityUsage) {
    return `${item.description}, chưa có đủ chỉ số để đối chiếu, thành tiền ${formatMoney(item.amount)}`;
  }
  const unit = displayUnit(item.utilityUsage.unit);
  return `${item.description}, chỉ số cũ ${formatDecimal(item.utilityUsage.previous)} ${unit}, chỉ số mới ${formatDecimal(item.utilityUsage.current)} ${unit}, đã dùng ${formatDecimal(item.utilityUsage.usage)} ${unit}, đơn giá ${formatMoney(item.utilityUsage.unitPrice)}, thành tiền ${formatMoney(item.utilityUsage.amount)}`;
}

function invoiceMonthLabel(invoice: Invoice) {
  const month = Number(invoice.billingPeriodEnd.slice(5, 7));
  const year = invoice.billingPeriodEnd.slice(0, 4);
  return `${month}/${year}`;
}

function statusTone(status: string) {
  if (status === "PAID") return "success";
  if (status === "PARTIALLY_PAID") return "warning";
  if (status === "CANCELLED") return "danger";
  return "neutral";
}

function statusLabel(status: string) {
  if (status === "PAID") return "Đã thu";
  if (status === "PARTIALLY_PAID") return "Thu một phần";
  if (status === "CANCELLED") return "Đã hủy";
  if (status === "OVERDUE") return "Quá hạn";
  return "Đang thu";
}

function invoiceItemLabel(
  itemType: string,
  description: string,
  invoice: Invoice,
) {
  if (itemType === "ELECTRICITY") return "Tiền điện";
  if (itemType === "WATER") return "Tiền nước";
  if (itemType !== "RENT") return description;
  const month = Number(invoice.billingPeriodEnd.slice(5, 7));
  const year = invoice.billingPeriodEnd.slice(0, 4);
  const startDay = Number(invoice.billingPeriodStart.slice(8, 10));
  const endDay = Number(invoice.billingPeriodEnd.slice(8, 10));
  const fullMonth =
    startDay === 1 && endDay === new Date(Number(year), month, 0).getDate();
  return `Tiền phòng tháng ${month}/${year}${fullMonth ? "" : ` · ${endDay - startDay + 1} ngày`}`;
}
