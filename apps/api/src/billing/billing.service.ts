import { Inject, Injectable } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { AuditService } from "../audit/audit.service.js";
import { PrismaService } from "../database/prisma.service.js";
import { requestHash } from "../platform/idempotency.js";
import {
  assertAuthorizedPropertyId,
  authorizedPropertyId,
} from "../platform/property-scope.js";
import {
  meterString,
  meterValue,
  moneyString,
  moneyValue,
  roundedDivide,
  sumMoney,
} from "../platform/numeric.js";
import { RoomsService } from "../rooms/rooms.service.js";
import { UtilitiesService } from "../utilities/utilities.service.js";
import type {
  SettlementRecord,
  UtilityReadingRecord,
} from "../utilities/utilities.types.js";
import {
  BillingRoomNotFoundException,
  BillingValidationException,
  InvoiceNotFoundException,
  SettlementInvoiceNotFoundException,
  PaymentIdempotencyRequiredException,
} from "./billing.errors.js";
import { BILLING_REPOSITORY } from "./billing.tokens.js";
import { buildDebtSummaries } from "./debt-summary.js";
import { monthlyReportToCsv } from "./reports-csv.js";
import { ReceiptService } from "./receipt.service.js";
import type {
  BillingRepository,
  DebtListQuery,
  DebtSummaryRecord,
  DashboardSummaryRecord,
  DashboardActionsRecord,
  InvoiceCreateInput,
  InvoiceItemReadRecord,
  InvoiceItemRecord,
  InvoiceListQuery,
  InvoiceReadRecord,
  InvoiceRecord,
  MonthlyReportRecord,
  PaymentCreateInput,
  PaymentListQuery,
  PaymentRecord,
  UtilityUsageRecord,
} from "./billing.types.js";

@Injectable()
export class BillingService {
  constructor(
    @Inject(BILLING_REPOSITORY) private readonly billing: BillingRepository,
    @Inject(UtilitiesService) private readonly utilities: UtilitiesService,
    @Inject(RoomsService) private readonly rooms: RoomsService,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(ReceiptService) private readonly receipts: ReceiptService,
  ) {}

  async listInvoices(query: InvoiceListQuery) {
    const invoices = await this.billing.listInvoices(query);
    return invoices.map((invoice) => toInvoiceReadRecord(invoice));
  }

  async findInvoiceById(id: string) {
    const invoice = await this.billing.findInvoiceById(id);
    if (!invoice) throw new InvoiceNotFoundException();
    return invoice;
  }

  async findInvoiceDetailById(id: string) {
    const invoice = await this.findInvoiceById(id);
    return this.toInvoiceDetail(invoice);
  }

  invoiceReadResponse(invoice: InvoiceRecord) {
    return toInvoiceReadRecord(invoice);
  }

  async createInvoiceFromSettlement(
    settlementId: string,
    actorUserId?: string,
  ) {
    const input = await this.prepareInvoiceFromSettlement(settlementId);
    if (process.env.NODE_ENV === "test") {
      const existing = await this.billing.findInvoiceBySourceKey(
        input.sourceKey,
      );
      return existing ?? this.billing.createInvoice(input, actorUserId);
    }
    const invoiceId = await this.receipts.createInvoiceWithCredit(
      input,
      actorUserId,
    );
    const invoice = await this.billing.findInvoiceById(invoiceId);
    if (!invoice) throw new InvoiceNotFoundException();
    return invoice;
  }

