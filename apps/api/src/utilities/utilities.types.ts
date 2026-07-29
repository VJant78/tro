export type UtilityReadingStatus = "DRAFT" | "FINALIZED" | "VOIDED";
export type UtilityReadingKind = "MONTHLY" | "MOVE_OUT";
export type SettlementType = "MONTHLY" | "MOVE_OUT";
export type SettlementStatus = "DRAFT" | "FINALIZED" | "VOIDED";
export type AccountEntryType = "PREPAYMENT" | "CREDIT_APPLIED";

export interface UtilityReadingRecord {
  id: string;
  roomId: string;
  tenancyId: string | null;
  readingKind: UtilityReadingKind;
  billingPeriodStart: string;
  billingPeriodEnd: string;
  billingYear: number;
  billingMonth: number;
  electricityPrevious: string;
  electricityCurrent: string;
  electricityUsage: string;
  electricityUnitPrice: string;
  electricityAmount: string;
  waterPrevious: string;
  waterCurrent: string;
  waterUsage: string;
  waterUnitPrice: string;
  waterAmount: string;
  status: UtilityReadingStatus;
  recordedAt: string;
  finalizedAt: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface UtilityReadingListQuery {
  roomId?: string;
  tenancyId?: string;
  billingYear?: number;
  billingMonth?: number;
  readingKind?: UtilityReadingKind;
  status?: UtilityReadingStatus;
}

export interface UtilityReadingCreateInput {
  roomId: string;
  tenancyId?: string | null;
  readingKind: UtilityReadingKind;
  billingPeriodStart: string;
  billingPeriodEnd: string;
  billingYear: number;
  billingMonth: number;
  electricityPrevious: string;
  electricityCurrent: string;
  waterPrevious: string;
  waterCurrent: string;
  recordedAt?: string;
  notes?: string | null;
}

export interface UtilityReadingSaveInput extends UtilityReadingCreateInput {
  electricityUsage: string;
  electricityUnitPrice: string;
  electricityAmount: string;
  waterUsage: string;
  waterUnitPrice: string;
  waterAmount: string;
  status?: UtilityReadingStatus;
  finalizedAt?: string | null;
}

export interface SettlementRecord {
  id: string;
  settlementType: SettlementType;
  status: SettlementStatus;
  roomId: string;
  tenancyId: string;
  representativeTenantId: string;
  representativeTenantName: string | null;
  utilityReadingId: string | null;
  periodStart: string;
  periodEnd: string;
  billingYear: number;
  billingMonth: number;
  occupiedDays: number;
  daysInMonth: number;
  rentAmount: string;
  proratedRentAmount: string;
  electricityAmount: string;
  waterAmount: string;
  totalAmount: string;
  prepaidAppliedAmount: string;
  carryForwardAmount: string;
  outstandingAmount: string;
  finalizedAt: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface SettlementInput {
  tenancyId: string;
  settlementType: SettlementType;
  billingYear: number;
  billingMonth: number;
  periodEnd?: string;
  utilityReadingId?: string | null;
  utilityReading?: SettlementReadingInput;
  prepaidAmount?: string;
  notes?: string | null;
}

export interface SettlementReadingInput {
  electricityPrevious: string;
  electricityCurrent: string;
  waterPrevious: string;
  waterCurrent: string;
}

export interface SettlementPreviewRecord extends Omit<SettlementRecord, "id"> {
  id: null;
  creditBalanceBefore: string;
  newPrepaidAmount: string;
  creditBalanceAfter: string;
}

export interface TenantAccountEntryRecord {
  id: string;
  tenantId: string;
  tenancyId: string | null;
  roomId: string | null;
  settlementId: string | null;
  entryType: AccountEntryType;
  amount: string;
  effectiveOn: string;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface SettlementSaveInput {
  settlement: Omit<
    SettlementRecord,
    "id" | "representativeTenantName" | "createdAt" | "updatedAt"
  >;
  prepaidAmount: string;
  creditAppliedAmount: string;
}

export interface UtilitiesRepository {
  listReadings(query: UtilityReadingListQuery): Promise<UtilityReadingRecord[]>;
  findReadingById(id: string): Promise<UtilityReadingRecord | null>;
  createReading(input: UtilityReadingSaveInput): Promise<UtilityReadingRecord>;
  updateReading(
    id: string,
    input: Partial<UtilityReadingSaveInput>,
  ): Promise<UtilityReadingRecord | null>;
  finalizeReading(id: string): Promise<UtilityReadingRecord | null>;
  findFinalizedReading(input: {
    roomId: string;
    billingPeriodStart: string;
    billingPeriodEnd: string;
    readingKind: UtilityReadingKind;
    excludeId?: string;
  }): Promise<UtilityReadingRecord | null>;
  listSettlements(input: {
    billingYear?: number;
    billingMonth?: number;
    tenancyId?: string;
    roomId?: string;
  }): Promise<SettlementRecord[]>;
  findSettlementById(id: string): Promise<SettlementRecord | null>;
  createSettlement(input: SettlementSaveInput): Promise<SettlementRecord>;
  findFinalizedSettlement(input: {
    tenancyId: string;
    periodStart: string;
    periodEnd: string;
  }): Promise<SettlementRecord | null>;
  accountBalance(input: {
    tenantId: string;
    effectiveOn?: string;
  }): Promise<string>;
}
