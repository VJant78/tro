import { FormEvent, useEffect, useMemo, useState } from "react";
import { Button, StatusBadge } from "@repo/ui";
import { ApiError, apiFetch, messageFor } from "../api";
import { Modal } from "../components/modal";
import {
  formatDate,
  formatDateTime,
  formatMoney,
  makeIdempotencyKey,
  normalizeMoneyInput,
} from "../format";
import type { Room } from "../rooms/types";
import type {
  Receipt,
  ReceiptDetail,
  ReceiptHistoryResponse,
  ReceiptIntent,
  ReceiptPreview,
  ReceiptResult,
  VoidReceiptResponse,
} from "./types";

type ReceiptDialogView = "collect" | "history";

export function ReceiptDialog({
  initialView,
  onClose,
  onCollected,
  room,
}: {
  initialView: ReceiptDialogView;
  onClose: () => void;
  onCollected: (message: string) => void;
  room: Room;
}) {
  const [view, setView] = useState(initialView);
  const [dialogSuccess, setDialogSuccess] = useState<string | null>(null);
  const tenancyId = room.currentOccupancy?.tenancyId;

  if (!room.currentOccupancy || !tenancyId) return null;

  return (
    <Modal
      onClose={onClose}
      title={view === "collect" ? "Thu tiền" : "Lịch sử thu"}
    >
      <div className="receipt-dialog-heading">
        <div>
          <strong>{room.name}</strong>
          <small>Đại diện: {room.currentOccupancy.representativeName}</small>
        </div>
        <div className="receipt-view-switch" aria-label="Chọn nội dung">
          <button
            aria-pressed={view === "collect"}
            onClick={() => setView("collect")}
            type="button"
          >
            Thu tiền
          </button>
          <button
            aria-pressed={view === "history"}
            onClick={() => setView("history")}
            type="button"
          >
            Lịch sử
          </button>
        </div>
      </div>
      {dialogSuccess ? (
        <div className="notice success" aria-live="polite">
          {dialogSuccess}
        </div>
      ) : null}
      {view === "collect" ? (
        <CollectReceiptForm
          onCollected={(message) => {
            setDialogSuccess(message);
            onCollected(message);
            setView("history");
          }}
          room={room}
          tenancyId={tenancyId}
        />
      ) : (
        <ReceiptHistory
          onCollected={(message) => {
            setDialogSuccess(message);
            onCollected(message);
          }}
          tenancyId={tenancyId}
        />
      )}
    </Modal>
  );
}

