import { FormEvent, useEffect, useMemo, useState } from "react";
import { Button, StatusBadge } from "@repo/ui";
import { ApiError, apiFetch } from "../api";
import type { Room, RoomListResponse, RoomStatus } from "./types";

const statusLabels: Record<RoomStatus, string> = {
  VACANT: "Trong",
  OCCUPIED: "Dang thue",
  MAINTENANCE: "Bao tri",
  INACTIVE: "Ngung dung",
};

const statusTones: Record<
  RoomStatus,
  "neutral" | "success" | "warning" | "danger"
> = {
  VACANT: "neutral",
  OCCUPIED: "success",
  MAINTENANCE: "warning",
  INACTIVE: "danger",
};

const emptyForm = {
  code: "",
  name: "",
  defaultRentAmount: "0",
  depositAmount: "0",
  maxOccupants: "1",
  notes: "",
  status: "VACANT" as RoomStatus,
};

export function RoomsPage() {
  const [rooms, setRooms] = useState<Room[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<RoomStatus | "ALL">("ALL");
  const [mode, setMode] = useState<"create" | "edit">("create");
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const selectedRoom = useMemo(
    () => rooms.find((room) => room.id === selectedId) ?? null,
    [rooms, selectedId],
  );

  async function loadRooms() {
    setIsLoading(true);
    setError(null);

    const params = new URLSearchParams({ limit: "50", sort: "code:asc" });
    if (query.trim()) params.set("q", query.trim());
    if (status !== "ALL") params.set("filter[status]", status);

    try {
      const response = await apiFetch<RoomListResponse>(
        `/rooms?${params.toString()}`,
      );
      setRooms(response.data);
      setSelectedId((current) =>
        current && response.data.some((room) => room.id === current)
          ? current
          : (response.data[0]?.id ?? null),
      );
    } catch (loadError) {
      setError(messageFor(loadError));
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    void loadRooms();
  }, []);

  function selectRoom(room: Room) {
    setMode("edit");
    setSelectedId(room.id);
    setFieldErrors({});
    setForm({
      code: room.code,
      name: room.name,
      defaultRentAmount: room.defaultRentAmount,
      depositAmount: room.depositAmount,
      maxOccupants: String(room.maxOccupants),
      notes: room.notes ?? "",
      status: room.status,
    });
  }

  function startCreate() {
    setMode("create");
    setSelectedId(null);
    setFieldErrors({});
    setForm(emptyForm);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSaving(true);
    setError(null);
    setFieldErrors({});

    const payload = {
      code: form.code,
      name: form.name,
      defaultRentAmount: form.defaultRentAmount,
      depositAmount: form.depositAmount,
      maxOccupants: Number(form.maxOccupants),
      status: form.status,
      notes: form.notes || null,
    };

    try {
      const room =
        mode === "edit" && selectedId
          ? await apiFetch<Room>(`/rooms/${selectedId}`, {
              method: "PATCH",
              body: JSON.stringify(payload),
            })
          : await apiFetch<Room>("/rooms", {
              method: "POST",
              body: JSON.stringify(payload),
            });

      await loadRooms();
      selectRoom(room);
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

  async function retireSelected() {
    if (!selectedRoom) return;
    const confirmed = window.confirm(
      `Ngung su dung phong ${selectedRoom.code}?`,
    );
    if (!confirmed) return;

    setIsSaving(true);
    setError(null);

    try {
      await apiFetch<Room>(`/rooms/${selectedRoom.id}`, { method: "DELETE" });
      startCreate();
      await loadRooms();
    } catch (retireError) {
      setError(messageFor(retireError));
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="rooms-layout">
      <section className="rooms-list" aria-labelledby="rooms-title">
        <div className="section-heading">
          <div>
            <h1 id="rooms-title">Phong</h1>
            <p>{rooms.length} phong dang hien thi</p>
          </div>
          <Button type="button" onClick={startCreate}>
            Tao phong
          </Button>
        </div>

        <div className="toolbar">
          <input
            aria-label="Tim phong"
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Tim ma phong, ten phong"
            value={query}
          />
          <select
            aria-label="Loc trang thai"
            onChange={(event) =>
              setStatus(event.target.value as RoomStatus | "ALL")
            }
            value={status}
          >
            <option value="ALL">Tat ca</option>
            <option value="VACANT">Trong</option>
            <option value="OCCUPIED">Dang thue</option>
            <option value="MAINTENANCE">Bao tri</option>
            <option value="INACTIVE">Ngung dung</option>
          </select>
          <Button
            type="button"
            variant="secondary"
            onClick={() => void loadRooms()}
          >
            Loc
          </Button>
        </div>

        {error ? (
          <div className="notice error" role="alert">
            {error}
          </div>
        ) : null}

        {isLoading ? (
          <div className="room-list-stack" aria-label="Dang tai phong">
            <div className="skeleton-row" />
            <div className="skeleton-row" />
            <div className="skeleton-row" />
          </div>
        ) : rooms.length === 0 ? (
          <div className="empty-state">
            <strong>Chua co phong</strong>
            <Button type="button" onClick={startCreate}>
              Tao phong dau tien
            </Button>
          </div>
        ) : (
          <div className="room-list-stack">
            {rooms.map((room) => (
              <button
                className="room-row"
                data-active={room.id === selectedId}
                key={room.id}
                onClick={() => selectRoom(room)}
                type="button"
              >
                <span>
                  <strong>{room.code}</strong>
                  <small>{room.name}</small>
                  {room.currentOccupancy ? (
                    <small>
                      Dai dien: {room.currentOccupancy.representativeName}
                      {" - "}vao {formatDate(room.currentOccupancy.startedOn)}
                      {room.currentOccupancy.coTenantCount > 0
                        ? ` - +${room.currentOccupancy.coTenantCount} o chung`
                        : ""}
                    </small>
                  ) : (
                    <small>Chua co nguoi thue</small>
                  )}
                </span>
                <StatusBadge tone={statusTones[room.status]}>
                  {statusLabels[room.status]}
                </StatusBadge>
              </button>
            ))}
          </div>
        )}
      </section>

      <section className="room-detail" aria-labelledby="room-form-title">
        <div className="section-heading">
          <div>
            <h2 id="room-form-title">
              {mode === "edit" ? "Chi tiet phong" : "Tao phong"}
            </h2>
            <p>{selectedRoom ? selectedRoom.id : "Phong moi"}</p>
          </div>
          {mode === "edit" ? (
            <Button
              type="button"
              variant="danger"
              onClick={() => void retireSelected()}
            >
              Ngung dung
            </Button>
          ) : null}
        </div>

        <form className="room-form" onSubmit={(event) => void submit(event)}>
          {selectedRoom?.currentOccupancy ? (
            <section className="occupancy-panel" aria-label="Nguoi dang o">
              <div className="section-heading compact">
                <div>
                  <h3>Nguoi dang o</h3>
                  <p>
                    {selectedRoom.currentOccupancy.memberCount} nguoi, vao phong{" "}
                    {formatDate(selectedRoom.currentOccupancy.startedOn)}
                  </p>
                </div>
              </div>
              <div className="tenant-member-list">
                {selectedRoom.currentOccupancy.occupants.map((occupant) => (
                  <div className="member-row" key={occupant.tenantId}>
                    <span>
                      <strong>{occupant.fullName}</strong>
                      <small>{occupant.phone ?? "Chua co SĐT"}</small>
                    </span>
                    <StatusBadge
                      tone={
                        occupant.role === "REPRESENTATIVE"
                          ? "success"
                          : "neutral"
                      }
                    >
                      {occupant.role === "REPRESENTATIVE"
                        ? "Dai dien"
                        : "O chung"}
                    </StatusBadge>
                  </div>
                ))}
              </div>
            </section>
          ) : null}
          <label className="field">
            Ma phong
            <input
              name="code"
              onChange={(event) =>
                setForm({ ...form, code: event.target.value })
              }
              value={form.code}
            />
            <FieldError message={fieldErrors.code} />
          </label>
          <label className="field">
            Ten phong
            <input
              name="name"
              onChange={(event) =>
                setForm({ ...form, name: event.target.value })
              }
              value={form.name}
            />
            <FieldError message={fieldErrors.name} />
          </label>
          <div className="form-grid">
            <label className="field">
              Gia thue
              <input
                inputMode="numeric"
                name="defaultRentAmount"
                onChange={(event) =>
                  setForm({ ...form, defaultRentAmount: event.target.value })
                }
                value={form.defaultRentAmount}
              />
              <FieldError message={fieldErrors.defaultRentAmount} />
            </label>
            <label className="field">
              Dat coc
              <input
                inputMode="numeric"
                name="depositAmount"
                onChange={(event) =>
                  setForm({ ...form, depositAmount: event.target.value })
                }
                value={form.depositAmount}
              />
              <FieldError message={fieldErrors.depositAmount} />
            </label>
            <label className="field">
              So nguoi toi da
              <input
                inputMode="numeric"
                name="maxOccupants"
                onChange={(event) =>
                  setForm({ ...form, maxOccupants: event.target.value })
                }
                value={form.maxOccupants}
              />
              <FieldError message={fieldErrors.maxOccupants} />
            </label>
            <label className="field">
              Trang thai
              <select
                name="status"
                onChange={(event) =>
                  setForm({ ...form, status: event.target.value as RoomStatus })
                }
                value={form.status}
              >
                <option value="VACANT">Trong</option>
                <option value="OCCUPIED">Dang thue</option>
                <option value="MAINTENANCE">Bao tri</option>
                <option value="INACTIVE">Ngung dung</option>
              </select>
            </label>
          </div>
          <label className="field">
            Ghi chu
            <textarea
              name="notes"
              onChange={(event) =>
                setForm({ ...form, notes: event.target.value })
              }
              value={form.notes}
            />
          </label>
          <div className="form-actions">
            <Button type="submit" disabled={isSaving}>
              {isSaving ? "Dang luu" : mode === "edit" ? "Luu" : "Tao"}
            </Button>
          </div>
        </form>
      </section>
    </div>
  );
}

function FieldError({ message }: { message?: string }) {
  return message ? <small className="field-error">{message}</small> : null;
}

function messageFor(error: unknown) {
  if (error instanceof Error) return error.message;
  return "Co loi xay ra";
}

function formatDate(value: string) {
  if (!value) return "-";
  return new Intl.DateTimeFormat("vi-VN").format(new Date(`${value}T00:00:00`));
}
