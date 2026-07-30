import { FormEvent, useEffect, useMemo, useState } from "react";
import { Button, StatusBadge } from "@repo/ui";
import { ApiError, apiFetch, messageFor } from "../api";
import { Modal } from "../components/modal";
import {
  formatDate,
  formatMoney,
  localDateString,
  makeIdempotencyKey,
} from "../format";
import type { ReceiptHistoryResponse, ReceiptSummary } from "../receipts/types";
import type { Room, RoomListResponse } from "../rooms/types";
import type {
  SettlementPreview,
  SettlementType,
  UtilityReading,
  FinalizeSettlementResponse,
  OperationRecoveryResponse,
  RecoverableOperationStatus,
} from "./types";

const todayDate = localDateString();

const emptyForm = {
  roomId: "",
  settlementType: "MONTHLY" as SettlementType,
  periodEnd: "",
  electricityPrevious: "0",
  electricityCurrent: "0",
  waterPrevious: "0",
  waterCurrent: "0",
  notes: "",
};

type RecoveryAction = "resume" | "cancel";

interface RecoveryRequest {
  operationId: string;
  status: RecoverableOperationStatus;
}

interface RecoveryAttempt {
  operationId: string;
  action: RecoveryAction;
  idempotencyKey: string;
  reason?: string;
}

