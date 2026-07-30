import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DebtsPage } from "./debts-page";

const roomId = "00000000-0000-4000-8000-000000000101";
const payerTenantId = "00000000-0000-4000-8000-000000000301";

describe("DebtsPage", () => {
  beforeEach(() => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      const url = String(input);
      const method = init?.method ?? "GET";

      if (url.includes("/debts")) {
        return jsonResponse([
          {
            roomId,
            roomCode: "A-101",
            payerTenantId,
            payerTenantName: "Nguyen Dai Dien",
            debtStatus: "OVERDUE",
            invoiceCount: 1,
            totalOutstanding: "2065000",
            nearestDueOn: "2026-07-05",
            daysOverdue: 25,
            latestPaymentAt: "2026-07-20T00:00:00.000Z",
            invoices: [
              {
                id: "invoice-1",
                invoiceNumber: "INV-20260630-ABC",
                roomId,
                roomCode: "A-101",
                payerTenantId,
                payerTenantName: "Nguyen Dai Dien",
                status: "PARTIALLY_PAID",
                billingPeriodStart: "2026-06-01",
                billingPeriodEnd: "2026-06-30",
                issuedOn: "2026-07-01",
                dueOn: "2026-07-05",
                totalAmount: "3065000",
                paidAmount: "1000000",
                outstandingAmount: "2065000",
                sourceKey: "settlement:settlement-1",
                notes: null,
                items: [],
                paymentAllocations: [
                  {
                    id: "allocation-1",
                    paymentId: "payment-1",
                    invoiceId: "invoice-1",
                    amount: "1000000",
                    allocatedAt: "2026-07-20T00:00:00.000Z",
                    paymentNumber: "PAY-20260720-ABC",
                    paymentMethod: "CASH",
                    paymentStatus: "CONFIRMED",
                    paidAt: "2026-07-20T00:00:00.000Z",
                  },
                ],
              },
            ],
          },
        ]);
      }

      if (url.includes("/rooms?")) {
        return jsonResponse({
          data: [
            {
              id: roomId,
              code: "A-101",
              name: "Phong A101",
              roomType: null,
              status: "OCCUPIED",
              defaultRentAmount: "3000000",
              defaultBillingCycleType: "MONTHLY",
              defaultBillingCycleCount: 1,
              maxOccupants: 2,
              depositAmount: "0",
              notes: null,
              currentOccupancy: null,
            },
          ],
          page: { limit: 100, nextCursor: null, hasMore: false },
        });
      }

      if (url.includes("/tenants?")) {
        return jsonResponse({
          data: [
            {
              id: payerTenantId,
              fullName: "Nguyen Dai Dien",
              phone: null,
              identityNumber: null,
              permanentAddress: null,
              emergencyContactName: null,
              emergencyContactPhone: null,
              notes: null,
              status: "ACTIVE",
              currentTenancy: null,
            },
          ],
          page: { limit: 100, nextCursor: null, hasMore: false },
        });
      }

      if (url.endsWith("/payments") && method === "POST") {
        return jsonResponse({ id: "payment-2" }, 201);
      }

      return jsonResponse({ error: { message: "Not found" } }, 404);
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("filters debts, shows payment history and records quick payment", async () => {
    const user = userEvent.setup();
    render(<DebtsPage />);

    expect(await screen.findAllByText("Phong A-101")).toHaveLength(2);
    expect(screen.getAllByText("Qua han 25 ngay")).toHaveLength(2);
    expect(screen.getByText("PAY-20260720-ABC")).toBeInTheDocument();
    expect(screen.getAllByText("2.065.000 VND").length).toBeGreaterThanOrEqual(
      3,
    );

    await user.selectOptions(
      screen.getByLabelText("Loc trang thai"),
      "OVERDUE",
    );
    await user.click(screen.getByRole("button", { name: "Loc" }));
    await waitFor(() => {
      expect(globalThis.fetch).toHaveBeenCalledWith(
        expect.stringContaining("/debts?status=OVERDUE"),
        expect.objectContaining({ credentials: "include" }),
      );
    });

    await user.clear(screen.getByLabelText("So tien thu"));
    await user.type(screen.getByLabelText("So tien thu"), "500000");
    await user.click(screen.getByRole("button", { name: "Thu nhanh" }));
    await waitFor(() => {
      expect(globalThis.fetch).toHaveBeenCalledWith(
        expect.stringContaining("/payments"),
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
