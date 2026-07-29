import { Inject, Injectable } from "@nestjs/common";
import { AuditService } from "../audit/audit.service.js";
import { PricingService } from "../pricing/pricing.service.js";
import { TenantsService } from "../tenants/tenants.service.js";
import type { TenancyRecord } from "../tenants/tenants.types.js";
import {
  FinalizedReadingConflictException,
  FinalizedSettlementConflictException,
  SettlementTenancyNotFoundException,
  SettlementValidationException,
  UtilityReadingNotFoundException,
} from "./utilities.errors.js";
import { UTILITIES_REPOSITORY } from "./utilities.tokens.js";
import type {
  SettlementInput,
  SettlementPreviewRecord,
  UtilitiesRepository,
  UtilityReadingCreateInput,
  UtilityReadingListQuery,
  UtilityReadingRecord,
} from "./utilities.types.js";

@Injectable()
export class UtilitiesService {
  constructor(
    @Inject(UTILITIES_REPOSITORY)
    private readonly utilities: UtilitiesRepository,
    @Inject(PricingService) private readonly pricing: PricingService,
    @Inject(TenantsService) private readonly tenants: TenantsService,
    @Inject(AuditService) private readonly audit: AuditService,
  ) {}

  listReadings(query: UtilityReadingListQuery) {
    return this.utilities.listReadings(query);
  }

  listSettlements(query: {
    billingYear?: number;
    billingMonth?: number;
    tenancyId?: string;
    roomId?: string;
  }) {
    return this.utilities.listSettlements(query);
  }

  async createReading(input: UtilityReadingCreateInput, actorUserId?: string) {
    const priced = await this.withUtilityAmounts(input);
    const reading = await this.utilities.createReading(priced);
    await this.audit.record({
      action: "CREATE",
      entityType: "utility_reading",
      entityId: reading.id,
      actorUserId,
      newValues: reading,
    });
    return reading;
  }

  async finalizeReading(id: string, actorUserId?: string) {
    const reading = await this.utilities.findReadingById(id);
    if (!reading) throw new UtilityReadingNotFoundException();
    const duplicate = await this.utilities.findFinalizedReading({
      roomId: reading.roomId,
      billingPeriodStart: reading.billingPeriodStart,
      billingPeriodEnd: reading.billingPeriodEnd,
      readingKind: reading.readingKind,
      excludeId: id,
    });
    if (duplicate) throw new FinalizedReadingConflictException();
    const finalized = await this.utilities.finalizeReading(id);
    if (!finalized) throw new UtilityReadingNotFoundException();
    await this.audit.record({
      action: "FINALIZE_READING",
      entityType: "utility_reading",
      entityId: finalized.id,
      actorUserId,
      oldValues: reading,
      newValues: finalized,
    });
    return finalized;
  }

  async previewSettlement(
    input: SettlementInput,
  ): Promise<SettlementPreviewRecord> {
    return this.calculateSettlement(input);
  }

  async createSettlement(input: SettlementInput, actorUserId?: string) {
    let preview = await this.calculateSettlement(input);
    const duplicateSettlement = await this.utilities.findFinalizedSettlement({
      tenancyId: preview.tenancyId,
      periodStart: preview.periodStart,
      periodEnd: preview.periodEnd,
    });
    if (duplicateSettlement) throw new FinalizedSettlementConflictException();

    let utilityReadingId = preview.utilityReadingId;
    if (!utilityReadingId && input.utilityReading) {
      const duplicateReading = await this.utilities.findFinalizedReading({
        roomId: preview.roomId,
        billingPeriodStart: preview.periodStart,
        billingPeriodEnd: preview.periodEnd,
        readingKind: input.settlementType,
      });
      if (duplicateReading) {
        utilityReadingId = duplicateReading.id;
      } else {
        const draftReading = await this.createReading(
          {
            roomId: preview.roomId,
            tenancyId: preview.tenancyId,
            readingKind: input.settlementType,
            billingPeriodStart: preview.periodStart,
            billingPeriodEnd: preview.periodEnd,
            billingYear: preview.billingYear,
            billingMonth: preview.billingMonth,
            electricityPrevious: input.utilityReading.electricityPrevious,
            electricityCurrent: input.utilityReading.electricityCurrent,
            waterPrevious: input.utilityReading.waterPrevious,
            waterCurrent: input.utilityReading.waterCurrent,
            notes: input.notes,
          },
          actorUserId,
        );
        const finalizedReading = await this.finalizeReading(
          draftReading.id,
          actorUserId,
        );
        utilityReadingId = finalizedReading.id;
      }
      preview = await this.calculateSettlement({
        ...input,
        utilityReadingId,
        utilityReading: undefined,
      });
    }

    const settlement = await this.utilities.createSettlement({
      settlement: {
        settlementType: preview.settlementType,
        status: "FINALIZED",
        roomId: preview.roomId,
        tenancyId: preview.tenancyId,
        representativeTenantId: preview.representativeTenantId,
        utilityReadingId,
        periodStart: preview.periodStart,
        periodEnd: preview.periodEnd,
        billingYear: preview.billingYear,
        billingMonth: preview.billingMonth,
        occupiedDays: preview.occupiedDays,
        daysInMonth: preview.daysInMonth,
        rentAmount: preview.rentAmount,
        proratedRentAmount: preview.proratedRentAmount,
        electricityAmount: preview.electricityAmount,
        waterAmount: preview.waterAmount,
        totalAmount: preview.totalAmount,
        prepaidAppliedAmount: preview.prepaidAppliedAmount,
        carryForwardAmount: preview.carryForwardAmount,
        outstandingAmount: preview.outstandingAmount,
        finalizedAt: new Date().toISOString(),
        notes: preview.notes,
      },
      prepaidAmount: preview.newPrepaidAmount,
      creditAppliedAmount: preview.prepaidAppliedAmount,
    });

    await this.audit.record({
      action: "ISSUE_INVOICE",
      entityType: "settlement",
      entityId: settlement.id,
      actorUserId,
      newValues: settlement,
      metadata: { mode: "settlement-foundation" },
    });
    return settlement;
  }

