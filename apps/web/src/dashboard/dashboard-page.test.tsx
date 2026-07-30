import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DashboardPage } from "./dashboard-page";

describe("DashboardPage", () => {
  beforeEach(() => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      if (String(input).includes("/dashboard/actions")) {
        return jsonResponse({
          asOf: "2026-07-30",
          dueSoonDays: 3,
          items: [
            {
              id: "OVERDUE:invoice-1",
              kind: "OVERDUE",
              roomId: "00000000-0000-4000-8000-000000000101",
              roomCode: "A-101",
              periodStart: "2026-07-01",
              periodEnd: "2026-07-31",
              dueOn: "2026-07-25",
              amount: "900000",
              target: {
                route: "/invoices",
                params: { invoiceId: "invoice-1" },
              },
            },
          ],
        });
      }
      return jsonResponse({
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
      });
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("shows operational KPIs and overdue attention list", async () => {
    render(<DashboardPage />);

    expect(await screen.findByText("Tháng 7/2026")).toBeInTheDocument();
    expect(screen.getByText("10")).toBeInTheDocument();
    expect(screen.getByText("8")).toBeInTheDocument();
    expect(screen.getByText("5.000.000 VND")).toBeInTheDocument();
    expect(screen.getByText("Phòng A-101")).toBeInTheDocument();
    expect(screen.getByText("Quá hạn")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Xử lý" })).toHaveAttribute(
      "href",
      "/invoices?invoiceId=invoice-1",
    );
    expect(globalThis.fetch).toHaveBeenCalledWith(
      expect.stringContaining("/dashboard/summary"),
      expect.objectContaining({ credentials: "include" }),
    );
    expect(globalThis.fetch).toHaveBeenCalledWith(
      expect.stringContaining("/dashboard/actions"),
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
