import { Inject, Injectable } from "@nestjs/common";
import {
  Prisma,
  type Settlement,
  type Tenant,
  type UtilityReading,
} from "@prisma/client";
import { PrismaService } from "../database/prisma.service.js";
import { AuditService } from "../audit/audit.service.js";
import { moneyString, moneyValue } from "../platform/numeric.js";
import { authorizedPropertyId } from "../platform/property-scope.js";
import { DomainException } from "../platform/domain.exception.js";
import type {
  SettlementRecord,
  SettlementSaveInput,
  UtilitiesRepository,
  UtilityReadingListQuery,
  UtilityReadingRecord,
  UtilityReadingSaveInput,
} from "./utilities.types.js";

type SettlementWithTenant = Settlement & {
  representativeTenant?: Pick<Tenant, "fullName">;
};

function dateOnly(value: Date | null) {
  return value ? value.toISOString().slice(0, 10) : null;
}

function dateValue(value: string) {
  return new Date(`${value}T00:00:00.000Z`);
}

function mapReading(reading: UtilityReading): UtilityReadingRecord {
  return {
    id: reading.id,
    roomId: reading.roomId,
    tenancyId: reading.tenancyId,
    readingKind: reading.readingKind,
    billingPeriodStart: dateOnly(reading.billingPeriodStart) ?? "",
    billingPeriodEnd: dateOnly(reading.billingPeriodEnd) ?? "",
    billingYear: reading.billingYear,
    billingMonth: reading.billingMonth,
    electricityPrevious: reading.electricityPrevious.toString(),
    electricityCurrent: reading.electricityCurrent.toString(),
    electricityUsage: reading.electricityUsage.toString(),
    electricityUnitPrice: reading.electricityUnitPrice.toString(),
    electricityAmount: reading.electricityAmount.toString(),
    waterPrevious: reading.waterPrevious.toString(),
    waterCurrent: reading.waterCurrent.toString(),
    waterUsage: reading.waterUsage.toString(),
    waterUnitPrice: reading.waterUnitPrice.toString(),
    waterAmount: reading.waterAmount.toString(),
    status: reading.status,
    recordedAt: reading.recordedAt.toISOString(),
    finalizedAt: reading.finalizedAt?.toISOString() ?? null,
    notes: reading.notes,
    createdAt: reading.createdAt.toISOString(),
    updatedAt: reading.updatedAt.toISOString(),
  };
}

function mapSettlement(settlement: SettlementWithTenant): SettlementRecord {
  return {
    id: settlement.id,
    settlementType: settlement.settlementType,
    status: settlement.status,
    roomId: settlement.roomId,
    tenancyId: settlement.tenancyId,
    representativeTenantId: settlement.representativeTenantId,
    representativeTenantName: settlement.representativeTenant?.fullName ?? null,
    utilityReadingId: settlement.utilityReadingId,
    periodStart: dateOnly(settlement.periodStart) ?? "",
    periodEnd: dateOnly(settlement.periodEnd) ?? "",
    billingYear: settlement.billingYear,
    billingMonth: settlement.billingMonth,
    occupiedDays: settlement.occupiedDays,
    daysInMonth: settlement.daysInMonth,
    rentAmount: settlement.rentAmount.toString(),
    proratedRentAmount: settlement.proratedRentAmount.toString(),
    electricityAmount: settlement.electricityAmount.toString(),
    waterAmount: settlement.waterAmount.toString(),
    totalAmount: settlement.totalAmount.toString(),
    prepaidAppliedAmount: settlement.prepaidAppliedAmount.toString(),
    carryForwardAmount: settlement.carryForwardAmount.toString(),
    outstandingAmount: settlement.outstandingAmount.toString(),
    finalizedAt: settlement.finalizedAt?.toISOString() ?? null,
    notes: settlement.notes,
    createdAt: settlement.createdAt.toISOString(),
    updatedAt: settlement.updatedAt.toISOString(),
  };
}

