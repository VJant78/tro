import { FormEvent, useEffect, useMemo, useState } from "react";
import { Button, StatusBadge } from "@repo/ui";
import { ApiError, apiFetch, messageFor } from "../api";
import { formatDate, formatMoney, normalizeMoneyInput } from "../format";
import { ReceiptDialog } from "../receipts/receipt-dialog";
import type { Room, RoomListResponse, RoomStatus } from "./types";

const statusLabels: Record<RoomStatus, string> = {
  VACANT: "Trống",
  OCCUPIED: "Đang thuê",
  MAINTENANCE: "Bảo trì",
  INACTIVE: "Ngừng dùng",
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
  const [success, setSuccess] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [receiptDialog, setReceiptDialog] = useState<
    "collect" | "history" | null
  >(null);

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
      const requestedId = new URLSearchParams(window.location.search).get(
        "roomId",
      );
      const nextRoom =
        response.data.find((room) => room.id === requestedId) ??
        response.data.find((room) => room.id === selectedId) ??
        response.data[0] ??
        null;
      if (nextRoom) selectRoom(nextRoom);
      else startCreate();
      const requestedReceiptView = new URLSearchParams(
        window.location.search,
      ).get("receipts");
      if (
        nextRoom?.currentOccupancy &&
        (requestedReceiptView === "collect" ||
          requestedReceiptView === "history")
      ) {
        setReceiptDialog(requestedReceiptView);
      }
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
    setForm(roomToForm(room));
  }

  function startCreate() {
    setMode("create");
    setSelectedId(null);
    setFieldErrors({});
    setSuccess(null);
    setForm(emptyForm);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSaving(true);
    setError(null);
    setSuccess(null);
    setFieldErrors({});

    const payload: Record<string, unknown> = {
      code: form.code,
      name: form.name,
      defaultRentAmount: form.defaultRentAmount,
      depositAmount: form.depositAmount,
      maxOccupants: Number(form.maxOccupants),
      notes: form.notes || null,
    };
    if (mode === "create" || !selectedRoom?.currentOccupancy) {
      payload.status = form.status === "MAINTENANCE" ? "MAINTENANCE" : "VACANT";
    }

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

      setSuccess(
        mode === "edit"
          ? `Đã cập nhật phòng ${room.code}.`
          : `Đã tạo phòng ${room.code}.`,
      );
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
    setSuccess(null);

    try {
      await apiFetch<Room>(`/rooms/${selectedRoom.id}`, { method: "DELETE" });
      startCreate();
      await loadRooms();
      setSuccess(`Đã ngừng sử dụng phòng ${selectedRoom.code}.`);
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
            <h1 id="rooms-title">Phòng</h1>
            <p>{rooms.length} phòng đang hiển thị</p>
          </div>
          <Button type="button" onClick={startCreate}>
            Tạo phòng
          </Button>
        </div>

        <div className="toolbar">
          <input
            aria-label="Tìm phòng"
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Tìm mã phòng, tên phòng"
            value={query}
          />
          <select
            aria-label="Lọc trạng thái"
            onChange={(event) =>
              setStatus(event.target.value as RoomStatus | "ALL")
            }
            value={status}
          >
            <option value="ALL">Tất cả</option>
            <option value="VACANT">Trống</option>
            <option value="OCCUPIED">Đang thuê</option>
            <option value="MAINTENANCE">Bảo trì</option>
            <option value="INACTIVE">Ngừng dùng</option>
          </select>
          <Button
            type="button"
            variant="secondary"
            onClick={() => void loadRooms()}
          >
            Lọc
          </Button>
        </div>

        {error ? (
          <div className="notice error" role="alert">
            <span>{error}</span>
            <Button
              type="button"
              variant="secondary"
              onClick={() => void loadRooms()}
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
          <div className="room-list-stack" aria-label="Đang tải phòng">
            <div className="skeleton-row" />
            <div className="skeleton-row" />
            <div className="skeleton-row" />
          </div>
        ) : rooms.length === 0 ? (
          <div className="empty-state">
            <strong>Chưa có phòng</strong>
            <Button type="button" onClick={startCreate}>
              Tạo phòng đầu tiên
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
                      Đại diện: {room.currentOccupancy.representativeName}
                      {" - "}vào {formatDate(room.currentOccupancy.startedOn)}
                      {room.currentOccupancy.coTenantCount > 0
                        ? ` - +${room.currentOccupancy.coTenantCount} ở chung`
                        : ""}
                    </small>
                  ) : (
                    <small>Chưa có người thuê</small>
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
              {mode === "edit" ? "Chi tiết phòng" : "Tạo phòng"}
            </h2>
            <p>
              {selectedRoom
                ? `${selectedRoom.code} · ${selectedRoom.name}`
                : "Phòng mới"}
            </p>
          </div>
          {mode === "edit" ? (
            <Button
              type="button"
              variant="danger"
              onClick={() => void retireSelected()}
            >
              Ngừng dùng
            </Button>
          ) : null}
        </div>

        <form className="room-form" onSubmit={(event) => void submit(event)}>
          {selectedRoom?.currentOccupancy ? (
            <section className="occupancy-panel" aria-label="Người đang ở">
              <div className="section-heading compact">
                <div>
                  <h3>Người đang ở</h3>
                  <p>
                    {selectedRoom.currentOccupancy.memberCount} người, vào phòng{" "}
                    {formatDate(selectedRoom.currentOccupancy.startedOn)}
                  </p>
                </div>
                <div className="role-actions">
                  <Button
                    onClick={() => setReceiptDialog("history")}
                    type="button"
                    variant="secondary"
                  >
                    Lịch sử thu
                  </Button>
                  <Button
                    onClick={() => setReceiptDialog("collect")}
                    type="button"
                  >
                    Thu tiền
                  </Button>
                </div>
              </div>
              <div className="tenant-member-list">
                {selectedRoom.currentOccupancy.occupants.map((occupant) => (
                  <div className="member-row" key={occupant.tenantId}>
                    <span>
                      <strong>{occupant.fullName}</strong>
                      <small>{occupant.phone ?? "Chưa có SĐT"}</small>
                    </span>
                    <StatusBadge
                      tone={
                        occupant.role === "REPRESENTATIVE"
                          ? "success"
                          : "neutral"
                      }
                    >
                      {occupant.role === "REPRESENTATIVE"
                        ? "Đại diện"
                        : "Ở chung"}
                    </StatusBadge>
                  </div>
                ))}
              </div>
            </section>
          ) : null}
          <label className="field">
            Mã phòng
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
            Tên phòng
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
              Giá thuê
              <input
                inputMode="numeric"
                name="defaultRentAmount"
                onChange={(event) =>
                  setForm({
                    ...form,
                    defaultRentAmount: normalizeMoneyInput(event.target.value),
                  })
                }
                value={form.defaultRentAmount}
              />
              <small className="field-hint">
                {formatMoney(form.defaultRentAmount)}
              </small>
              <FieldError message={fieldErrors.defaultRentAmount} />
            </label>
            <label className="field">
              Đặt cọc
              <input
                inputMode="numeric"
                name="depositAmount"
                onChange={(event) =>
                  setForm({
                    ...form,
                    depositAmount: normalizeMoneyInput(event.target.value),
                  })
                }
                value={form.depositAmount}
              />
              <small className="field-hint">
                {formatMoney(form.depositAmount)}
              </small>
              <FieldError message={fieldErrors.depositAmount} />
            </label>
            <label className="field">
              Số người tối đa
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
            <div className="field">
              Trạng thái sử dụng
              <div className="read-only-status">
                <StatusBadge
                  tone={statusTones[selectedRoom?.status ?? form.status]}
                >
                  {statusLabels[selectedRoom?.status ?? form.status]}
                </StatusBadge>
                <small>
                  Trạng thái trống/đang thuê được hệ thống tự xác định.
                </small>
              </div>
            </div>
            {!selectedRoom?.currentOccupancy &&
            selectedRoom?.status !== "INACTIVE" ? (
              <label className="field">
                Tình trạng vận hành
                <select
                  name="status"
                  onChange={(event) =>
                    setForm({
                      ...form,
                      status: event.target.value as RoomStatus,
                    })
                  }
                  value={form.status}
                >
                  <option value="VACANT">Sẵn sàng cho thuê</option>
                  <option value="MAINTENANCE">Bảo trì</option>
                </select>
              </label>
            ) : null}
          </div>
          <label className="field">
            Ghi chú
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
              {isSaving
                ? "Đang lưu"
                : mode === "edit"
                  ? "Lưu thay đổi"
                  : "Tạo phòng"}
            </Button>
          </div>
        </form>
      </section>
      {receiptDialog && selectedRoom?.currentOccupancy ? (
        <ReceiptDialog
          initialView={receiptDialog}
          key={`${selectedRoom.currentOccupancy.tenancyId}-${receiptDialog}`}
          onClose={() => setReceiptDialog(null)}
          onCollected={(message) => setSuccess(message)}
          room={selectedRoom}
        />
      ) : null}
    </div>
  );
}

function FieldError({ message }: { message?: string }) {
  return message ? <small className="field-error">{message}</small> : null;
}

function roomToForm(room: Room) {
  return {
    code: room.code,
    name: room.name,
    defaultRentAmount: room.defaultRentAmount,
    depositAmount: room.depositAmount,
    maxOccupants: String(room.maxOccupants),
    notes: room.notes ?? "",
    status: room.status,
  };
}
