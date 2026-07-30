import type {
  DebtListQuery,
  DebtStatus,
  DebtSummaryRecord,
  InvoiceRecord,
} from "./billing.types.js";

export function buildDebtSummaries(
  invoices: InvoiceRecord[],
  query: DebtListQuery,
) {
  const asOf = query.asOf ?? new Date().toISOString().slice(0, 10);
  const debts = new Map<string, DebtSummaryRecord>();

  for (const invoice of invoices) {
    if (
      invoice.status === "PAID" ||
      invoice.status === "CANCELLED" ||
      Number(invoice.outstandingAmount) <= 0 ||
      (query.roomId && invoice.roomId !== query.roomId) ||
      (query.payerTenantId && invoice.payerTenantId !== query.payerTenantId)
    ) {
      continue;
    }

    const key = `${invoice.roomId}:${invoice.payerTenantId ?? "unknown"}`;
    const current =
      debts.get(key) ??
      ({
        roomId: invoice.roomId,
        roomCode: invoice.roomCode,
        payerTenantId: invoice.payerTenantId,
        payerTenantName: invoice.payerTenantName,
        debtStatus: "OUTSTANDING",
        invoiceCount: 0,
        totalOutstanding: "0",
        nearestDueOn: null,
        daysOverdue: 0,
        latestPaymentAt: null,
        invoices: [],
      } satisfies DebtSummaryRecord);

    current.invoiceCount += 1;
    current.totalOutstanding = String(
      Number(current.totalOutstanding) + Number(invoice.outstandingAmount),
    );
    current.nearestDueOn = nearestDate(current.nearestDueOn, invoice.dueOn);
    current.daysOverdue = Math.max(
      current.daysOverdue,
      daysBetween(invoice.dueOn, asOf),
      0,
    );
    current.latestPaymentAt = latestDate(
      current.latestPaymentAt,
      latestPaymentAtFor(invoice),
    );
    current.invoices.push(invoice);
    current.debtStatus = statusFor(current, asOf);
    debts.set(key, current);
  }

  return [...debts.values()]
    .filter((debt) => !query.status || matchesStatus(debt, query.status))
    .sort((left, right) => {
      if (left.daysOverdue !== right.daysOverdue) {
        return right.daysOverdue - left.daysOverdue;
      }
      return Number(right.totalOutstanding) - Number(left.totalOutstanding);
    });
}

function statusFor(debt: DebtSummaryRecord, asOf: string): DebtStatus {
  if (debt.daysOverdue > 0) return "OVERDUE";
  if (debt.invoices.some((invoice) => invoice.dueOn === asOf)) {
    return "DUE_TODAY";
  }
  if (debt.invoices.some((invoice) => invoice.status === "PARTIALLY_PAID")) {
    return "PARTIALLY_PAID";
  }
  return "OUTSTANDING";
}

function matchesStatus(debt: DebtSummaryRecord, status: DebtStatus) {
  if (status === "PARTIALLY_PAID") {
    return debt.invoices.some((invoice) => invoice.status === status);
  }
  return debt.debtStatus === status;
}

function latestPaymentAtFor(invoice: InvoiceRecord) {
  return (
    invoice.paymentAllocations
      .map((allocation) => allocation.paidAt ?? allocation.allocatedAt)
      .filter(Boolean)
      .sort()
      .at(-1) ?? null
  );
}

function nearestDate(left: string | null, right: string | null) {
  if (!right) return left;
  if (!left) return right;
  return left <= right ? left : right;
}

function latestDate(left: string | null, right: string | null) {
  if (!right) return left;
  if (!left) return right;
  return left >= right ? left : right;
}

function daysBetween(start: string, end: string) {
  const startDate = Date.parse(`${start}T00:00:00.000Z`);
  const endDate = Date.parse(`${end}T00:00:00.000Z`);
  return Math.floor((endDate - startDate) / 86_400_000);
}