export function UtilitiesPage() {
  const [recoveryRequest, setRecoveryRequest] =
    useState<RecoveryRequest | null>(recoveryRequestFromLocation);
  const [recoveryAttempt, setRecoveryAttempt] =
    useState<RecoveryAttempt | null>(null);
  const [recoveryError, setRecoveryError] = useState<string | null>(null);
  const [isRecovering, setIsRecovering] = useState(false);
  const [isCancelModalOpen, setIsCancelModalOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState("");
  const [cancelReasonError, setCancelReasonError] = useState<string | null>(
    null,
  );
  const [rooms, setRooms] = useState<Room[]>([]);
  const [form, setForm] = useState(emptyForm);
  const [readings, setReadings] = useState<UtilityReading[]>([]);
  const [preview, setPreview] = useState<SettlementPreview | null>(null);
  const [settlements, setSettlements] = useState<SettlementPreview[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [idempotencyKey, setIdempotencyKey] = useState(makeIdempotencyKey);
  const [receiptSummary, setReceiptSummary] = useState<ReceiptSummary | null>(
    null,
  );
  const [receiptSummaryError, setReceiptSummaryError] = useState<string | null>(
    null,
  );

  const activeRooms = useMemo(
    () => rooms.filter((room) => room.currentOccupancy),
    [rooms],
  );
  const selectedRoom = useMemo(
    () => rooms.find((room) => room.id === form.roomId) ?? null,
    [form.roomId, rooms],
  );
  const occupancy = selectedRoom?.currentOccupancy ?? null;
  const period = useMemo(
    () =>
      occupancy
        ? periodFor({
            occupancyStartedOn: occupancy.startedOn,
            tenancyId: occupancy.tenancyId,
            settlementType: form.settlementType,
            requestedMoveOutDate: form.periodEnd,
            settlements,
          })
        : null,
    [form.periodEnd, form.settlementType, occupancy, settlements],
  );
  const selectedPeriodSettlement = useMemo(
    () =>
      period && occupancy
        ? (settlements.find(
            (item) =>
              item.tenancyId === occupancy.tenancyId &&
              item.periodStart === period.start &&
              item.periodEnd === period.end,
          ) ?? null)
        : null,
    [occupancy, period, settlements],
  );
  const selectedPeriodReading = useMemo(
    () =>
      period
        ? (readings.find(
            (reading) =>
              reading.billingPeriodStart === period.start &&
              reading.billingPeriodEnd === period.end &&
              reading.readingKind === form.settlementType,
          ) ?? null)
        : null,
    [form.settlementType, period, readings],
  );

  async function load() {
    setIsLoading(true);
    setError(null);
    try {
      const [roomResponse, settlementResponse] = await Promise.all([
        apiFetch<RoomListResponse>("/rooms?limit=100&sort=code:asc"),
        apiFetch<SettlementPreview[]>("/settlements"),
      ]);
      setRooms(roomResponse.data);
      setSettlements(settlementResponse);
      const requestedRoomId = new URLSearchParams(window.location.search).get(
        "roomId",
      );
      setForm((current) => ({
        ...current,
        roomId:
          (requestedRoomId &&
          roomResponse.data.some((room) => room.id === requestedRoomId)
            ? requestedRoomId
            : current.roomId) ||
          roomResponse.data.find((room) => room.currentOccupancy)?.id ||
          "",
      }));
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
    if (!form.roomId) {
      setReadings([]);
      return;
    }

    let isActive = true;
    async function loadReadings() {
      try {
        const params = new URLSearchParams({
          roomId: form.roomId,
          status: "FINALIZED",
        });
        const response = await apiFetch<UtilityReading[]>(
          `/utility-readings?${params.toString()}`,
        );
        if (isActive) setReadings(response);
      } catch (loadError) {
        if (isActive) setError(messageFor(loadError));
      }
    }

    void loadReadings();
    return () => {
      isActive = false;
    };
  }, [form.roomId]);

  useEffect(() => {
    if (!occupancy) {
      setReceiptSummary(null);
      setReceiptSummaryError(null);
      return;
    }
    let isActive = true;
    setReceiptSummary(null);
    setReceiptSummaryError(null);
    apiFetch<ReceiptHistoryResponse>(
      `/tenancies/${occupancy.tenancyId}/receipts?limit=1`,
    )
      .then((response) => {
        if (!isActive) return;
        const latestBalance = response.data[0]?.creditBalanceAfter ?? "0";
        setReceiptSummary(
          response.summary ?? {
            creditBalance: latestBalance,
            receiptCount: response.data.length,
          },
        );
      })
      .catch((loadError) => {
        if (!isActive) return;
        setReceiptSummary(null);
        setReceiptSummaryError(
          messageFor(loadError, "Không tải được số dư đã thu."),
        );
      });
    return () => {
      isActive = false;
    };
  }, [occupancy?.tenancyId]);

  useEffect(() => {
    if (!period) return;
    const previousReading = readings
      .filter((reading) => reading.billingPeriodEnd < period.start)
      .sort((left, right) =>
        right.billingPeriodEnd.localeCompare(left.billingPeriodEnd),
      )[0];
    const electricityPrevious = previousReading?.electricityCurrent ?? "0";
    const waterPrevious = previousReading?.waterCurrent ?? "0";
    setForm((current) => ({
      ...current,
      electricityPrevious,
      waterPrevious,
      electricityCurrent:
        Number(current.electricityCurrent) < Number(electricityPrevious)
          ? electricityPrevious
          : current.electricityCurrent,
      waterCurrent:
        Number(current.waterCurrent) < Number(waterPrevious)
          ? waterPrevious
          : current.waterCurrent,
    }));
  }, [period, readings]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!occupancy || !period) return;
    setIsSaving(true);
    setError(null);
    setSuccess(null);
    setFieldErrors({});
    setPreview(null);

    try {
      const settlementPreview = await apiFetch<SettlementPreview>(
        "/settlements/preview",
        {
          method: "POST",
          body: JSON.stringify(settlementPayload(occupancy.tenancyId, period)),
        },
      );
      setPreview(settlementPreview);
      setIdempotencyKey(makeIdempotencyKey());
    } catch (saveError) {
      collectFieldErrors(saveError, setFieldErrors);
      setError(messageFor(saveError));
    } finally {
      setIsSaving(false);
    }
  }

  async function finalizeSettlement() {
    if (!preview || !period) return;
    setIsSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const response = await apiFetch<FinalizeSettlementResponse>(
        "/settlements/finalize-and-invoice",
        {
          method: "POST",
          body: JSON.stringify({
            ...settlementPayload(preview.tenancyId, period),
            idempotencyKey,
          }),
        },
      );
      if (response.operation.status === "INVOICE_PENDING") {
        setError(
          "Kỳ đã chốt nhưng hóa đơn chưa được tạo. Bấm thử lại để hoàn tất hóa đơn.",
        );
        return;
      }
      setSuccess(
        `Đã chốt phòng ${selectedRoom?.code ?? "đã chọn"} và tạo hóa đơn ${response.invoice?.invoiceNumber ?? "thành công"}.`,
      );
      setPreview(null);
      setIdempotencyKey(makeIdempotencyKey());
      await load();
    } catch (saveError) {
      collectFieldErrors(saveError, setFieldErrors);
      setError(messageFor(saveError));
    } finally {
      setIsSaving(false);
    }
  }

  function attemptFor(action: RecoveryAction, reason?: string) {
    if (
      recoveryRequest &&
      recoveryAttempt?.operationId === recoveryRequest.operationId &&
      recoveryAttempt.action === action &&
      recoveryAttempt.reason === reason
    ) {
      return recoveryAttempt;
    }

    const attempt = {
      operationId: recoveryRequest?.operationId ?? "",
      action,
      idempotencyKey: makeIdempotencyKey(),
      reason,
    } satisfies RecoveryAttempt;
    setRecoveryAttempt(attempt);
    return attempt;
  }

  async function recoverOperation(action: RecoveryAction, reason?: string) {
    if (!recoveryRequest) return;
    const attempt = attemptFor(action, reason);
    setIsRecovering(true);
    setRecoveryError(null);
    setSuccess(null);

    try {
      const response = await apiFetch<OperationRecoveryResponse>(
        `/tenancy-operations/${recoveryRequest.operationId}/${action}`,
        {
          method: "POST",
          headers: { "Idempotency-Key": attempt.idempotencyKey },
          body: JSON.stringify({
            idempotencyKey: attempt.idempotencyKey,
            ...(action === "cancel" ? { reason } : {}),
          }),
        },
      );
      const status = response.operation?.status ?? response.status;
      if (status !== "COMPLETED" && status !== "CANCELLED") {
        setRecoveryError(
          "Thao tác chưa hoàn tất. Vui lòng kiểm tra lại rồi thử lần nữa.",
        );
        return;
      }

      clearRecoveryQuery();
      setRecoveryRequest(null);
      setRecoveryAttempt(null);
      setIsCancelModalOpen(false);
      setCancelReason("");
      setSuccess(
        status === "CANCELLED"
          ? "Đã hủy thao tác và giải phóng trạng thái đang chờ."
          : "Đã hoàn tất thao tác và cập nhật dữ liệu liên quan.",
      );
      await load();
    } catch (recoveryFailure) {
      setRecoveryError(messageFor(recoveryFailure));
    } finally {
      setIsRecovering(false);
    }
  }

  function submitCancellation(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const reason = cancelReason.trim();
    if (reason.length < 3) {
      setCancelReasonError("Nhập lý do ít nhất 3 ký tự.");
      return;
    }
    setCancelReasonError(null);
    void recoverOperation("cancel", reason);
  }

  function settlementPayload(tenancyId: string, targetPeriod: BillingPeriod) {
    return {
      tenancyId,
      settlementType: form.settlementType,
      billingYear: targetPeriod.billingYear,
      billingMonth: targetPeriod.billingMonth,
      periodEnd: targetPeriod.end,
      utilityReadingId: selectedPeriodReading?.id,
      utilityReading: selectedPeriodReading
        ? undefined
        : {
            electricityPrevious: form.electricityPrevious,
            electricityCurrent: form.electricityCurrent,
            waterPrevious: form.waterPrevious,
            waterCurrent: form.waterCurrent,
          },
      prepaidAmount: "0",
      notes: form.notes || null,
    };
  }

  return (
    <div className="utilities-layout">
      <section className="rooms-list" aria-label="Các kỳ tiền đã chốt">
        <div className="section-heading">
          <div>
            <h1 id="utilities-title">Chốt tiền</h1>
            <p>{activeRooms.length} phòng đang có người ở</p>
          </div>
        </div>

        {recoveryRequest ? (
          <div className="notice warning" role="alert">
            <span>
              <strong>
                {recoveryRequest.status === "INVOICE_PENDING"
                  ? "Hóa đơn chưa được tạo"
                  : "Thao tác cần được kiểm tra"}
              </strong>
              <br />
              {recoveryRequest.status === "INVOICE_PENDING"
                ? "Kỳ tiền đã chốt. Hãy thử hoàn tất để tạo hóa đơn còn thiếu."
                : "Dữ liệu đang ở trạng thái chờ xử lý. Bạn có thể thử hoàn tất hoặc hủy thao tác."}
            </span>
            <div className="role-actions">
              <Button
                disabled={isRecovering}
                onClick={() => void recoverOperation("resume")}
                type="button"
              >
                {isRecovering ? "Đang xử lý" : "Thử hoàn tất"}
              </Button>
              {recoveryRequest.status === "ACTION_REQUIRED" ? (
                <Button
                  disabled={isRecovering}
                  onClick={() => {
                    setRecoveryError(null);
                    setCancelReasonError(null);
                    setIsCancelModalOpen(true);
                  }}
                  type="button"
                  variant="danger"
                >
                  Hủy thao tác
                </Button>
              ) : null}
            </div>
          </div>
        ) : null}
        {recoveryError ? (
          <div className="notice error" role="alert">
            {recoveryError}
          </div>
        ) : null}

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
        ) : settlements.length === 0 ? (
          <div className="empty-state">
            <strong>Chưa có kỳ đã chốt</strong>
          </div>
        ) : (
          <div className="room-list-stack">
            {settlements.map((item) => (
              <button
                className="settlement-row"
                key={item.id ?? `${item.tenancyId}-${item.periodEnd}`}
                onClick={() => {
                  setForm((current) => ({
                    ...current,
                    roomId: item.roomId,
                    settlementType: item.settlementType,
                    periodEnd:
                      item.settlementType === "MOVE_OUT" ? item.periodEnd : "",
                  }));
                  setPreview(null);
                }}
                type="button"
              >
                <span>
                  <strong>Phòng {roomCodeFor(item.roomId, rooms)}</strong>
                  <small>
                    Đại diện: {item.representativeTenantName ?? "Chưa xác định"}
                  </small>
                  <small>
                    {formatDate(item.periodStart)} -{" "}
                    {formatDate(item.periodEnd)}
                  </small>
                  <small>Còn thu: {formatMoney(item.outstandingAmount)}</small>
                </span>
                <StatusBadge tone="success">
                  {item.settlementType === "MOVE_OUT"
                    ? "Trả phòng"
                    : "Cuối tháng"}
                </StatusBadge>
              </button>
            ))}
          </div>
        )}
      </section>

      <section className="room-detail" aria-labelledby="settlement-title">
        <div className="section-heading">
          <div>
            <h2 id="settlement-title">Chốt tiền</h2>
            <p>
              {occupancy
                ? `Đại diện: ${occupancy.representativeName}`
                : "Chọn phòng đang thuê"}
            </p>
          </div>
        </div>

        <form className="room-form" onSubmit={(event) => void submit(event)}>
          <div className="form-grid">
            <label className="field">
              Phòng
              <select
                onChange={(event) =>
                  setForm({
                    ...form,
                    roomId: event.target.value,
                    electricityPrevious: "0",
                    electricityCurrent: "0",
                    waterPrevious: "0",
                    waterCurrent: "0",
                  })
                }
                value={form.roomId}
              >
                <option value="">Chọn phòng</option>
                {activeRooms.map((room) => (
                  <option key={room.id} value={room.id}>
                    {room.name}
                  </option>
                ))}
              </select>
              <FieldError message={fieldErrors.roomId} />
            </label>
            <label className="field">
              Kiểu chốt
              <select
                onChange={(event) =>
                  setForm({
                    ...form,
                    settlementType: event.target.value as SettlementType,
                    periodEnd: "",
                  })
                }
                value={form.settlementType}
              >
                <option value="MONTHLY">Cuối tháng</option>
                <option value="MOVE_OUT">Trả phòng giữa tháng</option>
              </select>
            </label>
            <label className="field">
              Kỳ chốt
              <input
                readOnly
                value={
                  period
                    ? `${formatDate(period.start)} - ${formatDate(period.end)}`
                    : ""
                }
              />
            </label>
            <label className="field">
              Ngày trả phòng
              <input
                disabled={form.settlementType === "MONTHLY"}
                min={period?.start}
                onChange={(event) =>
                  setForm({ ...form, periodEnd: event.target.value })
                }
                type="date"
                value={
                  form.settlementType === "MOVE_OUT" && period ? period.end : ""
                }
              />
            </label>
          </div>
          <div className="meter-grid">
            <label className="field">
              Điện cũ (kWh)
              <input readOnly value={form.electricityPrevious} />
            </label>
            <label className="field">
              Điện mới (kWh)
              <input
                inputMode="decimal"
                onChange={(event) =>
                  setForm({ ...form, electricityCurrent: event.target.value })
                }
                value={form.electricityCurrent}
              />
              <FieldError
                message={fieldErrors["utilityReading.electricityCurrent"]}
              />
            </label>
            <label className="field">
              Nước cũ (m³)
              <input readOnly value={form.waterPrevious} />
            </label>
            <label className="field">
              Nước mới (m³)
              <input
                inputMode="decimal"
                onChange={(event) =>
                  setForm({ ...form, waterCurrent: event.target.value })
                }
                value={form.waterCurrent}
              />
              <FieldError
                message={fieldErrors["utilityReading.waterCurrent"]}
              />
            </label>
          </div>
          <div className="credit-balance-panel" aria-label="Số dư đã thu">
            <span>
              <small>Đã thu trước</small>
              <strong>
                {receiptSummary
                  ? formatMoney(receiptSummary.creditBalance)
                  : receiptSummaryError
                    ? "Không khả dụng"
                    : "Đang tải..."}
              </strong>
              <small>
                {receiptSummary ? `${receiptSummary.receiptCount} lần thu` : ""}
              </small>
            </span>
            {selectedRoom?.currentOccupancy ? (
              <a
                className="text-link"
                href={`/rooms?roomId=${encodeURIComponent(
                  selectedRoom.id,
                )}&receipts=history`}
              >
                Xem lịch sử thu
              </a>
            ) : null}
          </div>
          {receiptSummaryError ? (
            <small className="field-error" role="alert">
              {receiptSummaryError}
            </small>
          ) : null}
          {selectedPeriodSettlement ? (
            <div className="notice warning">
              <strong>Kỳ này đã chốt</strong>
            </div>
          ) : selectedPeriodReading ? (
            <div className="notice warning">
              <strong>
                Kỳ này đã có chỉ số, hệ thống sẽ dùng lại để chốt tiền
              </strong>
            </div>
          ) : null}
          <label className="field">
            Ghi chú
            <textarea
              onChange={(event) =>
                setForm({ ...form, notes: event.target.value })
              }
              value={form.notes}
            />
          </label>
          <div className="form-actions">
            <Button
              type="submit"
              disabled={
                isSaving || !occupancy || Boolean(selectedPeriodSettlement)
              }
            >
              {isSaving ? "Đang tính" : "Xem tạm tính"}
            </Button>
          </div>
        </form>

        {preview ? (
          <section className="settlement-preview" aria-label="Bảng tính tạm">
            <h3>
              Tạm tính kỳ {preview.billingMonth}/{preview.billingYear}
            </h3>
            <div className="settlement-grid">
              <Fact
                label="Số ngày ở"
                value={`${preview.occupiedDays}/${preview.daysInMonth}`}
              />
              <Fact
                label={`Tiền phòng tháng ${preview.billingMonth}/${preview.billingYear}`}
                value={formatMoney(preview.proratedRentAmount)}
              />
              <Fact
                label="Tiền điện"
                value={formatMoney(preview.electricityAmount)}
              />
              <Fact
                label="Tiền nước"
                value={formatMoney(preview.waterAmount)}
              />
              <Fact
                label="Đã thu trước"
                value={formatMoney(preview.prepaidAppliedAmount)}
              />
              <Fact
                label="Dư chuyển kỳ sau"
                value={formatMoney(preview.carryForwardAmount)}
              />
              <Fact
                label="Tổng trước khấu trừ"
                value={formatMoney(preview.totalAmount)}
              />
              <Fact
                label="Còn phải thu"
                value={formatMoney(preview.outstandingAmount)}
              />
            </div>
            <div className="form-actions">
              <Button
                type="button"
                disabled={isSaving}
                onClick={() => {
                  const confirmed = window.confirm(
                    `Chốt phòng ${selectedRoom?.code ?? "đã chọn"} kỳ ${formatDate(period?.start)} - ${formatDate(period?.end)} và tạo hóa đơn ${formatMoney(preview.outstandingAmount)}?`,
                  );
                  if (confirmed) void finalizeSettlement();
                }}
              >
                {isSaving ? "Đang chốt" : "Chốt và tạo hóa đơn"}
              </Button>
            </div>
          </section>
        ) : null}
      </section>

      {isCancelModalOpen && recoveryRequest ? (
        <Modal
          onClose={() => {
            if (!isRecovering) setIsCancelModalOpen(false);
          }}
          title="Hủy thao tác đang chờ"
        >
          <form className="room-form" onSubmit={submitCancellation}>
            <p className="modal-context">
              Chỉ hủy khi đã kiểm tra và không thể tiếp tục thao tác này. Dữ
              liệu đã chốt trước đó không bị tự động xóa.
            </p>
            <label className="field">
              Lý do hủy
              <textarea
                autoFocus
                disabled={isRecovering}
                maxLength={500}
                onChange={(event) => {
                  setCancelReason(event.target.value);
                  setCancelReasonError(null);
                }}
                placeholder="Ví dụ: Chọn nhầm phòng đích"
                value={cancelReason}
              />
              <FieldError message={cancelReasonError ?? undefined} />
            </label>
            {recoveryError ? (
              <div className="notice error" role="alert">
                {recoveryError}
              </div>
            ) : null}
            <div className="form-actions modal-actions">
              <Button
                disabled={isRecovering}
                onClick={() => setIsCancelModalOpen(false)}
                type="button"
                variant="secondary"
              >
                Quay lại
              </Button>
              <Button disabled={isRecovering} type="submit" variant="danger">
                {isRecovering ? "Đang hủy" : "Xác nhận hủy"}
              </Button>
            </div>
          </form>
        </Modal>
      ) : null}
    </div>
  );
}

