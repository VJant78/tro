export type InvoiceStatus =
  "DRAFT" | "ISSUED" | "PARTIALLY_PAID" | "PAID" | "OVERDUE" | "CANCELLED";
export type PaymentMethod = "CASH" | "BANK_TRANSFER" | "OTHER";
export type DebtStatus =
  "OUTSTANDING" | "PARTIALLY_PAID" | "DUE_TODAY" | "OVERDUE";

export interface UtilityUsage {
  previous: string;
  current: string;
  usage: string;
  unit: "kWh" | "m3";
  unitPrice: string;
  amount: string;
}

export interface InvoiceItem {
  id: string;
  itemType: string;
  description: string;
  quantity: string;
  unit: string | null;
  unitPrice: string;
  amount: string;
  sortOrder: number;
  utilityUsage: UtilityUsage | null;
  utilityUsageSource: "INVOICE_SNAPSHOT" | "LEGACY_FINALIZED_READING" | null;
}

export interface PaymentAllocation {
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
  payerTenantName: string | null;
  status: InvoiceStatus;
  billingPeriodStart: string;
  billingPeriodEnd: string;
  issuedOn: string | null;
  dueOn: string;
  totalAmount: string;
  paidAmount: string;
  outstandingAmount: string;
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

export type DashboardActionKind =
  | "UNSETTLED_PERIOD"
  | "INVOICE_PENDING"
  | "ACTION_REQUIRED"
  | "DUE_SOON"
  | "DUE_TODAY"
  | "OVERDUE";

export interface DashboardAction {
  id: string;
  kind: DashboardActionKind;
  roomId: string;
  roomCode: string | null;
  periodStart?: string | null;
  periodEnd?: string | null;
  dueOn?: string | null;
  amount?: string | null;
  reason?: string | null;
  target: {
    route: string;
    params?: Record<string, string>;
  };
}

export interface MonthlyReport {
  billingYear: number;
  billingMonth: number;
  periodStart: string;
  periodEnd: string;
  totals: {
    grossBilled: string;
    cashReceived: string;
    cashReversed: string;
    creditApplied: string;
    netOutstanding: string;
    invoiceTotal: string;
    collected: string;
    outstanding: string;
    overdue: string;
    electricity: string;
    water: string;
  };
  invoices: Invoice[];
  payments: Payment[];
  debts: DebtSummary[];
}