  private async withUtilityAmounts(input: UtilityReadingCreateInput) {
    const pricing = await this.pricing.effective({
      roomId: input.roomId,
      tenancyId: input.tenancyId ?? undefined,
      asOf: input.billingPeriodEnd,
    });
    const electricityUnitPrice = moneyValue(
      pricing.resolvedConfig.electricityUnitPrice,
    );
    const waterUnitPrice = moneyValue(pricing.resolvedConfig.waterUnitPrice);
    const electricityUsage =
      Number(input.electricityCurrent) - Number(input.electricityPrevious);
    const waterUsage = Number(input.waterCurrent) - Number(input.waterPrevious);
    const electricityAmount = Math.round(
      electricityUsage * electricityUnitPrice,
    );
    const waterAmount = Math.round(waterUsage * waterUnitPrice);

    return {
      ...input,
      tenancyId: input.tenancyId ?? null,
      electricityUsage: decimalString(electricityUsage),
      electricityUnitPrice: String(electricityUnitPrice),
      electricityAmount: String(electricityAmount),
      waterUsage: decimalString(waterUsage),
      waterUnitPrice: String(waterUnitPrice),
      waterAmount: String(waterAmount),
      status: "DRAFT" as const,
      finalizedAt: null,
    };
  }

  private async calculateSettlement(
    input: SettlementInput,
  ): Promise<SettlementPreviewRecord> {
    const tenancy = await this.findTenancy(input.tenancyId);
    const period = periodFor(input, tenancy);
    const occupiedDays = inclusiveDays(period.start, period.end);
    if (occupiedDays <= 0) {
      throw new SettlementValidationException(
        "Settlement period does not overlap the tenancy",
      );
    }

    const reading = input.utilityReadingId
      ? await this.utilities.findReadingById(input.utilityReadingId)
      : null;
    if (input.utilityReadingId && !reading)
      throw new UtilityReadingNotFoundException();
    if (reading && reading.status !== "FINALIZED") {
      throw new SettlementValidationException(
        "Utility reading must be finalized before settlement",
      );
    }
    if (reading && reading.tenancyId && reading.tenancyId !== tenancy.id) {
      throw new SettlementValidationException(
        "Utility reading must belong to the selected tenancy",
      );
    }
    const previewReading = reading
      ? null
      : await this.previewReadingForSettlement(input, tenancy, period);

    const daysInMonth = daysInMonthFor(input.billingYear, input.billingMonth);
    const rentAmount = Number(tenancy.rentAmount);
    const proratedRentAmount = Math.round(
      (rentAmount / daysInMonth) * occupiedDays,
    );
    const electricityAmount = Number(
      reading?.electricityAmount ?? previewReading?.electricityAmount ?? "0",
    );
    const waterAmount = Number(
      reading?.waterAmount ?? previewReading?.waterAmount ?? "0",
    );
    const totalAmount = proratedRentAmount + electricityAmount + waterAmount;
    const creditBalanceBefore = Number(
      await this.utilities.accountBalance({
        tenantId: tenancy.representativeTenantId,
        effectiveOn: period.end,
      }),
    );
    const newPrepaidAmount = Number(input.prepaidAmount ?? "0");
    const availableCredit = creditBalanceBefore + newPrepaidAmount;
    const prepaidAppliedAmount = Math.min(availableCredit, proratedRentAmount);
    const carryForwardAmount = Math.max(
      0,
      availableCredit - prepaidAppliedAmount,
    );
    const outstandingAmount = Math.max(0, totalAmount - prepaidAppliedAmount);

    return {
      id: null,
      settlementType: input.settlementType,
      status: "DRAFT",
      roomId: tenancy.roomId,
      tenancyId: tenancy.id,
      representativeTenantId: tenancy.representativeTenantId,
      representativeTenantName: tenancy.representativeTenantName,
      utilityReadingId: reading?.id ?? null,
      periodStart: period.start,
      periodEnd: period.end,
      billingYear: input.billingYear,
      billingMonth: input.billingMonth,
      occupiedDays,
      daysInMonth,
      rentAmount: String(rentAmount),
      proratedRentAmount: String(proratedRentAmount),
      electricityAmount: String(electricityAmount),
      waterAmount: String(waterAmount),
      totalAmount: String(totalAmount),
      prepaidAppliedAmount: String(prepaidAppliedAmount),
      carryForwardAmount: String(carryForwardAmount),
      outstandingAmount: String(outstandingAmount),
      finalizedAt: null,
      notes: input.notes ?? null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      creditBalanceBefore: String(creditBalanceBefore),
      newPrepaidAmount: String(newPrepaidAmount),
      creditBalanceAfter: String(carryForwardAmount),
    };
  }

