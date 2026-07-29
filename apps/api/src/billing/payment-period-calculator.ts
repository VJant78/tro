export type PaymentBillingCycleType = "DAILY" | "WEEKLY" | "MONTHLY";

export interface PaymentPeriodInput {
  billingCycleType: PaymentBillingCycleType;
  currentPaidUntil?: string | null;
  tenancyStartDate: string;
  cyclesPaid: number;
  billingAnchorDay?: number | null;
}

export interface PaidUntilBoundaryInput extends PaymentPeriodInput {
  invoiceStatus: "DRAFT" | "ISSUED" | "PARTIALLY_PAID" | "PAID";
}

export function calculatePaidUntil(input: PaymentPeriodInput) {
  if (!Number.isInteger(input.cyclesPaid) || input.cyclesPaid <= 0) {
    throw new Error("cyclesPaid must be a positive integer");
  }
  const base = input.currentPaidUntil ?? input.tenancyStartDate;

  if (input.billingCycleType === "DAILY") {
    return addDays(base, input.cyclesPaid);
  }

  if (input.billingCycleType === "WEEKLY") {
    return addDays(base, input.cyclesPaid * 7);
  }

  const anchorDay =
    input.billingAnchorDay ?? Number(input.tenancyStartDate.slice(8, 10));
  let result = base;
  for (let index = 0; index < input.cyclesPaid; index += 1) {
    result = addAnchoredMonth(result, anchorDay);
  }
  return result;
}

export function calculatePaidUntilAfterInvoice(input: PaidUntilBoundaryInput) {
  if (input.invoiceStatus !== "PAID") {
    return input.currentPaidUntil ?? null;
  }
  return calculatePaidUntil(input);
}

function addDays(value: string, days: number) {
  const date = new Date(`${value}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function addAnchoredMonth(value: string, anchorDay: number) {
  const [yearText, monthText] = value.split("-");
  const monthIndex = Number(monthText) - 1;
  const target = new Date(Date.UTC(Number(yearText), monthIndex + 1, 1));
  const year = target.getUTCFullYear();
  const month = target.getUTCMonth() + 1;
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const day = Math.min(anchorDay, lastDay);
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(
    2,
    "0",
  )}`;
}
