import { describe, expect, it } from "vitest";
import {
  calculatePaidUntil,
  calculatePaidUntilAfterInvoice,
} from "./payment-period-calculator.js";

describe("PaymentPeriodCalculator", () => {
  it("advances daily and weekly cycles from paidUntil or tenancy start", () => {
    expect(
      calculatePaidUntil({
        billingCycleType: "DAILY",
        currentPaidUntil: null,
        tenancyStartDate: "2026-08-01",
        cyclesPaid: 1,
      }),
    ).toBe("2026-08-02");
    expect(
      calculatePaidUntil({
        billingCycleType: "DAILY",
        currentPaidUntil: "2026-08-02",
        tenancyStartDate: "2026-08-01",
        cyclesPaid: 10,
      }),
    ).toBe("2026-08-12");
    expect(
      calculatePaidUntil({
        billingCycleType: "WEEKLY",
        currentPaidUntil: null,
        tenancyStartDate: "2026-08-01",
        cyclesPaid: 1,
      }),
    ).toBe("2026-08-08");
    expect(
      calculatePaidUntil({
        billingCycleType: "WEEKLY",
        currentPaidUntil: "2026-08-08",
        tenancyStartDate: "2026-08-01",
        cyclesPaid: 4,
      }),
    ).toBe("2026-09-05");
  });

  it("advances monthly cycles with anchor day instead of fixed 30-day math", () => {
    expect(
      calculatePaidUntil({
        billingCycleType: "MONTHLY",
        tenancyStartDate: "2026-08-15",
        cyclesPaid: 1,
      }),
    ).toBe("2026-09-15");
    expect(
      calculatePaidUntil({
        billingCycleType: "MONTHLY",
        tenancyStartDate: "2026-01-31",
        cyclesPaid: 1,
      }),
    ).toBe("2026-02-28");
    expect(
      calculatePaidUntil({
        billingCycleType: "MONTHLY",
        currentPaidUntil: "2026-02-28",
        tenancyStartDate: "2026-01-31",
        billingAnchorDay: 31,
        cyclesPaid: 1,
      }),
    ).toBe("2026-03-31");
    expect(
      calculatePaidUntil({
        billingCycleType: "MONTHLY",
        tenancyStartDate: "2028-01-31",
        cyclesPaid: 1,
      }),
    ).toBe("2028-02-29");
  });

  it("supports multi-cycle prepayment and keeps partial invoices from advancing paidUntil", () => {
    expect(
      calculatePaidUntil({
        billingCycleType: "MONTHLY",
        tenancyStartDate: "2026-01-31",
        cyclesPaid: 12,
      }),
    ).toBe("2027-01-31");
    expect(
      calculatePaidUntilAfterInvoice({
        billingCycleType: "MONTHLY",
        currentPaidUntil: "2026-08-31",
        tenancyStartDate: "2026-08-01",
        cyclesPaid: 1,
        invoiceStatus: "PARTIALLY_PAID",
      }),
    ).toBe("2026-08-31");
  });
});