  private async findTenancy(id: string) {
    const tenancies = await this.tenants.listTenancies();
    const tenancy = tenancies.find((item) => item.id === id);
    if (!tenancy) throw new SettlementTenancyNotFoundException();
    return tenancy;
  }

  private async previewReadingForSettlement(
    input: SettlementInput,
    tenancy: TenancyRecord,
    period: { start: string; end: string },
  ): Promise<UtilityReadingRecord | null> {
    if (!input.utilityReading) return null;
    const priced = await this.withUtilityAmounts({
      roomId: tenancy.roomId,
      tenancyId: tenancy.id,
      readingKind: input.settlementType,
      billingPeriodStart: period.start,
      billingPeriodEnd: period.end,
      billingYear: input.billingYear,
      billingMonth: input.billingMonth,
      electricityPrevious: input.utilityReading.electricityPrevious,
      electricityCurrent: input.utilityReading.electricityCurrent,
      waterPrevious: input.utilityReading.waterPrevious,
      waterCurrent: input.utilityReading.waterCurrent,
      notes: input.notes,
    });
    return {
      id: "",
      ...priced,
      status: "DRAFT",
      recordedAt: new Date().toISOString(),
      finalizedAt: null,
      notes: input.notes ?? null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
  }
}

function moneyValue(value: string | number | null) {
  if (typeof value === "number") return value;
  if (!value) return 0;
  return Number(value);
}

function decimalString(value: number) {
  return Number.isInteger(value) ? String(value) : value.toFixed(3);
}

function monthStart(year: number, month: number) {
  return `${year}-${String(month).padStart(2, "0")}-01`;
}

function monthEnd(year: number, month: number) {
  return `${year}-${String(month).padStart(2, "0")}-${String(
    daysInMonthFor(year, month),
  ).padStart(2, "0")}`;
}

function periodFor(input: SettlementInput, tenancy: TenancyRecord) {
  const start = maxDateString(
    monthStart(input.billingYear, input.billingMonth),
    tenancy.startDate,
  );
  const requestedEnd =
    input.settlementType === "MOVE_OUT"
      ? (input.periodEnd ?? tenancy.actualEndDate)
      : (input.periodEnd ?? monthEnd(input.billingYear, input.billingMonth));
  if (!requestedEnd) {
    throw new SettlementValidationException(
      "periodEnd is required for move-out settlement",
    );
  }
  const end = minDateString(
    requestedEnd,
    tenancy.actualEndDate ?? monthEnd(input.billingYear, input.billingMonth),
  );
  return { start, end };
}

function daysInMonthFor(year: number, month: number) {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function inclusiveDays(start: string, end: string) {
  const startDate = Date.parse(`${start}T00:00:00.000Z`);
  const endDate = Date.parse(`${end}T00:00:00.000Z`);
  return Math.floor((endDate - startDate) / 86_400_000) + 1;
}

function maxDateString(left: string, right: string) {
  return left >= right ? left : right;
}

function minDateString(left: string, right: string) {
  return left <= right ? left : right;
}
