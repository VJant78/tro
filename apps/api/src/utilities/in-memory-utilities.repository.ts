import { randomUUID } from "node:crypto";
import { Inject, Injectable } from "@nestjs/common";
import { AuditService } from "../audit/audit.service.js";
import { moneyString, moneyValue } from "../platform/numeric.js";
import type {
  SettlementRecord,
  SettlementSaveInput,
  UtilitiesRepository,
  UtilityReadingListQuery,
  UtilityReadingRecord,
  UtilityReadingSaveInput,
} from "./utilities.types.js";

type StoredReading = UtilityReadingRecord & { deletedAt: string | null };
type StoredSettlement = SettlementRecord & { deletedAt: string | null };
type StoredAccountEntry = {
  id: string;
  tenantId: string;
  settlementId: string | null;
  entryType: "PREPAYMENT" | "CREDIT_APPLIED";
  amount: string;
  effectiveOn: string;
  deletedAt: string | null;
};

@Injectable()
export class InMemoryUtilitiesRepository implements UtilitiesRepository {
  private readonly readings: StoredReading[] = [];
  private readonly settlements: StoredSettlement[] = [];
  private readonly accountEntries: StoredAccountEntry[] = [];

  constructor(@Inject(AuditService) private readonly audit: AuditService) {}

  async listReadings(query: UtilityReadingListQuery) {
    return this.readings
      .filter((reading) => !reading.deletedAt)
      .filter((reading) => !query.roomId || reading.roomId === query.roomId)
      .filter(
        (reading) => !query.tenancyId || reading.tenancyId === query.tenancyId,
      )
      .filter(
        (reading) =>
          !query.billingYear || reading.billingYear === query.billingYear,
      )
      .filter(
        (reading) =>
          !query.billingMonth || reading.billingMonth === query.billingMonth,
      )
      .filter(
        (reading) =>
          !query.readingKind || reading.readingKind === query.readingKind,
      )
      .filter((reading) => !query.status || reading.status === query.status)
      .map(stripReadingDeletedAt)
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  }

  async findReadingById(id: string) {
    const reading = this.readings.find(
      (item) => item.id === id && !item.deletedAt,
    );
    return reading ? stripReadingDeletedAt(reading) : null;
  }

  async createReading(input: UtilityReadingSaveInput) {
    const now = new Date().toISOString();
    const reading: StoredReading = {
      id: randomUUID(),
      roomId: input.roomId,
      tenancyId: input.tenancyId ?? null,
      readingKind: input.readingKind,
      billingPeriodStart: input.billingPeriodStart,
      billingPeriodEnd: input.billingPeriodEnd,
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
      status: input.status ?? "DRAFT",
      recordedAt: input.recordedAt ?? now,
      finalizedAt: input.finalizedAt ?? null,
      notes: input.notes ?? null,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    };
    this.readings.push(reading);
    return stripReadingDeletedAt(reading);
  }

  async updateReading(id: string, input: Partial<UtilityReadingSaveInput>) {
    const reading = this.readings.find(
      (item) => item.id === id && !item.deletedAt,
    );
    if (!reading) return null;
    Object.assign(reading, input, { updatedAt: new Date().toISOString() });
    return stripReadingDeletedAt(reading);
  }

  async finalizeReading(id: string) {
    const reading = this.readings.find(
      (item) => item.id === id && !item.deletedAt,
    );
    if (!reading) return null;
    reading.status = "FINALIZED";
    reading.finalizedAt = new Date().toISOString();
    reading.updatedAt = reading.finalizedAt;
    return stripReadingDeletedAt(reading);
  }

  async findFinalizedReading(input: {
    roomId: string;
    billingPeriodStart: string;
    billingPeriodEnd: string;
    readingKind: "MONTHLY" | "MOVE_OUT";
    excludeId?: string;
  }) {
    const reading = this.readings.find(
      (item) =>
        item.id !== input.excludeId &&
        item.roomId === input.roomId &&
        item.billingPeriodStart === input.billingPeriodStart &&
        item.billingPeriodEnd === input.billingPeriodEnd &&
        item.readingKind === input.readingKind &&
        item.status === "FINALIZED" &&
        !item.deletedAt,
    );
    return reading ? stripReadingDeletedAt(reading) : null;
  }

