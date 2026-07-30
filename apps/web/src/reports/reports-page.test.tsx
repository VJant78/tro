import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ReportsPage } from "./reports-page";

describe("ReportsPage", () => {
  beforeEach(() => {
    vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:report");
    vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(
      () => undefined,
    );
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes("/reports/monthly.csv")) {
        return new Response("Loai,Ma\r\nHoa don,INV-1", {
          status: 200,
          headers: { "Content-Type": "text/csv" },
        });
      }
      if (url.includes("/reports/monthly")) {
        return jsonResponse({
          billingYear: 2026,
          billingMonth: 7,
          periodStart: "2026-07-01",
          periodEnd: "2026-07-31",
          totals: {
            invoiceTotal: "3065000",
            collected: "1000000",
            outstanding: "2065000",
            overdue: "2065000",
            electricity: "35000",
            water: "30000",
          },
          invoices: [
            {
              id: "invoice-1",
              invoiceNumber: "INV-20260731-ABC",
              roomId: "00000000-0000-4000-8000-000000000101",
              roomCode: "A-101",
              payerTenantId: "00000000-0000-4000-8000-000000000301",
              payerTenantName: "Nguyen Dai Dien",
              status: "PARTIALLY_PAID",
              billingPeriodStart: "2026-07-01",
              billingPeriodEnd: "2026-07-31",
              issuedOn: "2026-07-31",
              dueOn: "2026-08-05",
              totalAmount: "3065000",
              paidAmount: "1000000",
              outstandingAmount: "2065000",
              sourceKey: "settlement:settlement-1",
              notes: null,
              items: [],
              paymentAllocations: [],
            },
          ],
          payments: [
            {
              id: "payment-1",
              paymentNumber: "PAY-20260720-ABC",
              roomId: "00000000-0000-4000-8000-000000000101",
              roomCode: "A-101",
              payerTenantId: "00000000-0000-4000-8000-000000000301",
              payerTenantName: "Nguyen Dai Dien",
              amount: "1000000",
              method: "CASH",
              status: "CONFIRMED",
              paidAt: "2026-07-20T00:00:00.000Z",
            },
          ],
          debts: [
            {
              roomId: "00000000-0000-4000-8000-000000000101",
              roomCode: "A-101",
              payerTenantId: "00000000-0000-4000-8000-000000000301",
              payerTenantName: "Nguyen Dai Dien",
              debtStatus: "OVERDUE",
              invoiceCount: 1,
              totalOutstanding: "2065000",
              nearestDueOn: "2026-08-05",
              daysOverdue: 3,
              latestPaymentAt: "2026-07-20T00:00:00.000Z",
              invoices: [],
            },
          ],
        });
      }
      return jsonResponse({ error: { message: "Not found" } }, 404);
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("shows monthly report data and downloads CSV", async () => {
    const user = userEvent.setup();
    render(<ReportsPage />);

    expect(
      await screen.findByText("Ky 1/7/2026 - 31/7/2026"),
    ).toBeInTheDocument();
    expect(screen.getByText("INV-20260731-ABC")).toBeInTheDocument();
    expect(screen.getByText("PAY-20260720-ABC")).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Cong no trong ky" }),
    ).toBeInTheDocument();
    expect(screen.getAllByText("Qua han")).toHaveLength(2);
    expect(screen.getAllByText("3.065.000 VND")).toHaveLength(2);

    await user.click(screen.getByRole("button", { name: "Tai CSV" }));
    await waitFor(() => {
      expect(globalThis.fetch).toHaveBeenCalledWith(
        expect.stringContaining("/reports/monthly.csv"),
        expect.objectContaining({ credentials: "include" }),
      );
      expect(screen.getByText("Da tao file CSV")).toBeInTheDocument();
    });
  });
});

function jsonResponse(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
