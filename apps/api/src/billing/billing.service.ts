import { Inject, Injectable } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { AuditService } from "../audit/audit.service.js";
import { RoomsService } from "../rooms/rooms.service.js";
import { UtilitiesService } from "../utilities/utilities.service.js";
import {
  BillingRoomNotFoundException,
  BillingValidationException,
  InvoiceNotFoundException,
  SettlementInvoiceNotFoundException,
} from "./billing.errors.js";
import { BILLING_REPOSITORY } from "./billing.tokens.js";
import type {
  BillingRepository,
  DebtListQuery,
  DashboardSummaryRecord,
  InvoiceCreateInput,
  InvoiceListQuery,
  PaymentCreateInput,
  PaymentListQuery,
} from "./billing.types.js";

@Injectable()
export class BillingService {
  constructor(
    @Inject(BILLING_REPOSITORY) private readonly billing: BillingRepository,
    @Inject(UtilitiesService) private readonly utilities: UtilitiesService,
    @Inject(RoomsService) private readonly rooms: RoomsService,
    @Inject(AuditService) private readonly audit: AuditService,
  ) {}

  listInvoices(query: InvoiceListQuery) {
    return this.billing.listInvoices(query);
  }

  async findInvoiceById(id: string) {
    const invoice = await this.billing.findInvoiceById(id);
    if (!invoice) throw new InvoiceNotFoundException();
    return invoice;
  }

  async createInvoiceFromSettlement(
    settlementId: string,
    actorUserId?: string,
  ) {
    const sourceKey = `settlement:${settlementId}`;
    const existing = await this.billing.findInvoiceBySourceKey(sourceKey);
    if (existing) return existing;

    const settlement = await this.utilities.findSettlementById(settlementId);
    if (!settlement) throw new SettlementInvoiceNotFoundException();
    if (settlement.status !== "FINALIZED") {
      throw new BillingValidationException(
        "Only finalized settlements can be converted to invoices",
      );
    }
    const room = await this.rooms.findById(settlement.roomId);
    if (!room) throw new BillingRoomNotFoundException();

    const totalAmount = Math.max(0, Number(settlement.outstandingAmount));
    const invoice = await this.billing.createInvoice({
      invoiceNumber: invoiceNumberFor(settlement.periodEnd),
      propertyId: room.propertyId,
      roomId: settlement.roomId,
      tenancyId: settlement.tenancyId,
      payerTenantId: settlement.representativeTenantId,
      invoiceType: "COMBINED",
      status: totalAmount > 0 ? "ISSUED" : "PAID",
      billingPeriodStart: settlement.periodStart,
      billingPeriodEnd: settlement.periodEnd,
      billingYear: settlement.billingYear,
      billingMonth: settlement.billingMonth,
      issuedOn: todayDate(),
      dueOn: dueDateFor(settlement.periodEnd),
      totalAmount: String(totalAmount),
      paidAmount: totalAmount > 0 ? "0" : String(totalAmount),
      outstandingAmount: String(totalAmount),
      sourceKey,
      pricingSnapshot: {
        settlementId: settlement.id,
        rentAmount: settlement.rentAmount,
        occupiedDays: settlement.occupiedDays,
        daysInMonth: settlement.daysInMonth,
        prepaidAppliedAmount: settlement.prepaidAppliedAmount,
        carryForwardAmount: settlement.carryForwardAmount,
      },
      notes: settlement.notes,
      items: invoiceItemsForSettlement(settlement),
    });

    await this.audit.record({
      action: "ISSUE_INVOICE",
      entityType: "invoice",
      entityId: invoice.id,
      actorUserId,
      newValues: invoice,
      metadata: { sourceKey, settlementId },
    });
    return invoice;
  }

  listPayments(query: PaymentListQuery) {
    return this.billing.listPayments(query);
  }

  async createPayment(
    input: Omit<PaymentCreateInput, "paymentNumber">,
    actorUserId?: string,
  ) {
    if (input.idempotencyKey) {
      const duplicate = await this.billing.findPaymentByIdempotencyKey(
        input.idempotencyKey,
      );
      if (duplicate) return duplicate;
    }

    const invoice = await this.findInvoiceById(input.invoiceId);
    if (invoice.status === "CANCELLED") {
      throw new BillingValidationException("Cannot pay a cancelled invoice");
    }
    if (invoice.status === "PAID" || Number(invoice.outstandingAmount) <= 0) {
      throw new BillingValidationException("Invoice is already paid");
    }
    if (Number(input.amount) > Number(invoice.outstandingAmount)) {
      throw new BillingValidationException(
        "Payment amount cannot exceed invoice outstanding amount",
      );
    }

    const result = await this.billing.createPayment({
      ...input,
      paymentNumber: paymentNumberFor(input.paidAt),
      paidAt: input.paidAt,
      method: input.method,
      description: `Thanh toan hoa don ${invoice.invoiceNumber}`,
    });
    await this.audit.record({
      action: "CONFIRM_PAYMENT",
      entityType: "payment",
      entityId: result.payment.id,
      actorUserId,
      newValues: result.payment,
      metadata: { invoiceId: invoice.id },
    });
    return result.payment;
  }

  listDebts(query: DebtListQuery) {
    return this.billing.listDebts(query);
  }

