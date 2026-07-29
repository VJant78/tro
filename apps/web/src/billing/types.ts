export type InvoiceStatus =
  "DRAFT" | "ISSUED" | "PARTIALLY_PAID" | "PAID" | "OVERDUE" | "CANCELLED";
export type PaymentMethod = "CASH" | "BANK_TRANSFER" | "OTHER";

export interface InvoiceItem {
  id: string;
  invoiceId: string;
  itemType: string;
  description: string;
  quantity: string;
  unit: string | null;
  unitPrice: string;
  amount: string;
  sortOrder: number;
}

export interface Invoice {
  id: string;
  invoiceNumber: string;
  roomId: string;
  roomCode: string | null;
  tenancyId: string | null;
  payerTenantId: string | null;
  payerTenantName: string | null;
  status: InvoiceStatus;
  billingPeriodStart: string;
  billingPeriodEnd: string;
  issuedOn: string | null;
  dueOn: string;
  totalAmount: string;
  paidAmount: string;
  outstandingAmount: string;
  sourceKey: string | null;
  notes: string | null;
  items: InvoiceItem[];
}

export interface Payment {
  id: string;
  paymentNumber: string;
  roomId: string;
  roomCode: string | null;
  payerTenantId: string | null;
  payerTenantName: string | null;
  amount: string;
  method: PaymentMethod;
  status: string;
  paidAt: string;
}

export interface DebtSummary {
  roomId: string;
  roomCode: string | null;
  payerTenantId: string | null;
  payerTenantName: string | null;
  invoiceCount: number;
  totalOutstanding: string;
  invoices: Invoice[];
}
