import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DebtsPage } from "./debts-page";

describe("DebtsPage", () => {
  beforeEach(() => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      jsonResponse([
        {
          roomId: "00000000-0000-4000-8000-000000000101",
          roomCode: "A-101",
          payerTenantId: "00000000-0000-4000-8000-000000000301",
          payerTenantName: "Nguyen Dai Dien",
          invoiceCount: 1,
          totalOutstanding: "2065000",
          invoices: [
            {
              id: "invoice-1",
              invoiceNumber: "INV-20260831-ABC",
              billingPeriodStart: "2026-08-01",
              billingPeriodEnd: "2026-08-31",
              outstandingAmount: "2065000",
            },
          ],
        },
      ]),
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("shows debt totals grouped by room and representative tenant", async () => {
    render(<DebtsPage />);

    expect(await screen.findByText("Phong A-101")).toBeInTheDocument();
    expect(screen.getByText("Nguyen Dai Dien")).toBeInTheDocument();
    expect(screen.getAllByText("2.065.000 VND")).toHaveLength(2);
    expect(globalThis.fetch).toHaveBeenCalledWith(
      expect.stringContaining("/debts"),
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
