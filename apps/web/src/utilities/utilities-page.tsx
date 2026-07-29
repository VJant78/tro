import { FormEvent, useEffect, useMemo, useState } from "react";
import { Button, StatusBadge } from "@repo/ui";
import { ApiError, apiFetch } from "../api";
import type { Room, RoomListResponse } from "../rooms/types";
import type {
  SettlementPreview,
  SettlementType,
  UtilityReading,
} from "./types";

const todayDate = new Date().toISOString().slice(0, 10);

const emptyForm = {
  roomId: "",
  settlementType: "MONTHLY" as SettlementType,
  periodEnd: "",
  electricityPrevious: "0",
  electricityCurrent: "0",
  waterPrevious: "0",
  waterCurrent: "0",
  prepaidAmount: "0",
  notes: "",
};

export function UtilitiesPage() {
  const [rooms, setRooms] = useState<Room[]>([]);
  const [form, setForm] = useState(emptyForm);
  const [readings, setReadings] = useState<UtilityReading[]>([]);
  const [preview, setPreview] = useState<SettlementPreview | null>(null);
  const [settlements, setSettlements] = useState<SettlementPreview[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

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
      setForm((current) => ({
        ...current,
        roomId:
          current.roomId ||
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
    try {
      await apiFetch<SettlementPreview>("/settlements", {
        method: "POST",
        body: JSON.stringify(settlementPayload(preview.tenancyId, period)),
      });
      setPreview(null);
      await load();
    } catch (saveError) {
      collectFieldErrors(saveError, setFieldErrors);
      setError(messageFor(saveError));
    } finally {
      setIsSaving(false);
    }
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
      prepaidAmount: form.prepaidAmount || "0",
      notes: form.notes || null,
    };
  }

  return (
    <div className="utilities-layout">
      <section className="rooms-list" aria-labelledby="utilities-title">
        <div className="section-heading">
          <div>
            <h1 id="utilities-title">Dien nuoc</h1>
            <p>{activeRooms.length} phong dang co nguoi o</p>
          </div>
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
        ) : settlements.length === 0 ? (
          <div className="empty-state">
            <strong>Chua co ky chot</strong>
          </div>
        ) : (
          <div className="room-list-stack">
            {settlements.map((item) => (
              <article
                className="settlement-row"
                key={item.id ?? `${item.tenancyId}-${item.periodEnd}`}
              >
                <span>
                  <strong>Phong {roomCodeFor(item.roomId, rooms)}</strong>
                  <small>
                    Dai dien:{" "}
                    {item.representativeTenantName ?? "Nguoi dai dien"}
                  </small>
                  <small>
                    {formatDate(item.periodStart)} -{" "}
                    {formatDate(item.periodEnd)}
                  </small>
                  <small>Con thu: {formatMoney(item.outstandingAmount)}</small>
                </span>
                <StatusBadge tone="success">
                  {item.settlementType === "MOVE_OUT"
                    ? "Tra phong"
                    : "Cuoi thang"}
                </StatusBadge>
              </article>
            ))}
          </div>
        )}
      </section>

      <section className="room-detail" aria-labelledby="settlement-title">
        <div className="section-heading">
          <div>
            <h2 id="settlement-title">Chot tien</h2>
            <p>
              {occupancy
                ? `Dai dien: ${occupancy.representativeName}`
                : "Chon phong dang thue"}
            </p>
          </div>
        </div>

        <form className="room-form" onSubmit={(event) => void submit(event)}>
          <div className="form-grid">
            <label className="field">
              Phong
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
                <option value="">Chon phong</option>
                {activeRooms.map((room) => (
                  <option key={room.id} value={room.id}>
                    {room.code} - {room.currentOccupancy?.representativeName}
                  </option>
                ))}
              </select>
              <FieldError message={fieldErrors.roomId} />
            </label>
            <label className="field">
              Kieu chot
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
                <option value="MONTHLY">Cuoi thang</option>
                <option value="MOVE_OUT">Tra phong giua thang</option>
              </select>
            </label>
            <label className="field">
              Ky chot
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
              Ngay tra phong
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
            <label className="field field-wide">
              Da tra truoc
              <input
                inputMode="numeric"
                onChange={(event) =>
                  setForm({ ...form, prepaidAmount: event.target.value })
                }
                value={form.prepaidAmount}
              />
            </label>
          </div>
          <div className="meter-grid">
            <label className="field">
              Dien cu
              <input readOnly value={form.electricityPrevious} />
            </label>
            <label className="field">
              Dien moi
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
              Nuoc cu
              <input readOnly value={form.waterPrevious} />
            </label>
            <label className="field">
              Nuoc moi
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
          {selectedPeriodSettlement ? (
            <div className="notice warning">
              <strong>Ky nay da chot</strong>
            </div>
          ) : selectedPeriodReading ? (
            <div className="notice warning">
              <strong>Ky nay da co chi so, se dung lai de chot tien</strong>
            </div>
          ) : null}
          <label className="field">
            Ghi chu
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
              {isSaving ? "Dang tinh" : "Tinh tam"}
            </Button>
          </div>
        </form>

        {preview ? (
          <section className="settlement-preview" aria-label="Bang tinh tam">
            <div className="settlement-grid">
              <Fact
                label="So ngay o"
                value={`${preview.occupiedDays}/${preview.daysInMonth}`}
              />
              <Fact
                label="Tien phong"
                value={formatMoney(preview.proratedRentAmount)}
              />
              <Fact
                label="Tien dien"
                value={formatMoney(preview.electricityAmount)}
              />
              <Fact
                label="Tien nuoc"
                value={formatMoney(preview.waterAmount)}
              />
              <Fact
                label="Da tru tong tien"
                value={formatMoney(preview.prepaidAppliedAmount)}
              />
              <Fact
                label="Du chuyen ky sau"
                value={formatMoney(preview.carryForwardAmount)}
              />
              <Fact
                label="Tong ky nay"
                value={formatMoney(preview.totalAmount)}
              />
              <Fact
                label="Con thu"
                value={formatMoney(preview.outstandingAmount)}
              />
            </div>
            <div className="form-actions">
              <Button
                type="button"
                disabled={isSaving}
                onClick={() => void finalizeSettlement()}
              >
                Chot tien
              </Button>
            </div>
          </section>
        ) : null}
      </section>
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
  return rooms.find((room) => room.id === roomId)?.code ?? roomId.slice(0, 8);
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

function formatMoney(value: string | number) {
  return new Intl.NumberFormat("vi-VN").format(Number(value)) + " VND";
}

function formatDate(value: string) {
  if (!value) return "-";
  return new Intl.DateTimeFormat("vi-VN").format(new Date(`${value}T00:00:00`));
}

function messageFor(error: unknown) {
  if (error instanceof Error) return error.message;
  return "Co loi xay ra";
}
