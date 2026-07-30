import type { PaymentMethod } from "../billing/types";

export type ReceiptStatus = "CONFIRMED" | "VOIDED";

export interface ReceiptIntent {
  amount: string;
  method: PaymentMethod;
  receivedAt: string;
  payerTenantId?: string;
  notes?: string;
}

export interface ReceiptAllocation {
  id?: string;
  invoiceId: string;
  invoiceNumber: string;
  billingPeriodStart: string;
  billingPeriodEnd: string;
  amount: string;
}

export interface ReceiptPreview {
  previewToken: string;
  expiresAt: string;
  allocations: ReceiptAllocation[];
  creditCreated: string;
  creditBalanceAfter: string;
}

export interface ReceiptSummary {
  creditBalance: string;
  receiptCount: number;
}

export interface Receipt {
  id: string;
  receiptNumber: string;
  tenancyId: string;
  roomId?: string;
  amount: string;
  method: PaymentMethod;
  receivedAt: string;
  status: ReceiptStatus;
  canVoid: boolean;
  payerTenantId?: string | null;
  payerTenantName?: string | null;
  notes?: string | null;
  recordedByName?: string | null;
  creditCreated?: string;
  creditBalanceAfter?: string;
  voidedAt?: string | null;
  voidReason?: string | null;
}

export interface ReceiptResult {
  receipt: Receipt;
  allocations: ReceiptAllocation[];
  creditCreated: string;
  creditBalanceAfter: string;
  replayed: boolean;
}

export interface ReceiptDetail extends ReceiptResult {
  transfers?: Array<{
    id: string;
    amount: string;
    direction: "IN" | "OUT";
    createdAt: string;
  }>;
  reversal?: {
    voidedAt: string;
    reason: string;
  } | null;
}

export interface ReceiptHistoryResponse {
  data: Receipt[];
  page: {
    limit: number;
    nextCursor: string | null;
    hasMore: boolean;
  };
  summary?: ReceiptSummary;
}

export type VoidReceiptResponse = ReceiptResult;
