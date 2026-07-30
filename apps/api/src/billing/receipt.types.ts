import type { PaymentMethod, PaymentStatus } from "./billing.types.js";

export interface ReceiptIntent {
  amount: string;
  method: PaymentMethod;
  receivedAt: string;
  payerTenantId: string | null;
  notes: string | null;
}

export interface ReceiptInvoiceSnapshot {
  id: string;
  invoiceNumber: string;
  billingPeriodStart: string;
  billingPeriodEnd: string;
  dueOn: string;
  createdAt: string;
  updatedAt: string;
  outstandingAmount: string;
}

export interface ReceiptAllocationLine {
  id?: string;
  invoiceId: string;
  invoiceNumber: string;
  billingPeriodStart: string;
  billingPeriodEnd: string;
  amount: string;
}

export interface ReceiptRecord {
  id: string;
  receiptNumber: string;
  tenancyId: string;
  roomId: string;
  amount: string;
  method: PaymentMethod;
  receivedAt: string;
  status: Extract<PaymentStatus, "CONFIRMED" | "VOIDED">;
  payerTenantId: string | null;
  payerTenantName: string | null;
  notes: string | null;
  recordedByName: string | null;
  voidedAt: string | null;
  voidReason: string | null;
  canVoid: boolean;
}

export interface ReceiptResult {
  receipt: ReceiptRecord;
  allocations: ReceiptAllocationLine[];
  creditCreated: string;
  creditBalanceAfter: string;
  replayed: boolean;
}

export interface ReceiptPreviewResult {
  previewToken: string;
  expiresAt: string;
  allocations: ReceiptAllocationLine[];
  creditCreated: string;
  creditBalanceAfter: string;
}

export interface ReceiptTokenPayload {
  version: 1;
  propertyId: string;
  tenancyId: string;
  actorUserId: string;
  intentHash: string;
  snapshotHash: string;
  issuedAt: number;
  expiresAt: number;
}