interface BillingPeriod {
  start: string;
  end: string;
  billingYear: number;
  billingMonth: number;
}

function periodFor(input: {
  occupancyStartedOn: string;
  tenancyId: string;
  settlementType: SettlementType;
  requestedMoveOutDate: string;
  settlements: SettlementPreview[];
}): BillingPeriod {
  const lastSettlement = input.settlements
    .filter((settlement) => settlement.tenancyId === input.tenancyId)
    .sort((left, right) => right.periodEnd.localeCompare(left.periodEnd))[0];
  const nextStart = lastSettlement
    ? addDays(lastSettlement.periodEnd, 1)
    : input.occupancyStartedOn;
  const defaultEnd =
    input.settlementType === "MOVE_OUT"
      ? maxDateString(todayDate, nextStart)
      : monthEndFor(nextStart);
  const end =
    input.settlementType === "MOVE_OUT" && input.requestedMoveOutDate
      ? maxDateString(input.requestedMoveOutDate, nextStart)
      : defaultEnd;
  const { year, month } = yearMonthFor(end);

  return {
    start: nextStart,
    end,
    billingYear: year,
    billingMonth: month,
  };
}

function FieldError({ message }: { message?: string }) {
  return message ? <small className="field-error">{message}</small> : null;
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <article className="pricing-cell">
      <small>{label}</small>
      <strong>{value}</strong>
    </article>
  );
}