function CollectReceiptForm({
  onCollected,
  room,
  tenancyId,
}: {
  onCollected: (message: string) => void;
  room: Room;
  tenancyId: string;
}) {
  const [form, setForm] = useState(() => emptyReceiptIntent());
  const [preview, setPreview] = useState<ReceiptPreview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [idempotencyKey, setIdempotencyKey] = useState(makeIdempotencyKey);
  const allocatedAmount = useMemo(
    () =>
      preview?.allocations.reduce(
        (total, allocation) => total + Number(allocation.amount),
        0,
      ) ?? 0,
    [preview],
  );

  function updateForm(patch: Partial<ReceiptIntent>) {
    setForm((current) => ({ ...current, ...patch }));
    setPreview(null);
    setError(null);
    setFieldErrors({});
    setIdempotencyKey(makeIdempotencyKey());
  }

  async function previewReceipt(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true);
    setError(null);
    setFieldErrors({});
    try {
      const nextPreview = await apiFetch<ReceiptPreview>(
        `/tenancies/${tenancyId}/receipts/preview`,
        {
          method: "POST",
          body: JSON.stringify(normalizedIntent(form)),
        },
      );
      setPreview(nextPreview);
      setIdempotencyKey(makeIdempotencyKey());
    } catch (requestError) {
      collectFieldErrors(requestError, setFieldErrors);
      setError(
        messageFor(
          requestError,
          "Không thể tính cách phân bổ. Vui lòng thử lại.",
        ),
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  async function confirmReceipt() {
    if (!preview) return;
    setIsSubmitting(true);
    setError(null);
    try {
      const result = await apiFetch<ReceiptResult>(
        `/tenancies/${tenancyId}/receipts`,
        {
          method: "POST",
          headers: { "Idempotency-Key": idempotencyKey },
          body: JSON.stringify({
            ...normalizedIntent(form),
            previewToken: preview.previewToken,
          }),
        },
      );
      onCollected(
        `Đã thu ${formatMoney(result.receipt.amount)}, trừ ${formatMoney(
          result.allocations.reduce(
            (total, allocation) => total + Number(allocation.amount),
            0,
          ),
        )} công nợ. Số dư trả trước còn ${formatMoney(
          result.creditBalanceAfter,
        )}.`,
      );
      setForm(emptyReceiptIntent());
      setPreview(null);
      setIdempotencyKey(makeIdempotencyKey());
    } catch (requestError) {
      if (
        requestError instanceof ApiError &&
        requestError.code === "ALLOCATION_PREVIEW_STALE"
      ) {
        setPreview(null);
      }
      setError(
        messageFor(
          requestError,
          "Không thể ghi nhận lần thu. Vui lòng thử lại.",
        ),
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form
      className="receipt-form"
      onSubmit={(event) => void previewReceipt(event)}
    >
      {error ? (
        <div className="notice error" role="alert">
          {error}
        </div>
      ) : null}
      <div className="form-grid">
        <label className="field">
          Số tiền
          <input
            aria-label="Số tiền"
            autoFocus
            inputMode="numeric"
            min="1"
            name="amount"
            onChange={(event) =>
              updateForm({ amount: normalizeMoneyInput(event.target.value) })
            }
            required
            value={form.amount}
          />
          <small className="field-hint">{formatMoney(form.amount)}</small>
          <FieldError message={fieldErrors.amount} />
        </label>
        <label className="field">
          Ngày giờ thu
          <input
            aria-label="Ngày giờ thu"
            max={localDateTimeValue()}
            min={`${room.currentOccupancy?.startedOn}T00:00`}
            name="receivedAt"
            onChange={(event) => updateForm({ receivedAt: event.target.value })}
            required
            type="datetime-local"
            value={form.receivedAt}
          />
          <FieldError message={fieldErrors.receivedAt} />
        </label>
        <label className="field">
          Hình thức
          <select
            aria-label="Hình thức"
            name="method"
            onChange={(event) =>
              updateForm({
                method: event.target.value as ReceiptIntent["method"],
              })
            }
            value={form.method}
          >
            <option value="CASH">Tiền mặt</option>
            <option value="BANK_TRANSFER">Chuyển khoản</option>
            <option value="OTHER">Khác</option>
          </select>
        </label>
        <label className="field">
          Người nộp (không bắt buộc)
          <select
            aria-label="Người nộp (không bắt buộc)"
            name="payerTenantId"
            onChange={(event) =>
              updateForm({ payerTenantId: event.target.value || undefined })
            }
            value={form.payerTenantId ?? ""}
          >
            <option value="">Không ghi nhận</option>
            {room.currentOccupancy?.occupants
              .filter(
                (occupant) => occupant.joinedOn <= form.receivedAt.slice(0, 10),
              )
              .map((occupant) => (
                <option key={occupant.tenantId} value={occupant.tenantId}>
                  {occupant.fullName}
                </option>
              ))}
          </select>
        </label>
      </div>
      <label className="field">
        Ghi chú
        <textarea
          aria-label="Ghi chú"
          maxLength={500}
          name="notes"
          onChange={(event) => updateForm({ notes: event.target.value })}
          value={form.notes ?? ""}
        />
      </label>
      {preview ? (
        <section className="receipt-preview" aria-label="Phân bổ tạm tính">
          <div className="section-heading compact">
            <div>
              <h3>Phân bổ theo công nợ cũ nhất</h3>
              <p>Hiệu lực đến {formatDateTime(preview.expiresAt)}</p>
            </div>
          </div>
          {preview.allocations.length ? (
            <div className="receipt-allocation-list">
              {preview.allocations.map((allocation) => (
                <div
                  className="receipt-allocation-row"
                  key={allocation.invoiceId}
                >
                  <span>
                    <strong>{allocation.invoiceNumber}</strong>
                    <small>
                      {formatDate(allocation.billingPeriodStart)} -{" "}
                      {formatDate(allocation.billingPeriodEnd)}
                    </small>
                  </span>
                  <strong>{formatMoney(allocation.amount)}</strong>
                </div>
              ))}
            </div>
          ) : (
            <p className="receipt-empty-note">
              Phòng không có công nợ cần trừ.
            </p>
          )}
          <div className="receipt-preview-totals">
            <Fact label="Trừ công nợ" value={formatMoney(allocatedAmount)} />
            <Fact
              label="Thành trả trước"
              value={formatMoney(preview.creditCreated)}
            />
            <Fact
              label="Số dư sau lần thu"
              value={formatMoney(preview.creditBalanceAfter)}
            />
          </div>
        </section>
      ) : null}
      <div className="form-actions modal-actions">
        {preview ? (
          <Button
            disabled={isSubmitting}
            onClick={() => void confirmReceipt()}
            type="button"
          >
            {isSubmitting ? "Đang ghi nhận" : "Xác nhận thu tiền"}
          </Button>
        ) : (
          <Button disabled={isSubmitting || !form.amount} type="submit">
            {isSubmitting ? "Đang tính" : "Xem phân bổ"}
          </Button>
        )}
      </div>
    </form>
  );
}

function ReceiptHistory({
  onCollected,
  tenancyId,
}: {
  onCollected: (message: string) => void;
  tenancyId: string;
}) {
  const [history, setHistory] = useState<Receipt[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedDetail, setSelectedDetail] = useState<ReceiptDetail | null>(
    null,
  );
  const [detailError, setDetailError] = useState<string | null>(null);
  const [voidTarget, setVoidTarget] = useState<ReceiptDetail | null>(null);
  const [voidReason, setVoidReason] = useState("");
  const [voidReasonError, setVoidReasonError] = useState<string | null>(null);
  const [voidError, setVoidError] = useState<string | null>(null);
  const [isVoiding, setIsVoiding] = useState(false);
  const [voidIdempotencyKey, setVoidIdempotencyKey] =
    useState(makeIdempotencyKey);

  async function loadHistory(cursor?: string) {
    setIsLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ limit: "20" });
      if (cursor) params.set("cursor", cursor);
      const response = await apiFetch<ReceiptHistoryResponse>(
        `/tenancies/${tenancyId}/receipts?${params.toString()}`,
      );
      setHistory((current) =>
        cursor ? [...current, ...response.data] : response.data,
      );
      setNextCursor(response.page.nextCursor);
      setHasMore(response.page.hasMore);
    } catch (requestError) {
      setError(messageFor(requestError, "Không thể tải lịch sử thu."));
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    void loadHistory();
  }, [tenancyId]);

  async function showDetail(receiptId: string) {
    setDetailError(null);
    try {
      setSelectedDetail(
        await apiFetch<ReceiptDetail>(`/receipts/${receiptId}`),
      );
    } catch (requestError) {
      setDetailError(
        messageFor(requestError, "Không thể tải chi tiết lần thu."),
      );
    }
  }

  function startVoid(detail: ReceiptDetail) {
    setVoidTarget(detail);
    setVoidReason("");
    setVoidReasonError(null);
    setVoidError(null);
    setVoidIdempotencyKey(makeIdempotencyKey());
  }

  async function submitVoid(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!voidTarget) return;
    const reason = voidReason.trim();
    if (reason.length < 3) {
      setVoidReasonError("Nhập lý do ít nhất 3 ký tự.");
      return;
    }

    setIsVoiding(true);
    setVoidReasonError(null);
    setVoidError(null);
    const receiptId = voidTarget.receipt.id;
    try {
      const result = await apiFetch<VoidReceiptResponse>(
        `/receipts/${receiptId}/void`,
        {
          method: "POST",
          headers: { "Idempotency-Key": voidIdempotencyKey },
          body: JSON.stringify({ reason }),
        },
      );
      setSelectedDetail(result);
      setVoidTarget(null);
      setVoidReason("");
      onCollected(
        `Đã hủy lần thu ${result.receipt.receiptNumber}. Công nợ và số dư đã được tính lại.`,
      );
      await loadHistory();
      await showDetail(receiptId);
    } catch (requestError) {
      setVoidError(
        messageFor(requestError, "Không thể hủy lần thu. Vui lòng thử lại."),
      );
    } finally {
      setIsVoiding(false);
    }
  }

  if (isLoading && history.length === 0) {
    return (
      <div className="receipt-history" aria-label="Đang tải lịch sử thu">
        <div className="skeleton-row" />
        <div className="skeleton-row" />
      </div>
    );
  }

  if (voidTarget) {
    return (
      <form
        className="receipt-void-form"
        onSubmit={(event) => void submitVoid(event)}
      >
        <div className="notice warning">
          <span>
            <strong>
              Hủy lần thu {voidTarget.receipt.receiptNumber} -{" "}
              {formatMoney(voidTarget.receipt.amount)}?
            </strong>
            <br />
            Công nợ, số dư trả trước và trạng thái hóa đơn liên quan sẽ được
            tính lại. Lịch sử lần thu vẫn được giữ để đối soát.
          </span>
        </div>
        <label className="field">
          Lý do hủy
          <textarea
            aria-describedby={
              voidReasonError ? "receipt-void-reason-error" : undefined
            }
            aria-label="Lý do hủy"
            autoFocus
            disabled={isVoiding}
            maxLength={500}
            onChange={(event) => {
              setVoidReason(event.target.value);
              setVoidReasonError(null);
              setVoidIdempotencyKey(makeIdempotencyKey());
            }}
            required
            value={voidReason}
          />
          {voidReasonError ? (
            <small
              className="field-error"
              id="receipt-void-reason-error"
              role="alert"
            >
              {voidReasonError}
            </small>
          ) : null}
        </label>
        {voidError ? (
          <div className="notice error" role="alert">
            {voidError}
          </div>
        ) : null}
        <div className="form-actions modal-actions receipt-void-actions">
          <Button
            disabled={isVoiding}
            onClick={() => {
              setVoidTarget(null);
              setVoidError(null);
            }}
            type="button"
            variant="secondary"
          >
            Quay lại
          </Button>
          <Button disabled={isVoiding} type="submit" variant="danger">
            {isVoiding ? "Đang hủy" : "Xác nhận hủy lần thu"}
          </Button>
        </div>
      </form>
    );
  }

  return (
    <div className="receipt-history">
      {error ? (
        <div className="notice error" role="alert">
          <span>{error}</span>
          <Button onClick={() => void loadHistory()} variant="secondary">
            Thử lại
          </Button>
        </div>
      ) : history.length === 0 ? (
        <div className="empty-state">
          <strong>Chưa có lần thu tiền</strong>
        </div>
      ) : (
        <div className="receipt-history-list">
          {history.map((receipt) => (
            <button
              className="receipt-history-row"
              data-active={selectedDetail?.receipt.id === receipt.id}
              key={receipt.id}
              onClick={() => void showDetail(receipt.id)}
              type="button"
            >
              <span>
                <strong>{receipt.receiptNumber}</strong>
                <small>{formatDateTime(receipt.receivedAt)}</small>
                <small>
                  {methodLabel(receipt.method)}
                  {receipt.payerTenantName
                    ? ` · ${receipt.payerTenantName}`
                    : ""}
                </small>
              </span>
              <span className="receipt-row-end">
                <strong>{formatMoney(receipt.amount)}</strong>
                <StatusBadge
                  tone={receipt.status === "VOIDED" ? "danger" : "success"}
                >
                  {receipt.status === "VOIDED" ? "Đã hủy" : "Đã thu"}
                </StatusBadge>
              </span>
            </button>
          ))}
        </div>
      )}
      {hasMore ? (
        <Button
          disabled={isLoading}
          onClick={() => void loadHistory(nextCursor ?? undefined)}
          variant="secondary"
        >
          {isLoading ? "Đang tải" : "Xem thêm"}
        </Button>
      ) : null}
      {detailError ? (
        <div className="notice error" role="alert">
          {detailError}
        </div>
      ) : null}
      {selectedDetail ? (
        <ReceiptDetailPanel
          detail={selectedDetail}
          onVoid={() => startVoid(selectedDetail)}
        />
      ) : null}
    </div>
  );
}