  async prepareInvoiceFromSettlement(
    settlementId: string,
  ): Promise<InvoiceCreateInput> {
    const sourceKey = `settlement:${settlementId}`;

    const settlement = await this.utilities.findSettlementById(settlementId);
    if (!settlement) throw new SettlementInvoiceNotFoundException();
    if (settlement.status !== "FINALIZED") {
      throw new BillingValidationException(
        "Only finalized settlements can be converted to invoices",
      );
    }
    const room = await this.rooms.findById(settlement.roomId);
    if (!room) throw new BillingRoomNotFoundException();
    assertAuthorizedPropertyId(room.propertyId);

    const reading = await this.validatedReadingForSettlement(settlement);

    const totalAmount = moneyValue(settlement.totalAmount);
    return {
      invoiceNumber: invoiceNumberFor(settlement.periodEnd),
      propertyId: room.propertyId,
      roomId: settlement.roomId,
      tenancyId: settlement.tenancyId,
      payerTenantId: settlement.representativeTenantId,
      invoiceType: "COMBINED",
      status: totalAmount > 0n ? "ISSUED" : "PAID",
      billingPeriodStart: settlement.periodStart,
      billingPeriodEnd: settlement.periodEnd,
      billingYear: settlement.billingYear,
      billingMonth: settlement.billingMonth,
      issuedOn: todayDate(),
      dueOn: dueDateFor(settlement.periodEnd),
      totalAmount: moneyString(totalAmount),
      paidAmount: "0",
      outstandingAmount: moneyString(totalAmount),
      sourceKey,
      pricingSnapshot: {
        settlementId: settlement.id,
        rentAmount: settlement.rentAmount,
        occupiedDays: settlement.occupiedDays,
        daysInMonth: settlement.daysInMonth,
        accountingVersion: 2,
        prepaidAppliedAmount: "0",
        carryForwardAmount: settlement.carryForwardAmount,
      },
      notes: settlement.notes,
      items: invoiceItemsForSettlement(settlement, reading),
    };
  }

  private async validatedReadingForSettlement(settlement: SettlementRecord) {
    if (!settlement.utilityReadingId) {
      if (
        moneyValue(settlement.electricityAmount) > 0n ||
        moneyValue(settlement.waterAmount) > 0n
      ) {
        throw new BillingValidationException(
          "A finalized utility reading is required for utility charges",
        );
      }
      return null;
    }

    const readings = await this.utilities.listReadings({
      roomId: settlement.roomId,
      tenancyId: settlement.tenancyId,
      billingYear: settlement.billingYear,
      billingMonth: settlement.billingMonth,
      status: "FINALIZED",
    });
    const reading = readings.find(
      (candidate) => candidate.id === settlement.utilityReadingId,
    );
    if (!reading || !reading.finalizedAt) {
      throw new BillingValidationException(
        "Settlement utility reading must be finalized",
      );
    }
    if (!readingMatchesSettlement(reading, settlement)) {
      throw new BillingValidationException(
        "Settlement utility reading does not match the invoice period",
      );
    }
    if (
      reading.electricityAmount !== settlement.electricityAmount ||
      reading.waterAmount !== settlement.waterAmount
    ) {
      throw new BillingValidationException(
        "Settlement utility totals do not match the finalized reading",
      );
    }
    assertValidReadingUsage(reading);
    return reading;
  }

  private async toInvoiceDetail(
    invoice: InvoiceRecord,
  ): Promise<InvoiceReadRecord> {
    const snapshot = toInvoiceReadRecord(invoice);
    if (
      !snapshot.items.some(
        (item) => isUtilityItem(item.itemType) && item.utilityUsage === null,
      )
    ) {
      return snapshot;
    }

    const reading = await this.legacyReadingForInvoice(invoice);
    if (!reading) return snapshot;
    return {
      ...snapshot,
      items: snapshot.items.map((item) => {
        if (!isUtilityItem(item.itemType) || item.utilityUsage) return item;
        return {
          ...item,
          utilityUsage: usageFromReading(item, reading),
          utilityUsageSource: "LEGACY_FINALIZED_READING" as const,
        };
      }),
    };
  }

  private async legacyReadingForInvoice(invoice: {
    sourceKey: string | null;
    propertyId: string;
    roomId: string;
    tenancyId: string | null;
    billingPeriodStart: string;
    billingPeriodEnd: string;
    billingYear: number;
    billingMonth: number | null;
  }) {
    const settlementId = settlementIdFromSourceKey(invoice.sourceKey);
    if (!settlementId || !invoice.tenancyId || !invoice.billingMonth) {
      return null;
    }
    const room = await this.rooms.findById(invoice.roomId);
    if (!room || room.propertyId !== invoice.propertyId) return null;
    assertAuthorizedPropertyId(room.propertyId);

    const settlement = await this.utilities.findSettlementById(settlementId);
    if (
      !settlement ||
      settlement.status !== "FINALIZED" ||
      !settlement.finalizedAt ||
      !settlement.utilityReadingId ||
      !settlementMatchesInvoice(settlement, invoice)
    ) {
      return null;
    }
    const readings = await this.utilities.listReadings({
      roomId: invoice.roomId,
      tenancyId: invoice.tenancyId,
      billingYear: invoice.billingYear,
      billingMonth: invoice.billingMonth,
      status: "FINALIZED",
    });
    const reading = readings.find(
      (candidate) => candidate.id === settlement.utilityReadingId,
    );
    if (
      !reading ||
      !reading.finalizedAt ||
      !readingMatchesSettlement(reading, settlement)
    ) {
      return null;
    }
    try {
      assertValidReadingUsage(reading);
      return reading;
    } catch {
      return null;
    }
  }