function addDays(value: string, days: number) {
  const date = new Date(`${value}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function monthEndFor(value: string) {
  const { year, month } = yearMonthFor(value);
  return `${year}-${String(month).padStart(2, "0")}-${String(
    new Date(Date.UTC(year, month, 0)).getUTCDate(),
  ).padStart(2, "0")}`;
}

function yearMonthFor(value: string) {
  const [yearText, monthText] = value.split("-");
  return {
    year: Number(yearText ?? "0"),
    month: Number(monthText ?? "0"),
  };
}

function maxDateString(left: string, right: string) {
  return left >= right ? left : right;
}

function roomCodeFor(roomId: string, rooms: Room[]) {
  return rooms.find((room) => room.id === roomId)?.code ?? "-";
}

function recoveryRequestFromLocation(): RecoveryRequest | null {
  const params = new URLSearchParams(window.location.search);
  const operationId = params.get("operationId")?.trim();
  const status = params.get("operationStatus");
  if (
    !operationId ||
    (status !== "INVOICE_PENDING" && status !== "ACTION_REQUIRED")
  ) {
    return null;
  }
  return { operationId, status };
}

function clearRecoveryQuery() {
  const url = new URL(window.location.href);
  url.searchParams.delete("operationId");
  url.searchParams.delete("operationStatus");
  window.history.replaceState(
    {},
    "",
    `${url.pathname}${url.search}${url.hash}`,
  );
}

function collectFieldErrors(
  error: unknown,
  setter: (errors: Record<string, string>) => void,
) {
  if (error instanceof ApiError && error.details?.length) {
    setter(
      Object.fromEntries(
        error.details.map((detail) => [detail.field, detail.message]),
      ),
    );
  }
}
