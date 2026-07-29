import { FormEvent, useEffect, useMemo, useState } from "react";
import { Button, StatusBadge } from "@repo/ui";
import { ApiError, apiFetch } from "../api";
import type { Room, RoomListResponse } from "../rooms/types";
import type {
  SettlementPreview,
  SettlementType,
  UtilityReading,
  UtilityReadingKind,
} from "./types";

const today = new Date();
const defaultYear = String(today.getFullYear());
const defaultMonth = String(today.getMonth() + 1);

const emptyForm = {
  roomId: "",
  settlementType: "MONTHLY" as SettlementType,
  billingYear: defaultYear,
  billingMonth: defaultMonth,
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
  const [reading, setReading] = useState<UtilityReading | null>(null);
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

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!occupancy) return;
    setIsSaving(true);
    setError(null);
    setFieldErrors({});
    setPreview(null);
    setReading(null);

    const period = periodFor(form, occupancy.startedOn);
    const readingKind: UtilityReadingKind =
      form.settlementType === "MOVE_OUT" ? "MOVE_OUT" : "MONTHLY";

    try {
      const createdReading = await apiFetch<UtilityReading>(
        "/utility-readings",
        {
          method: "POST",
          body: JSON.stringify({
            roomId: form.roomId,
            tenancyId: occupancy.tenancyId,
            readingKind,
            billingPeriodStart: period.start,
            billingPeriodEnd: period.end,
            billingYear: Number(form.billingYear),
            billingMonth: Number(form.billingMonth),
            electricityPrevious: form.electricityPrevious,
            electricityCurrent: form.electricityCurrent,
            waterPrevious: form.waterPrevious,
            waterCurrent: form.waterCurrent,
            notes: form.notes || null,
          }),
        },
      );
      const finalizedReading = await apiFetch<UtilityReading>(
        `/utility-readings/${createdReading.id}/finalize`,
        { method: "POST" },
      );
      setReading(finalizedReading);

      const settlementPreview = await apiFetch<SettlementPreview>(
        "/settlements/preview",
        {
          method: "POST",
          body: JSON.stringify({
            tenancyId: occupancy.tenancyId,
            settlementType: form.settlementType,
            billingYear: Number(form.billingYear),
            billingMonth: Number(form.billingMonth),
            periodEnd: period.end,
            utilityReadingId: finalizedReading.id,
            prepaidAmount: form.prepaidAmount || "0",
            notes: form.notes || null,
          }),
        },
      );
      setPreview(settlementPreview);
    } catch (saveError) {
      if (saveError instanceof ApiError && saveError.details?.length) {
        setFieldErrors(
          Object.fromEntries(
            saveError.details.map((detail) => [detail.field, detail.message]),
          ),
        );
      }
      setError(messageFor(saveError));
    } finally {
      setIsSaving(false);
    }
  }

  async function finalizeSettlement() {
    if (!preview || !reading) return;
    setIsSaving(true);
    setError(null);
    try {
      await apiFetch<SettlementPreview>("/settlements", {
        method: "POST",
        body: JSON.stringify({
          tenancyId: preview.tenancyId,
          settlementType: preview.settlementType,
          billingYear: preview.billingYear,
          billingMonth: preview.billingMonth,
          periodEnd: preview.periodEnd,
          utilityReadingId: reading.id,
          prepaidAmount: form.prepaidAmount || "0",
          notes: form.notes || null,
        }),
      });
      setPreview(null);
      setReading(null);
      await load();
    } catch (saveError) {
      setError(messageFor(saveError));
    } finally {
      setIsSaving(false);
    }
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
                key={item.id ?? item.periodEnd}
              >
                <span>
                  <strong>
                    {item.representativeTenantName ?? "Nguoi dai dien"}
                  </strong>
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
                  setForm({ ...form, roomId: event.target.value })
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
                  })
                }
                value={form.settlementType}
              >
                <option value="MONTHLY">Cuoi thang</option>
                <option value="MOVE_OUT">Tra phong giua thang</option>
              </select>
            </label>
            <label className="field">
              Nam
              <input
                inputMode="numeric"
                onChange={(event) =>
                  setForm({ ...form, billingYear: event.target.value })
                }
                value={form.billingYear}
              />
            </label>
            <label className="field">
              Thang
              <input
                inputMode="numeric"
                onChange={(event) =>
                  setForm({ ...form, billingMonth: event.target.value })
                }
                value={form.billingMonth}
              />
            </label>
            <label className="field">
              Ngay tra phong
              <input
                disabled={form.settlementType === "MONTHLY"}
                onChange={(event) =>
                  setForm({ ...form, periodEnd: event.target.value })
                }
                type="date"
                value={form.periodEnd}
              />
            </label>
            <label className="field">
              Da tra truoc
              <input
                inputMode="numeric"
                onChange={(event) =>
                  setForm({ ...form, prepaidAmount: event.target.value })
                }
                value={form.prepaidAmount}
              />
            </label>
            <label className="field">
              Dien cu
              <input
                inputMode="decimal"
                onChange={(event) =>
                  setForm({ ...form, electricityPrevious: event.target.value })
                }
                value={form.electricityPrevious}
              />
              <FieldError message={fieldErrors.electricityPrevious} />
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
              <FieldError message={fieldErrors.electricityCurrent} />
            </label>
            <label className="field">
              Nuoc cu
              <input
                inputMode="decimal"
                onChange={(event) =>
                  setForm({ ...form, waterPrevious: event.target.value })
                }
                value={form.waterPrevious}
              />
              <FieldError message={fieldErrors.waterPrevious} />
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
              <FieldError message={fieldErrors.waterCurrent} />
            </label>
          </div>
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
            <Button type="submit" disabled={isSaving || !occupancy}>
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
                label="Da tru tien phong"
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

function periodFor(
  form: typeof emptyForm,
  startedOn: string,
): { start: string; end: string } {
  const year = Number(form.billingYear);
  const month = Number(form.billingMonth);
  const monthStart = `${year}-${String(month).padStart(2, "0")}-01`;
  const monthEnd = `${year}-${String(month).padStart(2, "0")}-${String(
    new Date(Date.UTC(year, month, 0)).getUTCDate(),
  ).padStart(2, "0")}`;
  const start = startedOn > monthStart ? startedOn : monthStart;
  const end =
    form.settlementType === "MOVE_OUT" && form.periodEnd
      ? form.periodEnd
      : monthEnd;
  return { start, end };
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