  async findLatestFinalizedReading(input: {
    roomId: string;
    beforeOrOn: string;
  }) {
    const reading = this.readings
      .filter(
        (item) =>
          !item.deletedAt &&
          item.roomId === input.roomId &&
          item.status === "FINALIZED" &&
          item.billingPeriodEnd <= input.beforeOrOn,
      )
      .sort((left, right) =>
        right.billingPeriodEnd.localeCompare(left.billingPeriodEnd),
      )[0];
    return reading ? stripReadingDeletedAt(reading) : null;
  }

  async listSettlements(input: {
    billingYear?: number;
    billingMonth?: number;
    tenancyId?: string;
    roomId?: string;
  }) {
    return this.settlements
      .filter((settlement) => !settlement.deletedAt)
      .filter(
        (settlement) =>
          !input.billingYear || settlement.billingYear === input.billingYear,
      )
      .filter(
        (settlement) =>
          !input.billingMonth || settlement.billingMonth === input.billingMonth,
      )
      .filter(
        (settlement) =>
          !input.tenancyId || settlement.tenancyId === input.tenancyId,
      )
      .filter(
        (settlement) => !input.roomId || settlement.roomId === input.roomId,
      )
      .map(stripSettlementDeletedAt)
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  }

  async findSettlementById(id: string) {
    const settlement = this.settlements.find(
      (item) => item.id === id && !item.deletedAt,
    );
    return settlement ? stripSettlementDeletedAt(settlement) : null;
  }

  async createSettlement(input: SettlementSaveInput, actorUserId?: string) {
    const now = new Date().toISOString();
    const id = randomUUID();
    const settlement: StoredSettlement = {
      ...input.settlement,
      id,
      representativeTenantName: null,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    };
    this.settlements.push(settlement);
    await this.audit.record({
      action: "ISSUE_INVOICE",
      entityType: "settlement",
      entityId: settlement.id,
      actorUserId,
      newValues: stripSettlementDeletedAt(settlement),
      metadata: { mode: "settlement-finalized" },
    });
    return stripSettlementDeletedAt(settlement);
  }

  async findFinalizedSettlement(input: {
    tenancyId: string;
    periodStart: string;
    periodEnd: string;
  }) {
    const settlement = this.settlements.find(
      (item) =>
        item.tenancyId === input.tenancyId &&
        item.periodStart === input.periodStart &&
        item.periodEnd === input.periodEnd &&
        item.status === "FINALIZED" &&
        !item.deletedAt,
    );
    return settlement ? stripSettlementDeletedAt(settlement) : null;
  }

  async accountBalance(input: { tenancyId: string; effectiveOn?: string }) {
    const balance = this.accountEntries
      .filter(
        (entry) =>
          this.settlements.some(
            (settlement) =>
              settlement.id === entry.settlementId &&
              settlement.tenancyId === input.tenancyId,
          ) && !entry.deletedAt,
      )
      .filter(
        (entry) => !input.effectiveOn || entry.effectiveOn <= input.effectiveOn,
      )
      .reduce((total, entry) => {
        const amount = moneyValue(entry.amount);
        return entry.entryType === "PREPAYMENT"
          ? total + amount
          : total - amount;
      }, 0n);
    return moneyString(balance > 0n ? balance : 0n);
  }
}

function stripReadingDeletedAt(reading: StoredReading): UtilityReadingRecord {
  const { deletedAt: _deletedAt, ...record } = reading;
  return record;
}

function stripSettlementDeletedAt(
  settlement: StoredSettlement,
): SettlementRecord {
  const { deletedAt: _deletedAt, ...record } = settlement;
  return record;
}
