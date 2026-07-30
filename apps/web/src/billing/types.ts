export type InvoiceStatus =
  "DRAFT" | "ISSUED" | "PARTIALLY_PAID" | "PAID" | "OVERDUE" | "CANCELLED";
export type PaymentMethod = "CASH" | "BANK_TRANSFER" | "OTHER";
export type DebtStatus =
  "OUTSTANDING" | "PARTIALLY_PAID" | "DUE_TODAY" | "OVERDUE";

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

export interface PaymentAllocation {
  id: string;
  paymentId: string;
  invoiceId: string;
  amount: string;
  allocatedAt: string;
  paymentNumber: string | null;
  paymentMethod: PaymentMethod | null;
  paymentStatus: string | null;
  paidAt: string | null;
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
  paymentAllocations: PaymentAllocation[];
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
  debtStatus: DebtStatus;
  invoiceCount: number;
  totalOutstanding: string;
  nearestDueOn: string | null;
  daysOverdue: number;
  latestPaymentAt: string | null;
  invoices: Invoice[];
}

export interface DashboardSummary {
  asOf: string;
  billingYear: number;
  billingMonth: number;
  totals: {
    rooms: number;
    occupiedRooms: number;
    currentMonthCollectable: string;
    currentMonthCollected: string;
    currentMonthOutstanding: string;
    overdueInvoiceCount: number;
    overdueAmount: string;
  };
  needsAttention: Array<{
    kind: "OVERDUE_DEBT";
    roomId: string;
    roomCode: string | null;
    payerTenantId: string | null;
    payerTenantName: string | null;
    totalOutstanding: string;
    daysOverdue: number;
    nearestDueOn: string | null;
  }>;
}
