import { moneyString, moneyValue } from "../platform/numeric.js";
import type {
  ReceiptAllocationLine,
  ReceiptInvoiceSnapshot,
} from "./receipt.types.js";

export function allocateReceiptFifo(
  amount: string,
  invoices: ReceiptInvoiceSnapshot[],
) {
  let remaining = moneyValue(amount);
  const allocations: ReceiptAllocationLine[] = [];

  for (const invoice of invoices) {
    if (remaining === 0n) break;
    const outstanding = moneyValue(invoice.outstandingAmount);
    if (outstanding === 0n) continue;
    const allocated = remaining < outstanding ? remaining : outstanding;
    allocations.push({
      invoiceId: invoice.id,
      invoiceNumber: invoice.invoiceNumber,
      billingPeriodStart: invoice.billingPeriodStart,
      billingPeriodEnd: invoice.billingPeriodEnd,
      amount: moneyString(allocated),
    });
    remaining -= allocated;
  }

  return { allocations, creditCreated: moneyString(remaining) };
}