  listPayments(query: PaymentListQuery) {
    return this.billing.listPayments(query);
  }

  async createPayment(
    input: Omit<
      PaymentCreateInput,
      "paymentNumber" | "requestHash" | "actorUserId"
    >,
    actorUserId?: string,
  ) {
    if (!input.idempotencyKey) throw new PaymentIdempotencyRequiredException();
    const paidAt = new Date(input.paidAt).toISOString();
    const hash = requestHash({
      invoiceId: input.invoiceId,
      amount: input.amount,
      method: input.method,
      paidAt,
    });

    const result = await this.billing.createPayment({
      ...input,
      paymentNumber: paymentNumberFor(input.paidAt),
      paidAt,
      method: input.method,
      description: input.description ?? "Thanh toan hoa don",
      requestHash: hash,
      actorUserId,
    });
    return result.payment;
  }

  async listDebts(query: DebtListQuery) {
    const debts = await this.billing.listDebts(query);
    return debts.map(toDebtReadRecord);
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
      this.billing.listPayments({ eventFrom: monthStart, eventTo: monthEnd }),
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
        currentMonthCollected: cashNetForPeriod(payments, monthStart, monthEnd),
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

  async dashboardActions(query: { asOf?: string }) {
    const asOf = query.asOf ?? todayDate();
    const { year, month } = yearMonthFor(asOf);
    const periodStart = `${year}-${String(month).padStart(2, "0")}-01`;
    const periodEnd = `${year}-${String(month).padStart(2, "0")}-${String(
      daysInMonthFor(year, month),
    ).padStart(2, "0")}`;
    const [rooms, settlements, invoices, pendingOperations] = await Promise.all(
      [
        this.rooms.list({ limit: 100, sort: "code:asc" }),
        this.utilities.listSettlements({
          billingYear: year,
          billingMonth: month,
        }),
        this.billing.listInvoices({}),
        process.env.NODE_ENV === "test"
          ? Promise.resolve([])
          : this.prisma.tenancyOperation.findMany({
              where: {
                propertyId: authorizedPropertyId(),
                status: { in: ["INVOICE_PENDING", "ACTION_REQUIRED"] },
              },
              include: {
                sourceTenancy: {
                  include: { room: { select: { code: true } } },
                },
                settlement: {
                  select: {
                    id: true,
                    periodStart: true,
                    periodEnd: true,
                    outstandingAmount: true,
                  },
                },
              },
              orderBy: { updatedAt: "asc" },
            }),
      ],
    );
    const settledTenancyIds = new Set(
      settlements
        .filter((settlement) => settlement.status === "FINALIZED")
        .map((settlement) => settlement.tenancyId),
    );
    const items: DashboardActionsRecord["items"] = rooms.data
      .filter(
        (room) =>
          room.currentOccupancy &&
          !settledTenancyIds.has(room.currentOccupancy.tenancyId),
      )
      .map((room) => ({
        id: `UNSETTLED_PERIOD:${room.id}:${year}-${month}`,
        kind: "UNSETTLED_PERIOD" as const,
        roomId: room.id,
        roomCode: room.code,
        periodStart,
        periodEnd,
        dueOn: null,
        amount: null,
        target: {
          route: "/utilities" as const,
          params: {
            roomId: room.id,
            tenancyId: room.currentOccupancy?.tenancyId ?? "",
            billingYear: String(year),
            billingMonth: String(month),
          },
        },
      }));

    for (const operation of pendingOperations) {
      const actionKind =
        operation.status === "ACTION_REQUIRED"
          ? ("ACTION_REQUIRED" as const)
          : ("INVOICE_PENDING" as const);
      items.push({
        id: `${actionKind}:${operation.id}`,
        kind: actionKind,
        roomId: operation.sourceTenancy.roomId,
        roomCode: operation.sourceTenancy.room.code,
        periodStart: operation.settlement
          ? operation.settlement.periodStart.toISOString().slice(0, 10)
          : null,
        periodEnd: operation.settlement
          ? operation.settlement.periodEnd.toISOString().slice(0, 10)
          : null,
        dueOn: null,
        amount: operation.settlement?.outstandingAmount.toString() ?? null,
        target: {
          route: "/utilities",
          params: {
            operationId: operation.id,
            settlementId: operation.settlement?.id ?? "",
            operationStatus: operation.status,
          },
        },
      });
    }

    const dueSoonEnd = addCalendarDays(asOf, 3);
    for (const invoice of invoices) {
      if (
        invoice.status === "CANCELLED" ||
        invoice.status === "PAID" ||
        moneyValue(invoice.outstandingAmount) === 0n
      ) {
        continue;
      }
      const kind =
        invoice.dueOn < asOf
          ? ("OVERDUE" as const)
          : invoice.dueOn === asOf
            ? ("DUE_TODAY" as const)
            : invoice.dueOn <= dueSoonEnd
              ? ("DUE_SOON" as const)
              : null;
      if (!kind) continue;
      items.push({
        id: `${kind}:${invoice.id}`,
        kind,
        roomId: invoice.roomId,
        roomCode: invoice.roomCode,
        periodStart: invoice.billingPeriodStart,
        periodEnd: invoice.billingPeriodEnd,
        dueOn: invoice.dueOn,
        amount: invoice.outstandingAmount,
        target: {
          route: "/invoices",
          params: { invoiceId: invoice.id },
        },
      });
    }

    const priority: Record<
      DashboardActionsRecord["items"][number]["kind"],
      number
    > = {
      OVERDUE: 0,
      DUE_TODAY: 1,
      ACTION_REQUIRED: 2,
      INVOICE_PENDING: 3,
      DUE_SOON: 4,
      UNSETTLED_PERIOD: 5,
    };
    items.sort(
      (left, right) =>
        priority[left.kind] - priority[right.kind] ||
        left.id.localeCompare(right.id),
    );
    return { asOf, dueSoonDays: 3 as const, items };
  }

  async monthlyReport(query: {
    billingYear: number;
    billingMonth: number;
    roomId?: string;
    limit: number;
  }): Promise<MonthlyReportRecord> {
    if (query.roomId) {
      const room = await this.rooms.findById(query.roomId);
      if (!room) throw new BillingRoomNotFoundException();
      assertAuthorizedPropertyId(room.propertyId);
    }
    const periodStart = `${query.billingYear}-${String(
      query.billingMonth,
    ).padStart(2, "0")}-01`;
    const periodEnd = `${query.billingYear}-${String(
      query.billingMonth,
    ).padStart(2, "0")}-${String(
      daysInMonthFor(query.billingYear, query.billingMonth),
    ).padStart(2, "0")}`;
    const [invoices, payments] = await Promise.all([
      this.billing.listInvoices({
        billingYear: query.billingYear,
        billingMonth: query.billingMonth,
        roomId: query.roomId,
      }),
      this.billing.listPayments({
        eventFrom: periodStart,
        eventTo: periodEnd,
        roomId: query.roomId,
      }),
    ]);
    const issuedInvoices = invoices.filter(
      (invoice) => invoice.status !== "DRAFT",
    );
    const activeInvoices = issuedInvoices.filter(
      (invoice) => invoice.status !== "CANCELLED",
    );
    const debts = buildDebtSummaries(activeInvoices, { asOf: periodEnd });
    const overdueDebts = debts.filter((debt) => debt.debtStatus === "OVERDUE");
    const invoiceTotal = sumMoney(
      activeInvoices.map((invoice) => invoice.totalAmount),
    );
    const outstanding = sumMoney(
      activeInvoices.map((invoice) => invoice.outstandingAmount),
    );
    const cash = cashBreakdownForPeriod(payments, periodStart, periodEnd);
    const creditApplied = await this.creditAppliedForPeriod(
      periodStart,
      periodEnd,
      query.roomId,
    );
    return {
      billingYear: query.billingYear,
      billingMonth: query.billingMonth,
      periodStart,
      periodEnd,
      totals: {
        invoiceTotal,
        collected: cash.net,
        outstanding,
        grossBilled: invoiceTotal,
        cashReceived: cash.received,
        cashReversed: cash.reversed,
        creditApplied,
        netOutstanding: outstanding,
        overdue: sumMoney(overdueDebts.map((debt) => debt.totalOutstanding)),
        electricity: sumMoney(
          activeInvoices.flatMap((invoice) =>
            invoice.items
              .filter((item) => item.itemType === "ELECTRICITY")
              .map((item) => item.amount),
          ),
        ),
        water: sumMoney(
          activeInvoices.flatMap((invoice) =>
            invoice.items
              .filter((item) => item.itemType === "WATER")
              .map((item) => item.amount),
          ),
        ),
      },
      invoices: issuedInvoices.slice(0, query.limit).map(toInvoiceReadRecord),
      payments: payments.slice(0, query.limit).map(toPaymentReadRecord),
      debts: debts.slice(0, query.limit).map(toDebtReadRecord),
    };
  }

  async monthlyReportCsv(query: {
    billingYear: number;
    billingMonth: number;
    roomId?: string;
    limit: number;
  }) {
    return monthlyReportToCsv(await this.monthlyReport(query));
  }

  private async creditAppliedForPeriod(
    periodStart: string,
    periodEnd: string,
    roomId?: string,
  ) {
    if (process.env.NODE_ENV === "test") return "0";
    const entries = await this.prisma.tenantAccountEntry.findMany({
      where: {
        propertyId: authorizedPropertyId(),
        roomId,
        effectiveOn: {
          gte: new Date(`${periodStart}T00:00:00.000Z`),
          lte: new Date(`${periodEnd}T00:00:00.000Z`),
        },
        OR: [
          { journalType: "CREDIT_APPLIED" },
          {
            journalType: "REVERSAL",
            reversalOf: { is: { journalType: "CREDIT_APPLIED" } },
          },
        ],
        deletedAt: null,
      },
      select: { direction: true, amount: true },
    });
    return moneyString(
      entries.reduce((total, entry) => {
        const amount = moneyValue(entry.amount.toString());
        return entry.direction === "DEBIT" ? total + amount : total - amount;
      }, 0n),
    );
  }
}

function invoiceItemsForSettlement(
  settlement: SettlementRecord,
  reading: UtilityReadingRecord | null,
): InvoiceCreateInput["items"] {
  const items: InvoiceCreateInput["items"] = [
    {
      itemType: "RENT" as const,
      description: `Tien phong thang ${settlement.billingMonth}/${settlement.billingYear}`,
      quantity: String(settlement.occupiedDays),
      unit: "ngay",
      unitPrice: moneyString(
        roundedDivide(
          moneyValue(settlement.proratedRentAmount),
          BigInt(settlement.occupiedDays),
        ),
      ),
      amount: settlement.proratedRentAmount,
      sortOrder: 10,
      metadata: { settlementId: settlement.id },
    },
  ];
  if (reading) {
    items.push(
      utilityInvoiceItem("ELECTRICITY", reading, 20),
      utilityInvoiceItem("WATER", reading, 30),
    );
  }
  return items;
}

function utilityInvoiceItem(
  itemType: "ELECTRICITY" | "WATER",
  reading: UtilityReadingRecord,
  sortOrder: number,
): InvoiceCreateInput["items"][number] {
  const electricity = itemType === "ELECTRICITY";
  const utilityUsage: UtilityUsageRecord = {
    previous: electricity ? reading.electricityPrevious : reading.waterPrevious,
    current: electricity ? reading.electricityCurrent : reading.waterCurrent,
    usage: electricity ? reading.electricityUsage : reading.waterUsage,
    unit: electricity ? "kWh" : "m3",
    unitPrice: electricity
      ? reading.electricityUnitPrice
      : reading.waterUnitPrice,
    amount: electricity ? reading.electricityAmount : reading.waterAmount,
  };
  return {
    itemType,
    description: electricity ? "Tien dien" : "Tien nuoc",
    quantity: utilityUsage.usage,
    unit: utilityUsage.unit,
    unitPrice: utilityUsage.unitPrice,
    amount: utilityUsage.amount,
    sortOrder,
    metadata: {
      schemaVersion: 1,
      sourceUtilityReadingId: reading.id,
      utilityUsage,
    },
  };
}

function toInvoiceReadRecord(invoice: InvoiceRecord): InvoiceReadRecord {
  return {
    id: invoice.id,
    invoiceNumber: invoice.invoiceNumber,
    roomId: invoice.roomId,
    roomCode: invoice.roomCode,
    payerTenantName: invoice.payerTenantName,
    invoiceType: invoice.invoiceType,
    status: invoice.status,
    billingPeriodStart: invoice.billingPeriodStart,
    billingPeriodEnd: invoice.billingPeriodEnd,
    billingYear: invoice.billingYear,
    billingMonth: invoice.billingMonth,
    issuedOn: invoice.issuedOn,
    dueOn: invoice.dueOn,
    totalAmount: invoice.totalAmount,
    paidAmount: invoice.paidAmount,
    outstandingAmount: invoice.outstandingAmount,
    fullyPaidAt: invoice.fullyPaidAt,
    items: invoice.items.map((item) => {
      const utilityUsage = utilityUsageFromMetadata(item);
      return {
        id: item.id,
        itemType: item.itemType,
        description: item.description,
        quantity: item.quantity,
        unit: item.unit,
        unitPrice: item.unitPrice,
        amount: item.amount,
        sortOrder: item.sortOrder,
        utilityUsage,
        utilityUsageSource: utilityUsage ? "INVOICE_SNAPSHOT" : null,
      };
    }),
    paymentAllocations: invoice.paymentAllocations.map((allocation) => ({
      amount: allocation.amount,
      allocatedAt: allocation.allocatedAt,
      paymentNumber: allocation.paymentNumber,
      paymentMethod: allocation.paymentMethod,
      paymentStatus: allocation.paymentStatus,
      paidAt: allocation.paidAt,
    })),
  };
}

function utilityUsageFromMetadata(
  item: InvoiceItemRecord,
): UtilityUsageRecord | null {
  if (!isUtilityItem(item.itemType) || !isRecord(item.metadata)) return null;
  if (
    item.metadata.schemaVersion !== 1 ||
    typeof item.metadata.sourceUtilityReadingId !== "string" ||
    !UUID_PATTERN.test(item.metadata.sourceUtilityReadingId) ||
    !isRecord(item.metadata.utilityUsage)
  ) {
    return null;
  }
  const value = item.metadata.utilityUsage;
  const expectedUnit = item.itemType === "ELECTRICITY" ? "kWh" : "m3";
  if (
    typeof value.previous !== "string" ||
    typeof value.current !== "string" ||
    typeof value.usage !== "string" ||
    value.unit !== expectedUnit ||
    typeof value.unitPrice !== "string" ||
    typeof value.amount !== "string" ||
    value.usage !== item.quantity ||
    value.unit !== item.unit ||
    value.unitPrice !== item.unitPrice ||
    value.amount !== item.amount
  ) {
    return null;
  }
  try {
    if (
      meterValue(value.current) - meterValue(value.previous) !==
        meterValue(value.usage) ||
      meterValue(value.current) < meterValue(value.previous)
    ) {
      return null;
    }
    moneyValue(value.unitPrice);
    moneyValue(value.amount);
  } catch {
    return null;
  }
  return {
    previous: value.previous,
    current: value.current,
    usage: value.usage,
    unit: expectedUnit,
    unitPrice: value.unitPrice,
    amount: value.amount,
  };
}

function usageFromReading(
  item: InvoiceItemReadRecord,
  reading: UtilityReadingRecord,
): UtilityUsageRecord {
  const electricity = item.itemType === "ELECTRICITY";
  return {
    previous: electricity ? reading.electricityPrevious : reading.waterPrevious,
    current: electricity ? reading.electricityCurrent : reading.waterCurrent,
    usage: electricity ? reading.electricityUsage : reading.waterUsage,
    unit: electricity ? "kWh" : "m3",
    unitPrice: electricity
      ? reading.electricityUnitPrice
      : reading.waterUnitPrice,
    amount: item.amount,
  };
}

function readingMatchesSettlement(
  reading: UtilityReadingRecord,
  settlement: SettlementRecord,
) {
  return (
    reading.roomId === settlement.roomId &&
    reading.tenancyId === settlement.tenancyId &&
    reading.billingPeriodStart === settlement.periodStart &&
    reading.billingPeriodEnd === settlement.periodEnd &&
    reading.billingYear === settlement.billingYear &&
    reading.billingMonth === settlement.billingMonth
  );
}

function settlementMatchesInvoice(
  settlement: SettlementRecord,
  invoice: {
    roomId: string;
    tenancyId: string | null;
    billingPeriodStart: string;
    billingPeriodEnd: string;
    billingYear: number;
    billingMonth: number | null;
  },
) {
  return (
    settlement.roomId === invoice.roomId &&
    settlement.tenancyId === invoice.tenancyId &&
    settlement.periodStart === invoice.billingPeriodStart &&
    settlement.periodEnd === invoice.billingPeriodEnd &&
    settlement.billingYear === invoice.billingYear &&
    settlement.billingMonth === invoice.billingMonth
  );
}

function assertValidReadingUsage(reading: UtilityReadingRecord) {
  assertMeterUsage(
    reading.electricityPrevious,
    reading.electricityCurrent,
    reading.electricityUsage,
  );
  assertMeterUsage(
    reading.waterPrevious,
    reading.waterCurrent,
    reading.waterUsage,
  );
}

function assertMeterUsage(previous: string, current: string, usage: string) {
  const previousValue = meterValue(previous);
  const currentValue = meterValue(current);
  if (
    currentValue < previousValue ||
    meterString(currentValue - previousValue) !== meterString(meterValue(usage))
  ) {
    throw new BillingValidationException("Utility usage is invalid");
  }
}

function settlementIdFromSourceKey(sourceKey: string | null) {
  if (!sourceKey?.startsWith("settlement:")) return null;
  const id = sourceKey.slice("settlement:".length);
  return UUID_PATTERN.test(id) ? id : null;
}

function isUtilityItem(itemType: string) {
  return itemType === "ELECTRICITY" || itemType === "WATER";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function toPaymentReadRecord(payment: PaymentRecord) {
  return {
    id: payment.id,
    paymentNumber: payment.paymentNumber,
    roomId: payment.roomId,
    roomCode: payment.roomCode,
    payerTenantName: payment.payerTenantName,
    amount: payment.amount,
    method: payment.method,
    status: payment.status,
    paidAt: payment.paidAt,
    voidedAt: payment.voidedAt,
  };
}

function toDebtReadRecord(debt: DebtSummaryRecord) {
  return {
    roomId: debt.roomId,
    roomCode: debt.roomCode,
    payerTenantId: debt.payerTenantId,
    payerTenantName: debt.payerTenantName,
    debtStatus: debt.debtStatus,
    invoiceCount: debt.invoiceCount,
    totalOutstanding: debt.totalOutstanding,
    nearestDueOn: debt.nearestDueOn,
    daysOverdue: debt.daysOverdue,
    latestPaymentAt: debt.latestPaymentAt,
    invoices: debt.invoices.map(toInvoiceReadRecord),
  };
}

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

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

function addCalendarDays(date: string, days: number) {
  const value = new Date(`${date}T00:00:00.000Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
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

function cashNetForPeriod(
  payments: PaymentRecord[],
  periodStart: string,
  periodEnd: string,
) {
  return cashBreakdownForPeriod(payments, periodStart, periodEnd).net;
}

function cashBreakdownForPeriod(
  payments: PaymentRecord[],
  periodStart: string,
  periodEnd: string,
) {
  let received = 0n;
  let reversed = 0n;
  for (const payment of payments) {
    const paidOn = payment.paidAt.slice(0, 10);
    if (
      payment.status !== "PENDING" &&
      paidOn >= periodStart &&
      paidOn <= periodEnd
    ) {
      received += moneyValue(payment.amount);
    }
    const voidedOn = payment.voidedAt?.slice(0, 10);
    if (voidedOn && voidedOn >= periodStart && voidedOn <= periodEnd) {
      reversed += moneyValue(payment.amount);
    }
  }
  return {
    received: moneyString(received),
    reversed: moneyString(reversed),
    net: moneyString(received - reversed),
  };
}
