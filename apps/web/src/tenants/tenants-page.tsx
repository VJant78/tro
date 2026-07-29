import { FormEvent, useEffect, useMemo, useState } from "react";
import { Button, StatusBadge } from "@repo/ui";
import { ApiError, apiFetch } from "../api";
import type {
  RoomListResponse,
  Tenancy,
  Tenant,
  TenantListResponse,
} from "./types";

const emptyTenant = {
  fullName: "",
  phone: "",
  identityNumber: "",
  permanentAddress: "",
  notes: "",
};

const emptyTenancy = {
  roomId: "",
  startDate: "2026-08-01",
  transferRoomId: "",
  transferDate: "2026-08-15",
  endDate: "2026-08-31",
};

export function TenantsPage() {
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [rooms, setRooms] = useState<RoomListResponse["data"]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [tenantForm, setTenantForm] = useState(emptyTenant);
  const [tenancyForm, setTenancyForm] = useState(emptyTenancy);
  const [query, setQuery] = useState("");
  const [roomFilter, setRoomFilter] = useState("ALL");
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const selectedTenant = useMemo(
    () => tenants.find((tenant) => tenant.id === selectedId) ?? null,
    [tenants, selectedId],
  );
  const activeTenancy = selectedTenant?.tenancies?.find(
    (tenancy) => tenancy.status === "ACTIVE",
  );
  const activeMembers =
    activeTenancy?.members.filter((member) => member.leftOn === null) ?? [];
  const selectedMembership = selectedTenant
    ? (activeMembers.find((member) => member.tenantId === selectedTenant.id) ??
      null)
    : null;
  const representativeActionBlocked =
    selectedMembership?.role === "REPRESENTATIVE" && activeMembers.length > 1;
  const isInRoom = Boolean(selectedTenant?.currentTenancy);
  const selectedRoomValue =
    selectedTenant?.currentTenancy?.roomId ?? tenancyForm.roomId;
  const selectedStartDate =
    selectedTenant?.currentTenancy?.joinedOn ?? tenancyForm.startDate;

  async function load() {
    setIsLoading(true);
    setError(null);
    const params = new URLSearchParams({ limit: "50" });
    if (query.trim()) params.set("q", query.trim());
    if (roomFilter !== "ALL") params.set("filter[roomId]", roomFilter);

    try {
      const [tenantResponse, roomResponse] = await Promise.all([
        apiFetch<TenantListResponse>(`/tenants?${params.toString()}`),
        apiFetch<RoomListResponse>("/rooms?limit=100&sort=code:asc"),
      ]);
      const detailedTenants = await Promise.all(
        tenantResponse.data.map((tenant) =>
          apiFetch<Tenant>(`/tenants/${tenant.id}`).catch(() => tenant),
        ),
      );
      setTenants(detailedTenants);
      setRooms(roomResponse.data);
      setSelectedId((current) =>
        current && detailedTenants.some((tenant) => tenant.id === current)
          ? current
          : (detailedTenants[0]?.id ?? null),
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

  function selectTenant(tenant: Tenant) {
    setSelectedId(tenant.id);
    setFieldErrors({});
    setTenantForm({
      fullName: tenant.fullName,
      phone: tenant.phone ?? "",
      identityNumber: tenant.identityNumber ?? "",
      permanentAddress: tenant.permanentAddress ?? "",
      notes: tenant.notes ?? "",
    });
  }

  function startCreate() {
    setSelectedId(null);
    setFieldErrors({});
    setTenantForm(emptyTenant);
  }

  async function submitTenant(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSaving(true);
    setError(null);
    setFieldErrors({});
    const payload = {
      fullName: tenantForm.fullName,
      phone: tenantForm.phone || null,
      identityNumber: tenantForm.identityNumber || null,
      permanentAddress: tenantForm.permanentAddress || null,
      notes: tenantForm.notes || null,
    };

    try {
      const tenant =
        selectedId === null
          ? await apiFetch<Tenant>("/tenants", {
              method: "POST",
              body: JSON.stringify(payload),
            })
          : await apiFetch<Tenant>(`/tenants/${selectedId}`, {
              method: "PATCH",
              body: JSON.stringify(payload),
            });
      await load();
      selectTenant(tenant);
    } catch (saveError) {
      handleError(saveError);
    } finally {
      setIsSaving(false);
    }
  }

  async function createTenancy() {
    if (!selectedTenant) return;
    setIsSaving(true);
    setError(null);

    try {
      await apiFetch<Tenancy>("/tenancies", {
        method: "POST",
        body: JSON.stringify({
          roomId: tenancyForm.roomId,
          representativeTenantId: selectedTenant.id,
          startDate: tenancyForm.startDate,
        }),
      });
      await load();
    } catch (saveError) {
      handleError(saveError);
    } finally {
      setIsSaving(false);
    }
  }

  async function endTenancy() {
    if (!activeTenancy) return;
    setIsSaving(true);
    setError(null);

    try {
      await apiFetch<Tenancy>(`/tenancies/${activeTenancy.id}/end`, {
        method: "PATCH",
        body: JSON.stringify({ actualEndDate: tenancyForm.endDate }),
      });
      await load();
    } catch (saveError) {
      handleError(saveError);
    } finally {
      setIsSaving(false);
    }
  }

  async function transferTenancy() {
    if (!activeTenancy) return;
    const confirmed = window.confirm("Chuyen phong cho lan thue hien tai?");
    if (!confirmed) return;
    setIsSaving(true);
    setError(null);

    try {
      await apiFetch<Tenancy>(`/tenancies/${activeTenancy.id}/transfer`, {
        method: "POST",
        body: JSON.stringify({
          toRoomId: tenancyForm.transferRoomId,
          transferDate: tenancyForm.transferDate,
        }),
      });
      await load();
    } catch (saveError) {
      handleError(saveError);
    } finally {
      setIsSaving(false);
    }
  }

  async function transferSelectedMember() {
    if (!activeTenancy || !selectedTenant) return;
    const confirmed = window.confirm("Chuyen rieng nguoi nay sang phong moi?");
    if (!confirmed) return;
    setIsSaving(true);
    setError(null);

    try {
      await apiFetch<Tenancy>(
        `/tenancies/${activeTenancy.id}/members/${selectedTenant.id}/transfer`,
        {
          method: "POST",
          body: JSON.stringify({
            toRoomId: tenancyForm.transferRoomId,
            transferDate: tenancyForm.transferDate,
          }),
        },
      );
      await load();
    } catch (saveError) {
      handleError(saveError);
    } finally {
      setIsSaving(false);
    }
  }

  async function leaveSelectedMember() {
    if (!activeTenancy || !selectedTenant) return;
    const confirmed = window.confirm("Loai nguoi nay khoi phong hien tai?");
    if (!confirmed) return;
    setIsSaving(true);
    setError(null);

    try {
      await apiFetch<Tenancy>(
        `/tenancies/${activeTenancy.id}/members/${selectedTenant.id}/leave`,
        {
          method: "PATCH",
          body: JSON.stringify({ leftOn: tenancyForm.endDate }),
        },
      );
      await load();
    } catch (saveError) {
      handleError(saveError);
    } finally {
      setIsSaving(false);
    }
  }

  function handleError(saveError: unknown) {
    if (saveError instanceof ApiError && saveError.details?.length) {
      setFieldErrors(
        Object.fromEntries(
          saveError.details.map((detail) => [detail.field, detail.message]),
        ),
      );
    }
    setError(messageFor(saveError));
  }

  return (
    <div className="tenants-layout">
      <section className="rooms-list" aria-labelledby="tenants-title">
        <div className="section-heading">
          <div>
            <h1 id="tenants-title">Nguoi thue</h1>
            <p>{tenants.length} ho so dang hien thi</p>
          </div>
          <Button type="button" onClick={startCreate}>
            Tao ho so
          </Button>
        </div>
        <div className="toolbar tenants-toolbar">
          <input
            aria-label="Tim nguoi thue"
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Tim ten, SĐT, CCCD"
            value={query}
          />
          <Button type="button" variant="secondary" onClick={() => void load()}>
            Tim
          </Button>
          <select
            aria-label="Loc theo phong"
            onChange={(event) => setRoomFilter(event.target.value)}
            value={roomFilter}
          >
            <option value="ALL">Tat ca phong</option>
            {rooms.map((room) => (
              <option key={room.id} value={room.id}>
                {room.code} - {room.name}
              </option>
            ))}
          </select>
          <Button type="button" variant="secondary" onClick={() => void load()}>
            Loc phong
          </Button>
        </div>
        {error ? (
          <div className="notice error" role="alert">
            {error}
          </div>
        ) : null}
        {isLoading ? (
          <div className="room-list-stack" aria-label="Dang tai nguoi thue">
            <div className="skeleton-row" />
            <div className="skeleton-row" />
          </div>
        ) : tenants.length === 0 ? (
          <div className="empty-state">
            <strong>Chua co nguoi thue</strong>
            <Button type="button" onClick={startCreate}>
              Tao ho so dau tien
            </Button>
          </div>
        ) : (
          <div className="room-list-stack">
            {tenants.map((tenant) => (
              <button
                className="room-row"
                data-active={tenant.id === selectedId}
                key={tenant.id}
                onClick={() => selectTenant(tenant)}
                type="button"
              >
                <span>
                  <strong>{tenant.fullName}</strong>
                  <small>{tenant.phone ?? "Chua co SĐT"}</small>
                  {tenant.currentTenancy ? (
                    <small>
                      Phong {tenant.currentTenancy.roomCode ?? "-"} -{" "}
                      {roleLabel(tenant.currentTenancy.role)}
                    </small>
                  ) : (
                    <small>Chua o phong nao</small>
                  )}
                </span>
                <StatusBadge tone={tenantStatusTone(tenant)}>
                  {tenantStatusLabel(tenant)}
                </StatusBadge>
              </button>
            ))}
          </div>
        )}
      </section>

      <section className="room-detail" aria-labelledby="tenant-form-title">
        <div className="section-heading">
          <div>
            <h2 id="tenant-form-title">
              {selectedTenant ? "Chi tiet nguoi thue" : "Tao nguoi thue"}
            </h2>
            <p>{selectedTenant?.id ?? "Ho so moi"}</p>
          </div>
        </div>
        <form
          className="room-form"
          onSubmit={(event) => void submitTenant(event)}
        >
          <label className="field">
            Ho ten
            <input
              onChange={(event) =>
                setTenantForm({ ...tenantForm, fullName: event.target.value })
              }
              value={tenantForm.fullName}
            />
            <FieldError message={fieldErrors.fullName} />
          </label>
          <div className="form-grid">
            <label className="field">
              So dien thoai
              <input
                onChange={(event) =>
                  setTenantForm({ ...tenantForm, phone: event.target.value })
                }
                value={tenantForm.phone}
              />
            </label>
            <label className="field">
              CCCD
              <input
                onChange={(event) =>
                  setTenantForm({
                    ...tenantForm,
                    identityNumber: event.target.value,
                  })
                }
                value={tenantForm.identityNumber}
              />
            </label>
          </div>
          <label className="field">
            Dia chi thuong tru
            <input
              onChange={(event) =>
                setTenantForm({
                  ...tenantForm,
                  permanentAddress: event.target.value,
                })
              }
              value={tenantForm.permanentAddress}
            />
          </label>
          <label className="field">
            Ghi chu
            <textarea
              onChange={(event) =>
                setTenantForm({ ...tenantForm, notes: event.target.value })
              }
              value={tenantForm.notes}
            />
          </label>
          <div className="form-actions">
            <Button type="submit" disabled={isSaving}>
              {selectedTenant ? "Luu" : "Tao"}
            </Button>
          </div>
        </form>

        {selectedTenant ? (
          <section className="tenancy-panel" aria-labelledby="tenancy-title">
            <h3 id="tenancy-title">Lan thue</h3>
            {activeTenancy ? (
              <div className="current-tenancy-card">
                <div className="current-tenancy-summary">
                  <StatusBadge
                    tone={
                      activeTenancy.membershipRole === "REPRESENTATIVE"
                        ? "success"
                        : "neutral"
                    }
                  >
                    {roleLabel(activeTenancy.membershipRole)}
                  </StatusBadge>
                  <span>
                    Phong {activeTenancy.roomCode ?? activeTenancy.roomId} - dai
                    dien {activeTenancy.representativeTenantName ?? "-"}
                  </span>
                </div>
                <div className="tenant-facts">
                  <span>
                    <small>Ngay vao cua nguoi nay</small>
                    <strong>
                      {formatDate(
                        selectedMembership?.joinedOn ??
                          selectedTenant.currentTenancy?.joinedOn ??
                          "",
                      )}
                    </strong>
                  </span>
                  <span>
                    <small>Ngay bat dau phong</small>
                    <strong>{formatDate(activeTenancy.startDate)}</strong>
                  </span>
                  <span>
                    <small>So nguoi trong phong</small>
                    <strong>{activeMembers.length}</strong>
                  </span>
                </div>
                {representativeActionBlocked ? (
                  <div className="notice warning">
                    Dai dien khong the roi/chuyen rieng khi phong con nguoi o
                    chung.
                  </div>
                ) : null}
                <div
                  className="tenant-member-list"
                  aria-label="Nguoi cung phong"
                >
                  {activeMembers.map((member) => (
                    <div className="member-row" key={member.tenantId}>
                      <span>
                        <strong>{member.fullName}</strong>
                        <small>
                          {member.phone ?? "Chua co SĐT"} - vao{" "}
                          {formatDate(member.joinedOn)}
                        </small>
                      </span>
                      <StatusBadge
                        tone={
                          member.role === "REPRESENTATIVE"
                            ? "success"
                            : "neutral"
                        }
                      >
                        {roleLabel(member.role)}
                      </StatusBadge>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
            <div className="form-grid">
              <label className="field">
                Phong
                <select
                  disabled={isInRoom}
                  onChange={(event) =>
                    setTenancyForm({
                      ...tenancyForm,
                      roomId: event.target.value,
                    })
                  }
                  value={selectedRoomValue}
                >
                  <option value="">Chon phong</option>
                  {rooms.map((room) => (
                    <option key={room.id} value={room.id}>
                      {room.code} - {room.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                Ngay bat dau
                <input
                  disabled={isInRoom}
                  type="date"
                  onChange={(event) =>
                    setTenancyForm({
                      ...tenancyForm,
                      startDate: event.target.value,
                    })
                  }
                  value={selectedStartDate}
                />
              </label>
            </div>
            <div className="form-actions">
              <Button
                type="button"
                disabled={
                  isSaving ||
                  !tenancyForm.roomId ||
                  Boolean(selectedTenant.currentTenancy)
                }
                onClick={() => void createTenancy()}
              >
                {selectedTenant.currentTenancy
                  ? "Dang o phong"
                  : "Dua vao phong"}
              </Button>
            </div>
            {activeTenancy ? (
              <div className="tenancy-actions">
                <StatusBadge tone="success">Dang thue</StatusBadge>
                <label className="field">
                  Phong chuyen den
                  <select
                    onChange={(event) =>
                      setTenancyForm({
                        ...tenancyForm,
                        transferRoomId: event.target.value,
                      })
                    }
                    value={tenancyForm.transferRoomId}
                  >
                    <option value="">Chon phong</option>
                    {rooms.map((room) => (
                      <option key={room.id} value={room.id}>
                        {room.code} - {room.name}
                      </option>
                    ))}
                  </select>
                </label>
                <Button
                  type="button"
                  variant="secondary"
                  disabled={
                    isSaving ||
                    !tenancyForm.transferRoomId ||
                    representativeActionBlocked
                  }
                  onClick={() => void transferSelectedMember()}
                >
                  Chuyen nguoi nay
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  disabled={isSaving || !tenancyForm.transferRoomId}
                  onClick={() => void transferTenancy()}
                >
                  Chuyen ca phong
                </Button>
                <Button
                  type="button"
                  variant="danger"
                  disabled={isSaving || representativeActionBlocked}
                  onClick={() => void leaveSelectedMember()}
                >
                  Roi phong
                </Button>
                <Button
                  type="button"
                  variant="danger"
                  disabled={isSaving}
                  onClick={() => void endTenancy()}
                >
                  Ket thuc ca phong
                </Button>
              </div>
            ) : null}
          </section>
        ) : null}
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

function tenantStatusLabel(tenant: Tenant) {
  if (tenant.currentTenancy) return "Dang o";
  if (tenant.status === "ACTIVE") return "Chua vao phong";
  if (tenant.status === "LEFT") return "Da roi";
  return "Ngung";
}

function tenantStatusTone(
  tenant: Tenant,
): "neutral" | "success" | "warning" | "danger" {
  if (tenant.currentTenancy) return "success";
  if (tenant.status === "ACTIVE") return "neutral";
  if (tenant.status === "LEFT") return "warning";
  return "danger";
}

function roleLabel(role?: "REPRESENTATIVE" | "CO_TENANT" | null) {
  if (role === "REPRESENTATIVE") return "Dai dien";
  if (role === "CO_TENANT") return "O chung";
  return "Chua co vai tro";
}

function formatDate(value: string) {
  if (!value) return "-";
  return new Intl.DateTimeFormat("vi-VN").format(new Date(`${value}T00:00:00`));
}
