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
import type {
  RoomListResponse,
  Tenancy,
  Tenant,
  TenantListResponse,
} from "./types";
import type { SettlementPreview, UtilityReading } from "../utilities/types";
import type { ReceiptHistoryResponse, ReceiptSummary } from "../receipts/types";

const emptyTenant = {
  fullName: "",
  phone: "",
  identityNumber: "",
  permanentAddress: "",
  notes: "",
};

const emptyTenancy = () => ({ roomId: "", startDate: localDateString() });

type TenantAction =
  | "transfer-member"
  | "leave-member"
  | "change-representative"
  | "transfer-group"
  | "end-group";

const emptyAction = () => ({
  targetRoomId: "",
  effectiveDate: localDateString(),
  newRepresentativeTenantId: "",
  electricityPrevious: "0",
  electricityCurrent: "0",
  waterPrevious: "0",
  waterCurrent: "0",
  notes: "",
});

export function TenantsPage() {
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [rooms, setRooms] = useState<RoomListResponse["data"]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [tenantForm, setTenantForm] = useState(emptyTenant);
  const [tenancyForm, setTenancyForm] = useState(emptyTenancy);
  const [action, setAction] = useState<TenantAction | null>(null);
  const [actionForm, setActionForm] = useState(emptyAction);
  const [actionIdempotencyKey, setActionIdempotencyKey] =
    useState(makeIdempotencyKey);
  const [actionPreview, setActionPreview] = useState<SettlementPreview | null>(
    null,
  );
  const [query, setQuery] = useState("");
  const [roomFilter, setRoomFilter] = useState("ALL");
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [actionReceiptSummary, setActionReceiptSummary] =
    useState<ReceiptSummary | null>(null);
  const [actionReceiptSummaryError, setActionReceiptSummaryError] = useState<
    string | null
  >(null);

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
  const isRepresentative = selectedMembership?.role === "REPRESENTATIVE";
  const isCoTenant = selectedMembership?.role === "CO_TENANT";
  const currentRoom =
    rooms.find((room) => room.id === activeTenancy?.roomId) ?? null;
  const coTenants = activeMembers.filter(
    (member) => member.role === "CO_TENANT",
  );

  async function load(preferredId = selectedId) {
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
      const requestedId = new URLSearchParams(window.location.search).get(
        "tenantId",
      );
      const nextTenant =
        detailedTenants.find((tenant) => tenant.id === requestedId) ??
        detailedTenants.find((tenant) => tenant.id === preferredId) ??
        detailedTenants[0] ??
        null;
      if (nextTenant) selectTenant(nextTenant);
      else startCreate();
    } catch (loadError) {
      setError(messageFor(loadError, "Không tải được danh sách người thuê."));
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  useEffect(() => {
    if (
      !action ||
      (action !== "transfer-group" && action !== "end-group") ||
      !activeTenancy
    )
      return;
    let active = true;
    apiFetch<UtilityReading[]>(
      `/utility-readings?roomId=${encodeURIComponent(activeTenancy.roomId)}&status=FINALIZED`,
    )
      .then((readings) => {
        const latest = readings.sort((left, right) =>
          right.billingPeriodEnd.localeCompare(left.billingPeriodEnd),
        )[0];
        if (!active || !latest) return;
        setActionForm((current) => ({
          ...current,
          electricityPrevious: latest.electricityCurrent,
          electricityCurrent: latest.electricityCurrent,
          waterPrevious: latest.waterCurrent,
          waterCurrent: latest.waterCurrent,
        }));
      })
      .catch((loadError) => {
        if (active)
          setError(messageFor(loadError, "Không tải được chỉ số bàn giao."));
      });
    return () => {
      active = false;
    };
  }, [action, activeTenancy?.id]);

  useEffect(() => {
    if (
      !activeTenancy ||
      (action !== "transfer-group" && action !== "end-group")
    ) {
      setActionReceiptSummary(null);
      setActionReceiptSummaryError(null);
      return;
    }
    let active = true;
    setActionReceiptSummary(null);
    setActionReceiptSummaryError(null);
    apiFetch<ReceiptHistoryResponse>(
      `/tenancies/${activeTenancy.id}/receipts?limit=1`,
    )
      .then((response) => {
        if (!active) return;
        setActionReceiptSummary(
          response.summary ?? {
            creditBalance: response.data[0]?.creditBalanceAfter ?? "0",
            receiptCount: response.data.length,
          },
        );
      })
      .catch(() => {
        if (active) {
          setActionReceiptSummary(null);
          setActionReceiptSummaryError("Không tải được số dư đã thu.");
        }
      });
    return () => {
      active = false;
    };
  }, [action, activeTenancy?.id]);

  useEffect(() => {
    setActionPreview(null);
  }, [
    actionForm.effectiveDate,
    actionForm.electricityPrevious,
    actionForm.electricityCurrent,
    actionForm.waterPrevious,
    actionForm.waterCurrent,
  ]);

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
    setSuccess(null);
    setTenantForm(emptyTenant);
    setTenancyForm(emptyTenancy());
  }

  function openAction(nextAction: TenantAction) {
    setActionForm(emptyAction());
    setActionIdempotencyKey(makeIdempotencyKey());
    setActionPreview(null);
    setFieldErrors({});
    setError(null);
    setAction(nextAction);
  }

  async function submitTenant(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSaving(true);
    setError(null);
    setSuccess(null);
    setFieldErrors({});
    const payload = {
      fullName: tenantForm.fullName,
      phone: tenantForm.phone || null,
      identityNumber: tenantForm.identityNumber || null,
      permanentAddress: tenantForm.permanentAddress || null,
      notes: tenantForm.notes || null,
    };

    try {
      const tenant = selectedId
        ? await apiFetch<Tenant>(`/tenants/${selectedId}`, {
            method: "PATCH",
            body: JSON.stringify(payload),
          })
        : await apiFetch<Tenant>("/tenants", {
            method: "POST",
            body: JSON.stringify(payload),
          });
      setSuccess(
        selectedId
          ? `Đã cập nhật hồ sơ ${tenant.fullName}.`
          : `Đã tạo hồ sơ ${tenant.fullName}.`,
      );
      await load(tenant.id);
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
    setSuccess(null);
    try {
      await apiFetch<Tenancy>("/tenancies", {
        method: "POST",
        body: JSON.stringify({
          roomId: tenancyForm.roomId,
          representativeTenantId: selectedTenant.id,
          startDate: tenancyForm.startDate,
        }),
      });
      const room = rooms.find((item) => item.id === tenancyForm.roomId);
      setSuccess(
        `Đã xếp ${selectedTenant.fullName} vào phòng ${room?.code ?? "đã chọn"}.`,
      );
      await load(selectedTenant.id);
    } catch (saveError) {
      handleError(saveError);
    } finally {
      setIsSaving(false);
    }
  }

  async function submitAction(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!action || !activeTenancy || !selectedTenant) return;
    if (
      (action === "transfer-group" || action === "end-group") &&
      !actionPreview
    ) {
      setError("Hãy xem tạm tính trước khi xác nhận chốt phòng.");
      return;
    }
    setIsSaving(true);
    setError(null);
    setSuccess(null);
    try {
      if (action === "change-representative") {
        const replacement = coTenants.find(
          (member) => member.tenantId === actionForm.newRepresentativeTenantId,
        );
        await apiFetch(`/tenancies/${activeTenancy.id}/change-representative`, {
          method: "POST",
          body: JSON.stringify({
            idempotencyKey: actionIdempotencyKey,
            newRepresentativeTenantId: actionForm.newRepresentativeTenantId,
          }),
        });
        setSuccess(
          `Đã đổi người đại diện phòng ${activeTenancy.roomCode ?? "hiện tại"} sang ${replacement?.fullName ?? "người đã chọn"}.`,
        );
      } else if (action === "transfer-member") {
        await apiFetch(
          `/tenancies/${activeTenancy.id}/members/${selectedTenant.id}/transfer`,
          {
            method: "POST",
            body: JSON.stringify({
              toRoomId: actionForm.targetRoomId,
              transferDate: actionForm.effectiveDate,
            }),
          },
        );
        setSuccess(
          `Đã chuyển ${selectedTenant.fullName}; phòng cũ không bị chốt tiền.`,
        );
      } else if (action === "leave-member") {
        await apiFetch(
          `/tenancies/${activeTenancy.id}/members/${selectedTenant.id}/leave`,
          {
            method: "PATCH",
            body: JSON.stringify({ leftOn: actionForm.effectiveDate }),
          },
        );
        setSuccess(`Đã cho ${selectedTenant.fullName} rời phòng.`);
      } else {
        const body = {
          idempotencyKey: actionIdempotencyKey,
          ...(action === "transfer-group"
            ? {
                toRoomId: actionForm.targetRoomId,
                transferDate: actionForm.effectiveDate,
              }
            : { actualEndDate: actionForm.effectiveDate }),
          handoverReadings: {
            electricityPrevious: actionForm.electricityPrevious,
            electricityCurrent: actionForm.electricityCurrent,
            waterPrevious: actionForm.waterPrevious,
            waterCurrent: actionForm.waterCurrent,
          },
          prepaidAmount: "0",
          notes: actionForm.notes || null,
        };
        await apiFetch(
          action === "transfer-group"
            ? `/tenancies/${activeTenancy.id}/transfer`
            : `/tenancies/${activeTenancy.id}/end`,
          {
            method: action === "transfer-group" ? "POST" : "PATCH",
            body: JSON.stringify(body),
          },
        );
        setSuccess(
          action === "transfer-group"
            ? `Đã chốt phòng ${activeTenancy.roomCode ?? "cũ"}, tạo hóa đơn và chuyển cả nhóm.`
            : `Đã chốt tiền, tạo hóa đơn và kết thúc thuê phòng ${activeTenancy.roomCode ?? "hiện tại"}.`,
        );
      }
      setAction(null);
      await load(selectedTenant.id);
    } catch (saveError) {
      handleError(saveError);
    } finally {
      setIsSaving(false);
    }
  }

  async function previewGroupAction() {
    if (!activeTenancy) return;
    setIsSaving(true);
    setError(null);
    setActionPreview(null);
    const [billingYear, billingMonth] = actionForm.effectiveDate
      .split("-")
      .map(Number);
    try {
      const preview = await apiFetch<SettlementPreview>(
        "/settlements/preview",
        {
          method: "POST",
          body: JSON.stringify({
            tenancyId: activeTenancy.id,
            settlementType: "MOVE_OUT",
            billingYear,
            billingMonth,
            periodEnd: actionForm.effectiveDate,
            utilityReading: {
              electricityPrevious: actionForm.electricityPrevious,
              electricityCurrent: actionForm.electricityCurrent,
              waterPrevious: actionForm.waterPrevious,
              waterCurrent: actionForm.waterCurrent,
            },
            prepaidAmount: "0",
            notes: actionForm.notes || null,
          }),
        },
      );
      setActionPreview(preview);
    } catch (previewError) {
      handleError(previewError);
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
            <h1 id="tenants-title">Người thuê</h1>
            <p>{tenants.length} hồ sơ đang hiển thị</p>
          </div>
          <Button type="button" onClick={startCreate}>
            Tạo hồ sơ
          </Button>
        </div>
        <div className="toolbar tenants-toolbar">
          <input
            aria-label="Tìm người thuê"
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Tìm tên, SĐT, CCCD"
            value={query}
          />
          <select
            aria-label="Lọc theo phòng"
            onChange={(event) => setRoomFilter(event.target.value)}
            value={roomFilter}
          >
            <option value="ALL">Tất cả phòng</option>
            {rooms.map((room) => (
              <option key={room.id} value={room.id}>
                {room.code} - {room.name}
              </option>
            ))}
          </select>
          <Button type="button" variant="secondary" onClick={() => void load()}>
            Lọc
          </Button>
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
          <div className="room-list-stack" aria-label="Đang tải người thuê">
            <div className="skeleton-row" />
            <div className="skeleton-row" />
          </div>
        ) : tenants.length === 0 ? (
          <div className="empty-state">
            <strong>Chưa có người thuê</strong>
            <Button onClick={startCreate}>Tạo hồ sơ đầu tiên</Button>
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
                  <small>{tenant.phone ?? "Chưa có SĐT"}</small>
                  <small>
                    {tenant.currentTenancy
                      ? `Phòng ${tenant.currentTenancy.roomCode ?? "-"} · ${roleLabel(tenant.currentTenancy.role)}`
                      : "Chưa ở phòng nào"}
                  </small>
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
              {selectedTenant ? "Chi tiết người thuê" : "Tạo người thuê"}
            </h2>
            <p>{selectedTenant?.fullName ?? "Hồ sơ mới"}</p>
          </div>
        </div>
        <form
          className="room-form"
          onSubmit={(event) => void submitTenant(event)}
        >
          <label className="field">
            Họ tên
            <input
              onChange={(event) =>
                setTenantForm({ ...tenantForm, fullName: event.target.value })
              }
              required
              value={tenantForm.fullName}
            />
            <FieldError message={fieldErrors.fullName} />
          </label>
          <div className="form-grid">
            <label className="field">
              Số điện thoại
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
            Địa chỉ thường trú
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
            Ghi chú
            <textarea
              onChange={(event) =>
                setTenantForm({ ...tenantForm, notes: event.target.value })
              }
              value={tenantForm.notes}
            />
          </label>
          <div className="form-actions">
            <Button type="submit" disabled={isSaving}>
              {isSaving
                ? "Đang lưu"
                : selectedTenant
                  ? "Lưu hồ sơ"
                  : "Tạo hồ sơ"}
            </Button>
          </div>
        </form>

        {selectedTenant ? (
          <section className="tenancy-panel" aria-labelledby="tenancy-title">
            <h3 id="tenancy-title">Lần thuê hiện tại</h3>
            {activeTenancy ? (
              <div className="current-tenancy-card">
                <div className="current-tenancy-summary">
                  <StatusBadge tone={isRepresentative ? "success" : "neutral"}>
                    {roleLabel(selectedMembership?.role)}
                  </StatusBadge>
                  <strong>
                    Phòng {activeTenancy.roomCode ?? currentRoom?.code ?? "-"}
                  </strong>
                </div>
                <div className="tenant-facts">
                  <Fact
                    label="Ngày vào của người này"
                    value={formatDate(
                      selectedMembership?.joinedOn ??
                        selectedTenant.currentTenancy?.joinedOn,
                    )}
                  />
                  <Fact
                    label="Ngày bắt đầu phòng"
                    value={formatDate(activeTenancy.startDate)}
                  />
                  <Fact
                    label="Số người trong phòng"
                    value={String(activeMembers.length)}
                  />
                </div>
                <div
                  className="tenant-member-list"
                  aria-label="Người cùng phòng"
                >
                  {activeMembers.map((member) => (
                    <div className="member-row" key={member.tenantId}>
                      <span>
                        <strong>{member.fullName}</strong>
                        <small>
                          {member.phone ?? "Chưa có SĐT"} · vào{" "}
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
                <div className="current-room-field">
                  <label className="field">
                    Phòng hiện tại
                    <select disabled value={activeTenancy.roomId}>
                      <option value={activeTenancy.roomId}>
                        {activeTenancy.roomCode ??
                          currentRoom?.code ??
                          "Phòng hiện tại"}
                      </option>
                    </select>
                  </label>
                </div>
                <div className="role-actions">
                  {isCoTenant ? (
                    <>
                      <Button onClick={() => openAction("transfer-member")}>
                        Chuyển người này
                      </Button>
                      <Button
                        variant="danger"
                        onClick={() => openAction("leave-member")}
                      >
                        Rời phòng
                      </Button>
                    </>
                  ) : isRepresentative ? (
                    <>
                      <Button onClick={() => openAction("transfer-group")}>
                        Chuyển cả phòng
                      </Button>
                      {coTenants.length > 0 ? (
                        <Button
                          variant="secondary"
                          onClick={() => openAction("change-representative")}
                        >
                          Đổi người đại diện
                        </Button>
                      ) : null}
                      <Button
                        variant="danger"
                        onClick={() => openAction("end-group")}
                      >
                        Kết thúc thuê
                      </Button>
                    </>
                  ) : null}
                </div>
              </div>
            ) : (
              <div className="assignment-panel">
                <div className="form-grid">
                  <label className="field">
                    Phòng
                    <select
                      onChange={(event) =>
                        setTenancyForm({
                          ...tenancyForm,
                          roomId: event.target.value,
                        })
                      }
                      value={tenancyForm.roomId}
                    >
                      <option value="">Chọn phòng</option>
                      {rooms
                        .filter(
                          (room) =>
                            room.status !== "INACTIVE" &&
                            room.status !== "MAINTENANCE",
                        )
                        .map((room) => (
                          <option key={room.id} value={room.id}>
                            {room.code} - {room.name}
                          </option>
                        ))}
                    </select>
                  </label>
                  <label className="field">
                    Ngày bắt đầu
                    <input
                      max={localDateString()}
                      onChange={(event) =>
                        setTenancyForm({
                          ...tenancyForm,
                          startDate: event.target.value,
                        })
                      }
                      type="date"
                      value={tenancyForm.startDate}
                    />
                  </label>
                </div>
                <div className="form-actions">
                  <Button
                    disabled={
                      isSaving || !tenancyForm.roomId || !tenancyForm.startDate
                    }
                    onClick={() => void createTenancy()}
                  >
                    Xếp vào phòng
                  </Button>
                </div>
              </div>
            )}
          </section>
        ) : null}
      </section>

      {action && activeTenancy && selectedTenant ? (
        <Modal
          onClose={() => !isSaving && setAction(null)}
          title={actionTitle(action)}
        >
          <form
            className="room-form"
            onSubmit={(event) => void submitAction(event)}
          >
            <p className="modal-context">
              Phòng {activeTenancy.roomCode ?? currentRoom?.code ?? "hiện tại"}{" "}
              · {selectedTenant.fullName}
            </p>
            {action === "change-representative" ? (
              <>
                <label className="field">
                  Người đại diện mới
                  <select
                    required
                    onChange={(event) =>
                      setActionForm({
                        ...actionForm,
                        newRepresentativeTenantId: event.target.value,
                      })
                    }
                    value={actionForm.newRepresentativeTenantId}
                  >
                    <option value="">Chọn người ở chung</option>
                    {coTenants.map((member) => (
                      <option key={member.tenantId} value={member.tenantId}>
                        {member.fullName}
                      </option>
                    ))}
                  </select>
                </label>
                <div className="notice warning">
                  Người mới trở thành đại diện; {selectedTenant.fullName} vẫn ở
                  phòng với vai trò ở chung. Không chốt tiền.
                </div>
              </>
            ) : (
              <>
                {action === "transfer-member" || action === "transfer-group" ? (
                  <label className="field">
                    Phòng chuyển đến
                    <select
                      required
                      onChange={(event) =>
                        setActionForm({
                          ...actionForm,
                          targetRoomId: event.target.value,
                        })
                      }
                      value={actionForm.targetRoomId}
                    >
                      <option value="">Chọn phòng</option>
                      {rooms
                        .filter(
                          (room) =>
                            room.id !== activeTenancy.roomId &&
                            room.status !== "INACTIVE" &&
                            room.status !== "MAINTENANCE" &&
                            (action !== "transfer-group" ||
                              !room.currentOccupancy),
                        )
                        .map((room) => (
                          <option key={room.id} value={room.id}>
                            {room.code} - {room.name}
                          </option>
                        ))}
                    </select>
                  </label>
                ) : null}
                <label className="field">
                  Ngày hiệu lực
                  <input
                    max={localDateString()}
                    min={activeTenancy.startDate}
                    onChange={(event) =>
                      setActionForm({
                        ...actionForm,
                        effectiveDate: event.target.value,
                      })
                    }
                    required
                    type="date"
                    value={actionForm.effectiveDate}
                  />
                </label>
                {action === "transfer-group" || action === "end-group" ? (
                  <>
                    <div className="meter-grid">
                      <MeterField
                        label="Điện cũ (kWh)"
                        field="electricityPrevious"
                        form={actionForm}
                        setForm={setActionForm}
                        readOnly
                      />
                      <MeterField
                        label="Điện bàn giao (kWh)"
                        field="electricityCurrent"
                        form={actionForm}
                        setForm={setActionForm}
                      />
                      <MeterField
                        label="Nước cũ (m³)"
                        field="waterPrevious"
                        form={actionForm}
                        setForm={setActionForm}
                        readOnly
                      />
                      <MeterField
                        label="Nước bàn giao (m³)"
                        field="waterCurrent"
                        form={actionForm}
                        setForm={setActionForm}
                      />
                    </div>
                    <div
                      className="credit-balance-panel"
                      aria-label="Số dư đã thu của lần thuê"
                    >
                      <span>
                        <small>Đã thu trước</small>
                        <strong>
                          {actionReceiptSummary
                            ? formatMoney(actionReceiptSummary.creditBalance)
                            : actionReceiptSummaryError
                              ? "Không khả dụng"
                              : "Đang tải..."}
                        </strong>
                        <small>
                          {actionReceiptSummary
                            ? `${actionReceiptSummary.receiptCount} lần thu`
                            : ""}
                        </small>
                      </span>
                      <a
                        className="text-link"
                        href={`/rooms?roomId=${encodeURIComponent(
                          activeTenancy.roomId,
                        )}&receipts=history`}
                      >
                        Xem lịch sử thu
                      </a>
                    </div>
                    {actionReceiptSummaryError ? (
                      <small className="field-error" role="alert">
                        {actionReceiptSummaryError}
                      </small>
                    ) : null}
                    <label className="field">
                      Ghi chú
                      <textarea
                        onChange={(event) =>
                          setActionForm({
                            ...actionForm,
                            notes: event.target.value,
                          })
                        }
                        value={actionForm.notes}
                      />
                    </label>
                    <div className="form-actions">
                      <Button
                        variant="secondary"
                        disabled={isSaving}
                        onClick={() => void previewGroupAction()}
                      >
                        Xem tạm tính phòng cũ
                      </Button>
                    </div>
                    {actionPreview ? (
                      <div className="settlement-grid">
                        <PreviewFact
                          label="Tiền phòng"
                          value={formatMoney(actionPreview.proratedRentAmount)}
                        />
                        <PreviewFact
                          label="Tiền điện"
                          value={formatMoney(actionPreview.electricityAmount)}
                        />
                        <PreviewFact
                          label="Tiền nước"
                          value={formatMoney(actionPreview.waterAmount)}
                        />
                        <PreviewFact
                          label="Còn phải thu"
                          value={formatMoney(actionPreview.outstandingAmount)}
                        />
                      </div>
                    ) : null}
                    <div className="notice warning">
                      Thao tác sẽ chốt tiền phòng cũ đến ngày hiệu lực và tạo
                      đúng một hóa đơn trước khi{" "}
                      {action === "transfer-group"
                        ? "chuyển cả nhóm"
                        : "kết thúc thuê"}
                      .
                    </div>
                  </>
                ) : action === "transfer-member" ? (
                  <div className="notice">
                    Chỉ chuyển người này. Lần thuê và người đại diện phòng cũ
                    không đổi, không chốt tiền phòng cũ.
                  </div>
                ) : (
                  <div className="notice">
                    Chỉ người này rời phòng. Phòng cũ tiếp tục hoạt động và
                    không chốt tiền.
                  </div>
                )}
              </>
            )}
            {error ? (
              <div className="notice error" role="alert">
                {error}
              </div>
            ) : null}
            <div className="form-actions modal-actions">
              <Button
                variant="secondary"
                onClick={() => setAction(null)}
                disabled={isSaving}
              >
                Hủy
              </Button>
              <Button
                type="submit"
                variant={
                  action === "leave-member" || action === "end-group"
                    ? "danger"
                    : "primary"
                }
                disabled={
                  isSaving || !isActionValid(action, actionForm, actionPreview)
                }
              >
                {isSaving ? "Đang xử lý" : actionSubmitLabel(action)}
              </Button>
            </div>
          </form>
        </Modal>
      ) : null}
    </div>
  );
}

type ActionForm = ReturnType<typeof emptyAction>;

function MeterField({
  label,
  field,
  form,
  setForm,
  readOnly = false,
}: {
  label: string;
  field:
    | "electricityPrevious"
    | "electricityCurrent"
    | "waterPrevious"
    | "waterCurrent";
  form: ActionForm;
  setForm: (form: ActionForm) => void;
  readOnly?: boolean;
}) {
  return (
    <label className="field">
      {label}
      <input
        inputMode="decimal"
        onChange={(event) => setForm({ ...form, [field]: event.target.value })}
        readOnly={readOnly}
        value={form[field]}
      />
    </label>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <span>
      <small>{label}</small>
      <strong>{value}</strong>
    </span>
  );
}

function PreviewFact({ label, value }: { label: string; value: string }) {
  return (
    <article className="pricing-cell">
      <small>{label}</small>
      <strong>{value}</strong>
    </article>
  );
}

function FieldError({ message }: { message?: string }) {
  return message ? <small className="field-error">{message}</small> : null;
}

function tenantStatusLabel(tenant: Tenant) {
  if (tenant.currentTenancy) return "Đang ở";
  if (tenant.status === "ACTIVE") return "Chưa ở";
  if (tenant.status === "LEFT") return "Đã rời";
  return "Ngừng dùng";
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
  if (role === "REPRESENTATIVE") return "Đại diện";
  if (role === "CO_TENANT") return "Ở chung";
  return "Chưa có vai trò";
}

function actionTitle(action: TenantAction) {
  return (
    {
      "transfer-member": "Chuyển người này",
      "leave-member": "Rời phòng",
      "change-representative": "Đổi người đại diện",
      "transfer-group": "Chuyển cả phòng",
      "end-group": "Kết thúc thuê",
    } satisfies Record<TenantAction, string>
  )[action];
}

function actionSubmitLabel(action: TenantAction) {
  return (
    {
      "transfer-member": "Xác nhận chuyển người",
      "leave-member": "Xác nhận rời phòng",
      "change-representative": "Xác nhận đổi đại diện",
      "transfer-group": "Chốt phòng cũ và chuyển cả phòng",
      "end-group": "Chốt tiền và kết thúc thuê",
    } satisfies Record<TenantAction, string>
  )[action];
}

function isActionValid(
  action: TenantAction,
  form: ActionForm,
  preview: SettlementPreview | null,
) {
  if (action === "change-representative")
    return Boolean(form.newRepresentativeTenantId);
  if (!form.effectiveDate) return false;
  if (action === "transfer-member") return Boolean(form.targetRoomId);
  if (action === "transfer-group") return Boolean(form.targetRoomId && preview);
  if (action === "end-group") return Boolean(preview);
  return true;
}
