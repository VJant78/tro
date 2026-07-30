import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RoomsPage } from "./rooms-page";

const room = {
  id: "00000000-0000-4000-8000-000000000101",
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

describe("RoomsPage", () => {
  beforeEach(() => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      const url = String(input);
      const method = init?.method ?? "GET";

      if (url.includes("/rooms?")) {
        return jsonResponse({
          data: [room],
          page: { limit: 50, nextCursor: null, hasMore: false },
        });
      }

      if (url.endsWith("/rooms") && method === "POST") {
        return jsonResponse(
          { ...room, code: "B-202", name: "Phong B202" },
          201,
        );
      }

      return jsonResponse({ error: { message: "Not found" } }, 404);
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders rooms and submits create form", async () => {
    const user = userEvent.setup();
    render(<RoomsPage />);

    expect(await screen.findByText("A-101")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Tạo phòng" }));
    await user.type(screen.getByLabelText("Mã phòng"), "B-202");
    await user.type(screen.getByLabelText("Tên phòng"), "Phong B202");
    await user.click(
      screen.getAllByRole("button", { name: "Tạo phòng" }).at(-1)!,
    );

    await waitFor(() => {
      expect(globalThis.fetch).toHaveBeenCalledWith(
        expect.stringContaining("/rooms"),
        expect.objectContaining({ method: "POST" }),
      );
    });
  });

  it("shows API errors", async () => {
    vi.mocked(globalThis.fetch).mockResolvedValueOnce(
      jsonResponse(
        {
          error: {
            code: "AUTHENTICATION_REQUIRED",
            message: "Authentication required",
          },
        },
        401,
      ),
    );

    render(<RoomsPage />);

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.",
    );
  });

  it("opens receipt history from an occupied room", async () => {
    const occupiedRoom = {
      ...room,
      status: "OCCUPIED",
      currentOccupancy: {
        tenancyId: "tenancy-1",
        representativeTenantId: "tenant-1",
        representativeName: "Nguyen Van A",
        startedOn: "2026-07-01",
        memberCount: 1,
        coTenantCount: 0,
        occupants: [
          {
            tenantId: "tenant-1",
            fullName: "Nguyen Van A",
            phone: null,
            role: "REPRESENTATIVE",
            joinedOn: "2026-07-01",
          },
        ],
      },
    };
    vi.mocked(globalThis.fetch).mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes("/rooms?")) {
        return jsonResponse({
          data: [occupiedRoom],
          page: { limit: 50, nextCursor: null, hasMore: false },
        });
      }
      if (url.includes("/tenancies/tenancy-1/receipts?")) {
        return jsonResponse({
          data: [],
          page: { limit: 20, nextCursor: null, hasMore: false },
        });
      }
      return jsonResponse({ error: { message: "Not found" } }, 404);
    });

    const user = userEvent.setup();
    render(<RoomsPage />);

    await user.click(
      await screen.findByRole("button", { name: "Lịch sử thu" }),
    );
    expect(await screen.findByRole("dialog")).toHaveTextContent(
      "Chưa có lần thu tiền",
    );
  });
});

function jsonResponse(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
