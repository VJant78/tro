import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { InvoicesPage } from "./invoices-page";

const settlement = {
  id: "00000000-0000-4000-8000-000000000901",
  settlementType: "MONTHLY",
  status: "FINALIZED",
  roomId: "00000000-0000-4000-8000-000000000101",
  tenancyId: "00000000-0000-4000-8000-000000000201",
  representativeTenantId: "00000000-0000-4000-8000-000000000301",
  representativeTenantName: "Nguyen Dai Dien",
  utilityReadingId: "00000000-0000-4000-8000-000000000401",
  periodStart: "2026-08-01",
  periodEnd: "2026-08-31",
  billingYear: 2026,
  billingMonth: 8,
  occupiedDays: 31,
  daysInMonth: 31,
  rentAmount: "3000000",
  proratedRentAmount: "3000000",
  electricityAmount: "35000",
  waterAmount: "30000",
  totalAmount: "3065000",
  prepaidAppliedAmount: "0",
  carryForwardAmount: "0",
  outstandingAmount: "3065000",
};

const invoice = {
  id: "00000000-0000-4000-8000-000000000902",
  invoiceNumber: "INV-20260831-ABC",
  roomId: settlement.roomId,
  roomCode: "A-101",
  tenancyId: settlement.tenancyId,
  payerTenantId: settlement.representativeTenantId,
  payerTenantName: "Nguyen Dai Dien",
  status: "ISSUED",
  billingPeriodStart: "2026-08-01",
  billingPeriodEnd: "2026-08-31",
  issuedOn: "2026-09-01",
  dueOn: "2026-09-05",
  totalAmount: "3065000",
  paidAmount: "0",
  outstandingAmount: "3065000",
  sourceKey: `settlement:${settlement.id}`,
  notes: null,
  items: [
    {
      id: "item-rent",
      invoiceId: "00000000-0000-4000-8000-000000000902",
      itemType: "RENT",
      description: "Tien phong thang 8/2026",
      quantity: "31",
      unit: "ngay",
      unitPrice: "96774",
      amount: "3000000",
      sortOrder: 10,
    },
  ],
};

describe("InvoicesPage", () => {
  beforeEach(() => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      const url = String(input);
      const method = init?.method ?? "GET";

      if (url.endsWith("/settlements")) return jsonResponse([settlement]);
      if (url.endsWith("/invoices") && method === "GET") {
        return jsonResponse([invoice]);
      }
      if (url.includes("/rooms?")) {
        return jsonResponse({
          data: [
            {
              id: settlement.roomId,
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
      if (url.endsWith("/invoices/from-settlement")) {
        return jsonResponse(invoice, 201);
      }
      if (url.endsWith("/payments")) {
        return jsonResponse(
          {
            id: "payment-1",
            paymentNumber: "PAY-20260901-ABC",
            amount: "1000000",
            method: "CASH",
            status: "CONFIRMED",
            paidAt: "2026-09-01T00:00:00.000Z",
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

  it("creates an invoice from a finalized settlement and records payment", async () => {
    const user = userEvent.setup();
    render(<InvoicesPage />);

    expect(await screen.findAllByText("INV-20260831-ABC")).toHaveLength(2);
    expect(
      screen.getByText("Phong A-101 - 1/8/2026 den 31/8/2026"),
    ).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Tao hoa don" }));
    await waitFor(() => {
      expect(globalThis.fetch).toHaveBeenCalledWith(
        expect.stringContaining("/invoices/from-settlement"),
        expect.objectContaining({ method: "POST" }),
      );
    });

    await user.clear(screen.getByLabelText("So tien thu"));
    await user.type(screen.getByLabelText("So tien thu"), "1000000");
    await user.click(
      screen.getByRole("button", { name: "Ghi nhan thanh toan" }),
    );
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
