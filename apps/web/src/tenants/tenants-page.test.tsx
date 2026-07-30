import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TenantsPage } from "./tenants-page";

const tenant = {
  id: "00000000-0000-4000-8000-000000000301",
  fullName: "Nguyen Van A",
  phone: "0900000001",
  identityNumber: "012345678901",
  permanentAddress: null,
  emergencyContactName: null,
  emergencyContactPhone: null,
  notes: null,
  status: "ACTIVE",
  currentTenancy: null,
  tenancies: [],
};

const room = {
  id: "00000000-0000-4000-8000-000000000401",
  code: "A-101",
  name: "Phong A101",
  roomType: null,
  status: "VACANT",
  defaultRentAmount: "2500000",
  defaultBillingCycleType: "MONTHLY",
  defaultBillingCycleCount: 1,
  maxOccupants: 2,
  depositAmount: "500000",
  notes: null,
  currentOccupancy: null,
};
const coTenantId = "00000000-0000-4000-8000-000000000302";

const activeTenant = {
  ...tenant,
  currentTenancy: {
    tenancyId: "00000000-0000-4000-8000-000000000501",
    roomId: room.id,
    roomCode: room.code,
    representativeTenantId: tenant.id,
    representativeName: tenant.fullName,
    role: "REPRESENTATIVE",
    startDate: "2026-08-01",
    joinedOn: "2026-08-01",
  },
  tenancies: [
    {
      id: "00000000-0000-4000-8000-000000000501",
      roomId: room.id,
      roomCode: room.code,
      representativeTenantId: tenant.id,
      representativeTenantName: tenant.fullName,
      status: "ACTIVE",
      startDate: "2026-08-01",
      actualEndDate: null,
      rentAmount: "2500000",
      depositAmount: "500000",
      notes: null,
      membershipRole: "REPRESENTATIVE",
      memberCount: 2,
      members: [
        {
          tenantId: tenant.id,
          fullName: tenant.fullName,
          phone: tenant.phone,
          role: "REPRESENTATIVE",
          joinedOn: "2026-08-01",
          leftOn: null,
        },
        {
          tenantId: coTenantId,
          fullName: "Tran Thi B",
          phone: "0900000002",
          role: "CO_TENANT",
          joinedOn: "2026-08-02",
          leftOn: null,
        },
      ],
    },
  ],
};

describe("TenantsPage", () => {
  beforeEach(() => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      const url = String(input);
      const method = init?.method ?? "GET";

      if (url.includes("/tenants?")) {
        return jsonResponse({
          data: [tenant],
          page: { limit: 50, nextCursor: null, hasMore: false },
        });
      }
      if (url.endsWith(`/tenants/${tenant.id}`)) {
        return jsonResponse(tenant);
      }
      if (url.includes("/rooms?")) {
        return jsonResponse({ data: [room] });
      }
      if (url.endsWith("/tenants") && method === "POST") {
        return jsonResponse({ ...tenant, fullName: "Tran Thi B" }, 201);
      }

      return jsonResponse({ error: { message: "Not found" } }, 404);
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders tenants and submits create form", async () => {
    const user = userEvent.setup();
    render(<TenantsPage />);

    expect(await screen.findAllByText("Nguyen Van A")).toHaveLength(2);
    expect(screen.getByText("Chưa ở phòng nào")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Tạo hồ sơ" }));
    await user.type(screen.getByLabelText("Họ tên"), "Tran Thi B");
    await user.click(
      screen.getAllByRole("button", { name: "Tạo hồ sơ" }).at(-1)!,
    );

    await waitFor(() => {
      expect(globalThis.fetch).toHaveBeenCalledWith(
        expect.stringContaining("/tenants"),
        expect.objectContaining({ method: "POST" }),
      );
    });
  });

  it("shows current room details and co-tenants", async () => {
    const user = userEvent.setup();
    vi.mocked(globalThis.fetch).mockImplementation(async (input, init) => {
      const url = String(input);
      if (
        url.endsWith(
          `/tenancies/${activeTenant.currentTenancy.tenancyId}/change-representative`,
        ) &&
        init?.method === "POST"
      ) {
        return jsonResponse(
          {
            tenancyId: activeTenant.currentTenancy.tenancyId,
            previousRepresentative: {
              tenantId: tenant.id,
              fullName: tenant.fullName,
            },
            newRepresentative: {
              tenantId: coTenantId,
              fullName: "Tran Thi B",
            },
            effectiveAt: "2026-08-10T00:00:00.000Z",
            replayed: false,
          },
          201,
        );
      }
      if (url.includes("/tenants?")) {
        return jsonResponse({
          data: [activeTenant],
          page: { limit: 50, nextCursor: null, hasMore: false },
        });
      }
      if (url.endsWith(`/tenants/${tenant.id}`)) {
        return jsonResponse(activeTenant);
      }
      if (url.includes("/rooms?")) {
        return jsonResponse({ data: [room] });
      }
      return jsonResponse({ error: { message: "Not found" } }, 404);
    });

    render(<TenantsPage />);

    expect((await screen.findAllByText("Đang ở")).length).toBeGreaterThan(0);
    expect(screen.getByText("Tran Thi B")).toBeInTheDocument();
    expect(screen.getByLabelText("Phòng hiện tại")).toBeDisabled();
    expect(screen.getByLabelText("Phòng hiện tại")).toHaveValue(room.id);
    expect(
      screen.queryByRole("button", { name: "Chuyển người này" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Rời phòng" }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Đổi người đại diện" }),
    ).toBeEnabled();

    await user.click(
      screen.getByRole("button", { name: "Đổi người đại diện" }),
    );
    await user.selectOptions(
      screen.getByLabelText("Người đại diện mới"),
      coTenantId,
    );
    await user.click(
      screen.getByRole("button", { name: "Xác nhận đổi đại diện" }),
    );
    await waitFor(() => {
      expect(globalThis.fetch).toHaveBeenCalledWith(
        expect.stringContaining("/change-representative"),
        expect.objectContaining({ method: "POST" }),
      );
    });
  });

  it("shows tenancy credit as read-only in the whole-room close flow", async () => {
    vi.mocked(globalThis.fetch).mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes("/tenants?")) {
        return jsonResponse({
          data: [activeTenant],
          page: { limit: 50, nextCursor: null, hasMore: false },
        });
      }
      if (url.endsWith(`/tenants/${tenant.id}`)) {
        return jsonResponse(activeTenant);
      }
      if (url.includes("/rooms?")) return jsonResponse({ data: [room] });
      if (url.includes("/utility-readings?")) return jsonResponse([]);
      if (url.includes("/receipts?limit=1")) {
        return jsonResponse({
          data: [],
          page: { limit: 1, nextCursor: null, hasMore: false },
          summary: { creditBalance: "230000", receiptCount: 5 },
        });
      }
      return jsonResponse({ error: { message: "Not found" } }, 404);
    });

    const user = userEvent.setup();
    render(<TenantsPage />);

    await user.click(
      await screen.findByRole("button", { name: "Kết thúc thuê" }),
    );

    expect(screen.queryByLabelText("Đã trả trước")).not.toBeInTheDocument();
    expect(await screen.findByText("230.000 VND")).toBeInTheDocument();
    expect(screen.getByText("5 lần thu")).toBeInTheDocument();
  });
});

function jsonResponse(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