  async dashboardSummary(query: { asOf?: string }) {
    const asOf = query.asOf ?? todayDate();
    const { year, month } = yearMonthFor(asOf);
    const monthStart = `${year}-${String(month).padStart(2, "0")}-01`;
    const monthEnd = `${year}-${String(month).padStart(2, "0")}-${String(
      daysInMonthFor(year, month),
    ).padStart(2, "0")}`;
    const [rooms, invoices, payments, overdueDebts] = await Promise.all([
      this.rooms.list({ limit: 100, sort: "code:asc" }),
      this.billing.listInvoices({ billingYear: year, billingMonth: month }),
      this.billing.listPayments({ paidFrom: monthStart, paidTo: monthEnd }),
      this.billing.listDebts({ status: "OVERDUE", asOf }),
    ]);
    const activeInvoices = invoices.filter(
      (invoice) => invoice.status !== "CANCELLED",
    );
    const summary: DashboardSummaryRecord = {
      asOf,
      billingYear: year,
      billingMonth: month,
      totals: {
        rooms: rooms.data.length,
        occupiedRooms: rooms.data.filter((room) => room.currentOccupancy)
          .length,
        currentMonthCollectable: sumMoney(
          activeInvoices.map((invoice) => invoice.totalAmount),
        ),
        currentMonthCollected: sumMoney(
          payments
            .filter((payment) => payment.status === "CONFIRMED")
            .map((payment) => payment.amount),
        ),
        currentMonthOutstanding: sumMoney(
          activeInvoices.map((invoice) => invoice.outstandingAmount),
        ),
        overdueInvoiceCount: overdueDebts.reduce(
          (total, debt) => total + debt.invoiceCount,
          0,
        ),
        overdueAmount: sumMoney(
          overdueDebts.map((debt) => debt.totalOutstanding),
        ),
      },
      needsAttention: overdueDebts.slice(0, 8).map((debt) => ({
        kind: "OVERDUE_DEBT",
        roomId: debt.roomId,
        roomCode: debt.roomCode,
        payerTenantId: debt.payerTenantId,
        payerTenantName: debt.payerTenantName,
        totalOutstanding: debt.totalOutstanding,
        daysOverdue: debt.daysOverdue,
        nearestDueOn: debt.nearestDueOn,
      })),
    };
    return summary;
  }
}

function invoiceItemsForSettlement(settlement: {
  id: string;
  billingYear: number;
  billingMonth: number;
  occupiedDays: number;
  daysInMonth: number;
  proratedRentAmount: string;
  electricityAmount: string;
  waterAmount: string;
  prepaidAppliedAmount: string;
}): InvoiceCreateInput["items"] {
  const items: InvoiceCreateInput["items"] = [
    {
      itemType: "RENT" as const,
      description: `Tien phong thang ${settlement.billingMonth}/${settlement.billingYear}`,
      quantity: String(settlement.occupiedDays),
      unit: "ngay",
      unitPrice: String(
        Math.round(
          Number(settlement.proratedRentAmount) / settlement.occupiedDays,
        ),
      ),
      amount: settlement.proratedRentAmount,
      sortOrder: 10,
      metadata: { settlementId: settlement.id },
    },
    {
      itemType: "ELECTRICITY" as const,
      description: "Tien dien",
      quantity: "1",
      unit: "ky",
      unitPrice: settlement.electricityAmount,
      amount: settlement.electricityAmount,
      sortOrder: 20,
      metadata: { settlementId: settlement.id },
    },
    {
      itemType: "WATER" as const,
      description: "Tien nuoc",
      quantity: "1",
      unit: "ky",
      unitPrice: settlement.waterAmount,
      amount: settlement.waterAmount,
      sortOrder: 30,
      metadata: { settlementId: settlement.id },
    },
  ];
  if (Number(settlement.prepaidAppliedAmount) > 0) {
    items.push({
      itemType: "DISCOUNT",
      description: "Tien tra truoc da tru",
      quantity: "1",
      unit: "ky",
      unitPrice: `-${settlement.prepaidAppliedAmount}`,
      amount: `-${settlement.prepaidAppliedAmount}`,
      sortOrder: 40,
      metadata: { settlementId: settlement.id },
    });
  }
  return items;
}

function dueDateFor(periodEnd: string) {
  const date = new Date(`${periodEnd}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + 5);
  return date.toISOString().slice(0, 10);
}

function todayDate() {
  return new Date().toISOString().slice(0, 10);
}

function yearMonthFor(value: string) {
  const [yearText, monthText] = value.split("-");
  return {
    year: Number(yearText),
    month: Number(monthText),
  };
}

function daysInMonthFor(year: number, month: number) {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function sumMoney(values: string[]) {
  return String(values.reduce((total, value) => total + Number(value), 0));
}

function invoiceNumberFor(periodEnd: string) {
  return `INV-${periodEnd.replaceAll("-", "")}-${randomUUID()
    .slice(0, 8)
    .toUpperCase()}`;
}

function paymentNumberFor(paidAt: string) {
  return `PAY-${paidAt.slice(0, 10).replaceAll("-", "")}-${randomUUID()
    .slice(0, 8)
    .toUpperCase()}`;
}
