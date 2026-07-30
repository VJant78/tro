import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DashboardPage } from "./dashboard-page";

describe("DashboardPage", () => {
  beforeEach(() => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      jsonResponse({
        asOf: "2026-07-30",
        billingYear: 2026,
        billingMonth: 7,
        totals: {
          rooms: 10,
          occupiedRooms: 8,
          currentMonthCollectable: "5000000",
          currentMonthCollected: "2500000",
          currentMonthOutstanding: "1500000",
          overdueInvoiceCount: 2,
          overdueAmount: "900000",
        },
        needsAttention: [
          {
            kind: "OVERDUE_DEBT",
            roomId: "00000000-0000-4000-8000-000000000101",
            roomCode: "A-101",
            payerTenantId: "00000000-0000-4000-8000-000000000301",
            payerTenantName: "Nguyen Dai Dien",
            totalOutstanding: "900000",
            daysOverdue: 5,
            nearestDueOn: "2026-07-25",
          },
        ],
      }),
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("shows operational KPIs and overdue attention list", async () => {
    render(<DashboardPage />);

    expect(await screen.findByText("Thang 7/2026")).toBeInTheDocument();
    expect(screen.getByText("10")).toBeInTheDocument();
    expect(screen.getByText("8")).toBeInTheDocument();
    expect(screen.getByText("5.000.000 VND")).toBeInTheDocument();
    expect(screen.getByText("Phong A-101")).toBeInTheDocument();
    expect(screen.getByText(/qua han 5 ngay/)).toBeInTheDocument();
    expect(globalThis.fetch).toHaveBeenCalledWith(
      expect.stringContaining("/dashboard/summary"),
      expect.objectContaining({ credentials: "include" }),
    );
  });
});

function jsonResponse(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
