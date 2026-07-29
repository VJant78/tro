import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { UtilitiesPage } from "./utilities-page";

const room = {
  id: "00000000-0000-4000-8000-000000000101",
  code: "A-101",
  name: "Phong A101",
  roomType: null,
  status: "OCCUPIED",
  defaultRentAmount: "3100000",
  defaultBillingCycleType: "MONTHLY",
  defaultBillingCycleCount: 1,
  maxOccupants: 2,
  depositAmount: "500000",
  notes: null,
  currentOccupancy: {
    tenancyId: "00000000-0000-4000-8000-000000000201",
    representativeTenantId: "00000000-0000-4000-8000-000000000301",
    representativeName: "Nguyen Dai Dien",
    startedOn: "2026-08-16",
    memberCount: 1,
    coTenantCount: 0,
    occupants: [],
  },
};

describe("UtilitiesPage", () => {
  beforeEach(() => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      const url = String(input);
      const method = init?.method ?? "GET";

      if (url.includes("/rooms?")) {
        return jsonResponse({
          data: [room],
          page: { limit: 100, nextCursor: null, hasMore: false },
        });
      }

      if (url.endsWith("/settlements") && method === "GET") {
        return jsonResponse([]);
      }

      if (url.includes("/utility-readings?")) {
        return jsonResponse([
          {
            id: "previous-reading",
            roomId: room.id,
            tenancyId: room.currentOccupancy.tenancyId,
            readingKind: "MONTHLY",
            billingPeriodStart: "2026-07-16",
            billingPeriodEnd: "2026-08-15",
            billingYear: 2026,
            billingMonth: 8,
            electricityPrevious: "0",
            electricityCurrent: "10",
            electricityUsage: "10",
            electricityUnitPrice: "3500",
            electricityAmount: "35000",
            waterPrevious: "0",
            waterCurrent: "1",
            waterUsage: "1",
            waterUnitPrice: "15000",
            waterAmount: "15000",
            status: "FINALIZED",
          },
        ]);
      }

      if (url.endsWith("/settlements/preview")) {
        return jsonResponse(
          {
            id: null,
            settlementType: "MONTHLY",
            status: "DRAFT",
            roomId: room.id,
            tenancyId: room.currentOccupancy.tenancyId,
            representativeTenantId:
              room.currentOccupancy.representativeTenantId,
            representativeTenantName: "Nguyen Dai Dien",
            utilityReadingId: null,
            periodStart: "2026-08-16",
            periodEnd: "2026-08-31",
            billingYear: 2026,
            billingMonth: 8,
            occupiedDays: 16,
            daysInMonth: 31,
            rentAmount: "3100000",
            proratedRentAmount: "1600000",
            electricityAmount: "35000",
            waterAmount: "30000",
            totalAmount: "1665000",
            prepaidAppliedAmount: "1665000",
            carryForwardAmount: "335000",
            outstandingAmount: "0",
            creditBalanceBefore: "0",
            newPrepaidAmount: "2000000",
            creditBalanceAfter: "400000",
          },
          201,
        );
      }

      return jsonResponse({ error: { message: "Not found" } }, 404);
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("previews a monthly settlement with carry-forward credit", async () => {
    const user = userEvent.setup();
    render(<UtilitiesPage />);

    expect(
      await screen.findByText("A-101 - Nguyen Dai Dien"),
    ).toBeInTheDocument();
    expect(await screen.findAllByDisplayValue("10")).toHaveLength(2);
    expect(screen.getAllByDisplayValue("1")).toHaveLength(2);

    await user.clear(screen.getByLabelText("Dien moi"));
    await user.type(screen.getByLabelText("Dien moi"), "20");
    await user.clear(screen.getByLabelText("Nuoc moi"));
    await user.type(screen.getByLabelText("Nuoc moi"), "3");
    await user.clear(screen.getByLabelText("Da tra truoc"));
    await user.type(screen.getByLabelText("Da tra truoc"), "2000000");
    await user.click(screen.getByRole("button", { name: "Tinh tam" }));

    expect(await screen.findByText("Du chuyen ky sau")).toBeInTheDocument();
    expect(screen.getByText("335.000 VND")).toBeInTheDocument();
    await waitFor(() => {
      expect(globalThis.fetch).toHaveBeenCalledWith(
        expect.stringContaining("/settlements/preview"),
        expect.objectContaining({ method: "POST" }),
      );
      expect(globalThis.fetch).not.toHaveBeenCalledWith(
        expect.stringContaining("/utility-readings"),
        expect.objectContaining({ method: "POST" }),
      );
    });
  });
});

function jsonResponse(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
