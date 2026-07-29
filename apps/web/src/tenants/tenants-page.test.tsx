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
          tenantId: "00000000-0000-4000-8000-000000000302",
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

    expect(await screen.findByText("Nguyen Van A")).toBeInTheDocument();
    expect(screen.getByText("Chua vao phong")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Tao ho so" }));
    await user.type(screen.getByLabelText("Ho ten"), "Tran Thi B");
    await user.click(screen.getByRole("button", { name: "Tao" }));

    await waitFor(() => {
      expect(globalThis.fetch).toHaveBeenCalledWith(
        expect.stringContaining("/tenants"),
        expect.objectContaining({ method: "POST" }),
      );
    });
  });

  it("shows current room details and co-tenants", async () => {
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
      if (url.includes("/rooms?")) {
        return jsonResponse({ data: [room] });
      }
      return jsonResponse({ error: { message: "Not found" } }, 404);
    });

    render(<TenantsPage />);

    expect((await screen.findAllByText("Dang o")).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Phong A-101/).length).toBeGreaterThan(0);
    expect(screen.getByText("Tran Thi B")).toBeInTheDocument();
    expect(screen.getByLabelText("Phong")).toBeDisabled();
    expect(screen.getByLabelText("Phong")).toHaveValue(room.id);
    expect(screen.getByLabelText("Ngay bat dau")).toBeDisabled();
    expect(screen.getByLabelText("Ngay bat dau")).toHaveValue("2026-08-01");
    expect(
      screen.getByRole("button", { name: "Chuyen nguoi nay" }),
    ).toBeDisabled();
    expect(screen.getByRole("button", { name: "Roi phong" })).toBeDisabled();
  });
});

function jsonResponse(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