function ReceiptDetailPanel({
  detail,
  onVoid,
}: {
  detail: ReceiptDetail;
  onVoid: () => void;
}) {
  return (
    <section className="receipt-detail" aria-label="Chi tiết lần thu">
      <div className="section-heading compact">
        <div>
          <h3>Chi tiết {detail.receipt.receiptNumber}</h3>
          <p>Người ghi nhận: {detail.receipt.recordedByName ?? "-"}</p>
        </div>
      </div>
      <div className="receipt-allocation-list">
        {detail.allocations.map((allocation) => (
          <div
            className="receipt-allocation-row"
            key={allocation.id ?? allocation.invoiceId}
          >
            <span>
              <strong>{allocation.invoiceNumber}</strong>
              <small>
                {formatDate(allocation.billingPeriodStart)} -{" "}
                {formatDate(allocation.billingPeriodEnd)}
              </small>
            </span>
            <strong>{formatMoney(allocation.amount)}</strong>
          </div>
        ))}
        {Number(detail.creditCreated) > 0 ? (
          <div className="receipt-allocation-row">
            <span>
              <strong>Chuyển thành trả trước</strong>
              <small>Số dư còn lại của lần thuê</small>
            </span>
            <strong>{formatMoney(detail.creditCreated)}</strong>
          </div>
        ) : null}
      </div>
      {detail.reversal || detail.receipt.voidedAt ? (
        <div className="notice warning">
          <span>
            <strong>Lần thu đã được hủy</strong>
            <br />
            {detail.reversal?.reason ??
              detail.receipt.voidReason ??
              "Không có lý do"}
          </span>
        </div>
      ) : null}
      {detail.receipt.canVoid && detail.receipt.status === "CONFIRMED" ? (
        <div className="form-actions">
          <Button onClick={onVoid} type="button" variant="danger">
            Hủy lần thu
          </Button>
        </div>
      ) : null}
    </section>
  );
}

