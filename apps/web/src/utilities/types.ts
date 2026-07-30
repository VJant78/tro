export type UtilityReadingKind = "MONTHLY" | "MOVE_OUT";
export type SettlementType = "MONTHLY" | "MOVE_OUT";

export interface UtilityReading {
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
  status: "DRAFT" | "FINALIZED" | "VOIDED";
}

export interface SettlementPreview {
  id: string | null;
  settlementType: SettlementType;
  status: "DRAFT" | "FINALIZED" | "VOIDED";
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
  creditBalanceBefore?: string;
  newPrepaidAmount?: string;
  creditBalanceAfter?: string;
  invoicePending?: boolean;
}

export interface FinalizeSettlementResponse {
  operation: {
    id: string;
    status: "INVOICE_PENDING" | "COMPLETED" | "ACTION_REQUIRED";
    replayed: boolean;
    retryable: boolean;
  };
  settlement: SettlementPreview;
  invoice: {
    id: string;
    invoiceNumber: string;
    outstandingAmount: string;
  } | null;
}

export type RecoverableOperationStatus = "INVOICE_PENDING" | "ACTION_REQUIRED";

export interface OperationRecoveryResponse {
  operation?: {
    id: string;
    status: RecoverableOperationStatus | "COMPLETED" | "CANCELLED";
    replayed: boolean;
    retryable: boolean;
  };
  id?: string;
  status?: RecoverableOperationStatus | "COMPLETED" | "CANCELLED";
  replayed?: boolean;
  cancelledAt?: string | null;
  cancelReason?: string | null;
}