@Injectable()
export class PrismaUtilitiesRepository implements UtilitiesRepository {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AuditService) private readonly audit: AuditService,
  ) {}

  async listReadings(query: UtilityReadingListQuery) {
    const readings = await this.prisma.utilityReading.findMany({
      where: {
        deletedAt: null,
        room: { propertyId: authorizedPropertyId() },
        roomId: query.roomId,
        tenancyId: query.tenancyId,
        billingYear: query.billingYear,
        billingMonth: query.billingMonth,
        readingKind: query.readingKind,
        status: query.status,
      },
      orderBy: { createdAt: "desc" },
    });
    return readings.map(mapReading);
  }

  async findReadingById(id: string) {
    const reading = await this.prisma.utilityReading.findFirst({
      where: {
        id,
        deletedAt: null,
        room: { propertyId: authorizedPropertyId() },
      },
    });
    return reading ? mapReading(reading) : null;
  }

  async createReading(input: UtilityReadingSaveInput) {
    await this.assertReadingScope(input.roomId, input.tenancyId);
    return mapReading(
      await this.prisma.utilityReading.create({
        data: this.readingDataFor(
          input,
        ) as Prisma.UtilityReadingUncheckedCreateInput,
      }),
    );
  }

  async updateReading(id: string, input: Partial<UtilityReadingSaveInput>) {
    const current = await this.findReadingById(id);
    if (!current) return null;
    await this.assertReadingScope(
      input.roomId ?? current.roomId,
      input.tenancyId === undefined ? current.tenancyId : input.tenancyId,
    );
    return mapReading(
      await this.prisma.utilityReading.update({
        where: { id },
        data: this.readingDataFor(
          input,
        ) as Prisma.UtilityReadingUncheckedUpdateInput,
      }),
    );
  }

  async finalizeReading(id: string) {
    const current = await this.findReadingById(id);
    if (!current) return null;
    return mapReading(
      await this.prisma.utilityReading.update({
        where: { id },
        data: { status: "FINALIZED", finalizedAt: new Date() },
      }),
    );
  }

  async findFinalizedReading(input: {
    roomId: string;
    billingPeriodStart: string;
    billingPeriodEnd: string;
    readingKind: "MONTHLY" | "MOVE_OUT";
    excludeId?: string;
  }) {
    const reading = await this.prisma.utilityReading.findFirst({
      where: {
        id: input.excludeId ? { not: input.excludeId } : undefined,
        roomId: input.roomId,
        billingPeriodStart: dateValue(input.billingPeriodStart),
        billingPeriodEnd: dateValue(input.billingPeriodEnd),
        readingKind: input.readingKind,
        status: "FINALIZED",
        deletedAt: null,
        room: { propertyId: authorizedPropertyId() },
      },
    });
    return reading ? mapReading(reading) : null;
  }

  async findLatestFinalizedReading(input: {
    roomId: string;
    beforeOrOn: string;
  }) {
    const reading = await this.prisma.utilityReading.findFirst({
      where: {
        roomId: input.roomId,
        billingPeriodEnd: { lte: dateValue(input.beforeOrOn) },
        status: "FINALIZED",
        deletedAt: null,
        room: { propertyId: authorizedPropertyId() },
      },
      orderBy: [{ billingPeriodEnd: "desc" }, { finalizedAt: "desc" }],
    });
    return reading ? mapReading(reading) : null;
  }

  async listSettlements(input: {
    billingYear?: number;
    billingMonth?: number;
    tenancyId?: string;
    roomId?: string;
  }) {
    const settlements = await this.prisma.settlement.findMany({
      where: {
        deletedAt: null,
        room: { propertyId: authorizedPropertyId() },
        billingYear: input.billingYear,
        billingMonth: input.billingMonth,
        tenancyId: input.tenancyId,
        roomId: input.roomId,
      },
      include: { representativeTenant: { select: { fullName: true } } },
      orderBy: { createdAt: "desc" },
    });
    return settlements.map(mapSettlement);
  }

  async findSettlementById(id: string) {
    const settlement = await this.prisma.settlement.findFirst({
      where: {
        id,
        deletedAt: null,
        room: { propertyId: authorizedPropertyId() },
      },
      include: { representativeTenant: { select: { fullName: true } } },
    });
    return settlement ? mapSettlement(settlement) : null;
  }

  async createSettlement(input: SettlementSaveInput, actorUserId?: string) {
    const saved = await this.prisma.$transaction(async (tx) => {
      await this.assertSettlementScope(input, tx);
      const settlement = await tx.settlement.create({
        data: {
          settlementType: input.settlement.settlementType,
          status: input.settlement.status,
          roomId: input.settlement.roomId,
          tenancyId: input.settlement.tenancyId,
          representativeTenantId: input.settlement.representativeTenantId,
          utilityReadingId: input.settlement.utilityReadingId,
          periodStart: dateValue(input.settlement.periodStart),
          periodEnd: dateValue(input.settlement.periodEnd),
          billingYear: input.settlement.billingYear,
          billingMonth: input.settlement.billingMonth,
          occupiedDays: input.settlement.occupiedDays,
          daysInMonth: input.settlement.daysInMonth,
          rentAmount: input.settlement.rentAmount,
          proratedRentAmount: input.settlement.proratedRentAmount,
          electricityAmount: input.settlement.electricityAmount,
          waterAmount: input.settlement.waterAmount,
          totalAmount: input.settlement.totalAmount,
          prepaidAppliedAmount: input.settlement.prepaidAppliedAmount,
          carryForwardAmount: input.settlement.carryForwardAmount,
          outstandingAmount: input.settlement.outstandingAmount,
          finalizedAt: input.settlement.finalizedAt
            ? new Date(input.settlement.finalizedAt)
            : null,
          notes: input.settlement.notes,
        },
      });

      const savedSettlement = await tx.settlement.findUniqueOrThrow({
        where: { id: settlement.id },
        include: { representativeTenant: { select: { fullName: true } } },
      });
      await this.audit.record(
        {
          action: "ISSUE_INVOICE",
          entityType: "settlement",
          entityId: settlement.id,
          actorUserId,
          newValues: mapSettlement(savedSettlement),
          metadata: { mode: "settlement-finalized" },
        },
        tx,
      );
      return savedSettlement;
    });

    return mapSettlement(saved);
  }

  async findFinalizedSettlement(input: {
    tenancyId: string;
    periodStart: string;
    periodEnd: string;
  }) {
    const settlement = await this.prisma.settlement.findFirst({
      where: {
        tenancyId: input.tenancyId,
        periodStart: dateValue(input.periodStart),
        periodEnd: dateValue(input.periodEnd),
        status: "FINALIZED",
        deletedAt: null,
        room: { propertyId: authorizedPropertyId() },
      },
      include: { representativeTenant: { select: { fullName: true } } },
    });
    return settlement ? mapSettlement(settlement) : null;
  }

  async accountBalance(input: { tenancyId: string; effectiveOn?: string }) {
    const entries = await this.prisma.tenantAccountEntry.findMany({
      where: {
        tenancyId: input.tenancyId,
        propertyId: authorizedPropertyId(),
        deletedAt: null,
        effectiveOn: input.effectiveOn
          ? { lte: dateValue(input.effectiveOn) }
          : undefined,
      },
    });
    const balance = entries.reduce((total, entry) => {
      const amount = moneyValue(entry.amount.toString());
      return entry.direction === "CREDIT" ? total + amount : total - amount;
    }, 0n);
    return moneyString(balance > 0n ? balance : 0n);
  }

  private readingDataFor(input: Partial<UtilityReadingSaveInput>) {
    return {
      roomId: input.roomId,
      tenancyId: input.tenancyId,
      readingKind: input.readingKind,
      billingPeriodStart: input.billingPeriodStart
        ? dateValue(input.billingPeriodStart)
        : undefined,
      billingPeriodEnd: input.billingPeriodEnd
        ? dateValue(input.billingPeriodEnd)
        : undefined,
      billingYear: input.billingYear,
      billingMonth: input.billingMonth,
      electricityPrevious: input.electricityPrevious,
      electricityCurrent: input.electricityCurrent,
      electricityUsage: input.electricityUsage,
      electricityUnitPrice: input.electricityUnitPrice,
      electricityAmount: input.electricityAmount,
      waterPrevious: input.waterPrevious,
      waterCurrent: input.waterCurrent,
      waterUsage: input.waterUsage,
      waterUnitPrice: input.waterUnitPrice,
      waterAmount: input.waterAmount,
      status: input.status,
      recordedAt: input.recordedAt ? new Date(input.recordedAt) : undefined,
      finalizedAt: input.finalizedAt ? new Date(input.finalizedAt) : undefined,
      notes: input.notes,
    };
  }

  private async assertReadingScope(roomId: string, tenancyId?: string | null) {
    const room = await this.prisma.room.findFirst({
      where: {
        id: roomId,
        propertyId: authorizedPropertyId(),
        deletedAt: null,
      },
      select: { id: true },
    });
    if (!room) throw this.scopeException();
    if (!tenancyId) return;

    const tenancy = await this.prisma.tenancy.findFirst({
      where: {
        id: tenancyId,
        roomId,
        room: { propertyId: authorizedPropertyId() },
        deletedAt: null,
      },
      select: { id: true },
    });
    if (!tenancy) throw this.scopeException();
  }

  private async assertSettlementScope(
    input: SettlementSaveInput,
    tx: Prisma.TransactionClient,
  ) {
    const tenancy = await tx.tenancy.findFirst({
      where: {
        id: input.settlement.tenancyId,
        roomId: input.settlement.roomId,
        representativeTenantId: input.settlement.representativeTenantId,
        room: { propertyId: authorizedPropertyId() },
        deletedAt: null,
      },
      select: { id: true },
    });
    if (!tenancy) throw this.scopeException();
  }

  private scopeException() {
    return new DomainException(
      "PROPERTY_SCOPE_FORBIDDEN",
      "Resource does not belong to the authorized property",
      403,
    );
  }
}