function emptyReceiptIntent(): ReceiptIntent {
  return {
    amount: "",
    method: "CASH",
    receivedAt: localDateTimeValue(),
    notes: "",
  };
}

function normalizedIntent(form: ReceiptIntent): ReceiptIntent {
  return {
    amount: form.amount,
    method: form.method,
    receivedAt: new Date(form.receivedAt).toISOString(),
    ...(form.payerTenantId ? { payerTenantId: form.payerTenantId } : {}),
    ...(form.notes?.trim() ? { notes: form.notes.trim() } : {}),
  };
}

function localDateTimeValue(date = new Date()) {
  const offset = date.getTimezoneOffset();
  return new Date(date.getTime() - offset * 60_000).toISOString().slice(0, 16);
}

function methodLabel(method: Receipt["method"]) {
  if (method === "CASH") return "Tiền mặt";
  if (method === "BANK_TRANSFER") return "Chuyển khoản";
  return "Khác";
}

function FieldError({ message }: { message?: string }) {
  return message ? <small className="field-error">{message}</small> : null;
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <span>
      <small>{label}</small>
      <strong>{value}</strong>
    </span>
  );
}

function collectFieldErrors(
  error: unknown,
  setter: (value: Record<string, string>) => void,
) {
  if (error instanceof ApiError && error.details?.length) {
    setter(
      Object.fromEntries(
        error.details.map((detail) => [detail.field, detail.message]),
      ),
    );
  }
}
