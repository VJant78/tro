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
      if (url.includes("/rooms?")) {
        return jsonResponse({
          data: [
            {
              id: "00000000-0000-4000-8000-000000000101",
              code: "A-101",
              name: "Phòng A-101",
            },
          ],
          page: { limit: 100, nextCursor: null, hasMore: false },
        });
      }
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
            grossBilled: "3065000",
            cashReceived: "1200000",
            cashReversed: "-200000",
            creditApplied: "400000",
            netOutstanding: "1665000",
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
              status: "CANCELLED",
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
      await screen.findByText("Kỳ 1/7/2026 - 31/7/2026"),
    ).toBeInTheDocument();
    expect(screen.getByText("INV-20260731-ABC")).toBeInTheDocument();
    expect(
      screen.getByRole("link", {
        name: "Xem hóa đơn Phòng A-101 tháng 7/2026",
      }),
    ).toHaveAttribute("href", "/invoices?invoiceId=invoice-1");
    expect(screen.getByText("Đã hủy")).toBeInTheDocument();
    expect(screen.getByText("PAY-20260720-ABC")).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Công nợ trong kỳ" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Quá hạn")).toBeInTheDocument();
    expect(screen.getAllByText("3.065.000 VND")).toHaveLength(2);
    expect(
      screen.getByRole("article", { name: "Tiền thực thu" }),
    ).toHaveTextContent("1.200.000 VND");
    expect(
      screen.getByRole("article", { name: "Tiền đã đảo" }),
    ).toHaveTextContent("-200.000 VND");
    expect(
      screen.getByRole("article", { name: "Credit đã áp dụng" }),
    ).toHaveTextContent("400.000 VND");
    expect(
      screen.getByRole("article", { name: "Công nợ ròng" }),
    ).toHaveTextContent("1.665.000 VND");

    await user.selectOptions(
      screen.getByRole("combobox", { name: "Phòng" }),
      "00000000-0000-4000-8000-000000000101",
    );
    await user.click(screen.getByRole("button", { name: "Xem báo cáo" }));
    await waitFor(() => {
      expect(globalThis.fetch).toHaveBeenCalledWith(
        expect.stringMatching(
          /\/reports\/monthly\?.*roomId=00000000-0000-4000-8000-000000000101/,
        ),
        expect.anything(),
      );
    });

    await user.click(screen.getByRole("button", { name: "Tải CSV" }));
    await waitFor(() => {
      expect(globalThis.fetch).toHaveBeenCalledWith(
        expect.stringMatching(
          /\/reports\/monthly\.csv\?.*roomId=00000000-0000-4000-8000-000000000101/,
        ),
        expect.objectContaining({ credentials: "include" }),
      );
      expect(screen.getByText("Đã tạo file CSV")).toBeInTheDocument();
    });
  });
});

function jsonResponse(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
