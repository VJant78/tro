import { describe, expect, it } from "vitest";
import { allocateReceiptFifo } from "./receipt-allocator.js";
import type { ReceiptInvoiceSnapshot } from "./receipt.types.js";

describe("receipt FIFO allocator", () => {
  it("allocates the current May and June outstanding before creating credit", () => {
    const result = allocateReceiptFifo("600000", [
      invoice("may", "2026-05-01", "100000"),
      invoice("june", "2026-06-01", "400000"),
    ]);

    expect(result).toEqual({
      allocations: [
        expect.objectContaining({ invoiceId: "may", amount: "100000" }),
        expect.objectContaining({ invoiceId: "june", amount: "400000" }),
      ],
      creditCreated: "100000",
    });
  });

  it("partially pays only the oldest outstanding invoice", () => {
    const result = allocateReceiptFifo("200000", [
      invoice("may", "2026-05-01", "300000"),
      invoice("june", "2026-06-01", "400000"),
    ]);

    expect(result.allocations).toEqual([
      expect.objectContaining({ invoiceId: "may", amount: "200000" }),
    ]);
    expect(result.creditCreated).toBe("0");
  });

  it("creates credit when there is no outstanding invoice", () => {
    expect(allocateReceiptFifo("30000", [])).toEqual({
      allocations: [],
      creditCreated: "30000",
    });
  });
});

function invoice(
  id: string,
  billingPeriodStart: string,
  outstandingAmount: string,
): ReceiptInvoiceSnapshot {
  return {
    id,
    invoiceNumber: `INV-${id}`,
    billingPeriodStart,
    billingPeriodEnd: billingPeriodStart,
    dueOn: billingPeriodStart,
    createdAt: `${billingPeriodStart}T00:00:00.000Z`,
    updatedAt: `${billingPeriodStart}T00:00:00.000Z`,
    outstandingAmount,
  };
}
