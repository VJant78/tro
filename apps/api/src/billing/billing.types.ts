export type InvoiceType = "RENT" | "UTILITY" | "COMBINED" | "ADJUSTMENT";
export type InvoiceStatus =
  "DRAFT" | "ISSUED" | "PARTIALLY_PAID" | "PAID" | "OVERDUE" | "CANCELLED";
export type InvoiceItemType =
  | "RENT"
  | "ELECTRICITY"
  | "WATER"
  | "TRASH"
  | "INTERNET"
  | "SERVICE"
  | "SURCHARGE"
  | "DISCOUNT"
  | "ADJUSTMENT"
  | "PREVIOUS_DEBT";
export type PaymentMethod = "CASH" | "BANK_TRANSFER" | "OTHER";
export type PaymentStatus = "PENDING" | "CONFIRMED" | "VOIDED" | "REFUNDED";
export type PaymentSourceType =
  "LEGACY_INVOICE" | "DAILY_RECEIPT" | "LEGACY_PREPAYMENT";
export type DebtStatus =
  "OUTSTANDING" | "PARTIALLY_PAID" | "DUE_TODAY" | "OVERDUE";

export interface UtilityUsageRecord {
  previous: string;
  current: string;
  usage: string;
  unit: "kWh" | "m3";
  unitPrice: string;
  amount: string;
}

export type UtilityUsageSource =
  "INVOICE_SNAPSHOT" | "LEGACY_FINALIZED_READING";

export interface InvoiceItemRecord {
  id: string;
  invoiceId: string;
  itemType: InvoiceItemType;
  description: string;
  quantity: string;
  unit: string | null;
  unitPrice: string;
  amount: string;
  sortOrder: number;
  metadata: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
}

export interface PaymentAllocationRecord {
  id: string;
  paymentId: string;
  invoiceId: string;
  amount: string;
  allocatedAt: string;
  paymentNumber: string | null;
  paymentMethod: PaymentMethod | null;
  paymentStatus: PaymentStatus | null;
  paidAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface InvoiceRecord {
  id: string;
  invoiceNumber: string;
  propertyId: string;
  roomId: string;
  roomCode: string | null;
  tenancyId: string | null;
  payerTenantId: string | null;
  payerTenantName: string | null;
  invoiceType: InvoiceType;
  status: InvoiceStatus;
  billingPeriodStart: string;
  billingPeriodEnd: string;
  billingYear: number;
  billingMonth: number | null;
  issuedOn: string | null;
  dueOn: string;
  totalAmount: string;
  paidAmount: string;
  outstandingAmount: string;
  fullyPaidAt: string | null;
  sourceKey: string | null;
  pricingSnapshot: Record<string, unknown> | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  items: InvoiceItemRecord[];
  paymentAllocations: PaymentAllocationRecord[];
}

export interface PaymentRecord {
  id: string;
  paymentNumber: string;
  propertyId: string;
  roomId: string;
  roomCode: string | null;
  payerTenantId: string | null;
  payerTenantName: string | null;
  amount: string;
  method: PaymentMethod;
  status: PaymentStatus;
  sourceType: PaymentSourceType;
  paidAt: string;
  voidedAt: string | null;
  voidReason: string | null;
  idempotencyKey: string | null;
  description: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  allocations: PaymentAllocationRecord[];
}

export interface InvoiceListQuery {
  roomId?: string;
  tenancyId?: string;
  payerTenantId?: string;
  status?: InvoiceStatus;
  billingYear?: number;
  billingMonth?: number;
  limit?: number;
}

export interface PaymentListQuery {
  invoiceId?: string;
  roomId?: string;
  payerTenantId?: string;
  paidFrom?: string;
  paidTo?: string;
  eventFrom?: string;
  eventTo?: string;
}

export interface DebtListQuery {
  roomId?: string;
  payerTenantId?: string;
  status?: DebtStatus;
  asOf?: string;
}

export interface DebtSummaryRecord {
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
  invoices: InvoiceRecord[];
}

export interface InvoiceCreateInput {
  invoiceNumber: string;
  propertyId: string;
  roomId: string;
  tenancyId: string | null;
  payerTenantId: string | null;
  invoiceType: InvoiceType;
  status: InvoiceStatus;
  billingPeriodStart: string;
  billingPeriodEnd: string;
  billingYear: number;
  billingMonth: number | null;
  issuedOn: string;
  dueOn: string;
  totalAmount: string;
  paidAmount: string;
  outstandingAmount: string;
  sourceKey: string;
  pricingSnapshot: Record<string, unknown>;
  notes: string | null;
  items: Array<{
    itemType: InvoiceItemType;
    description: string;
    quantity: string;
    unit: string | null;
    unitPrice: string;
    amount: string;
    sortOrder: number;
    metadata?: Record<string, unknown> | null;
  }>;
}

export interface PaymentCreateInput {
  paymentNumber: string;
  invoiceId: string;
  amount: string;
  method: PaymentMethod;
  paidAt: string;
  idempotencyKey?: string | null;
  requestHash: string;
  actorUserId?: string;
  description?: string | null;
  notes?: string | null;
}

export interface PaymentCreateResult {
  payment: PaymentRecord;
  invoice: InvoiceRecord;
}

export interface BillingRepository {
  listInvoices(query: InvoiceListQuery): Promise<InvoiceRecord[]>;
  findInvoiceById(id: string): Promise<InvoiceRecord | null>;
  findInvoiceBySourceKey(sourceKey: string): Promise<InvoiceRecord | null>;
  createInvoice(
    input: InvoiceCreateInput,
    actorUserId?: string,
  ): Promise<InvoiceRecord>;
  listPayments(query: PaymentListQuery): Promise<PaymentRecord[]>;
  createPayment(input: PaymentCreateInput): Promise<PaymentCreateResult>;
  listDebts(query: DebtListQuery): Promise<DebtSummaryRecord[]>;
}

export interface InvoiceItemReadRecord {
  id: string;
  itemType: InvoiceItemType;
  description: string;
  quantity: string;
  unit: string | null;
  unitPrice: string;
  amount: string;
  sortOrder: number;
  utilityUsage: UtilityUsageRecord | null;
  utilityUsageSource: UtilityUsageSource | null;
}

export interface InvoiceReadRecord {
  id: string;
  invoiceNumber: string;
  roomId: string;
  roomCode: string | null;
  payerTenantName: string | null;
  invoiceType: InvoiceType;
  status: InvoiceStatus;
  billingPeriodStart: string;
  billingPeriodEnd: string;
  billingYear: number;
  billingMonth: number | null;
  issuedOn: string | null;
  dueOn: string;
  totalAmount: string;
  paidAmount: string;
  outstandingAmount: string;
  fullyPaidAt: string | null;
  items: InvoiceItemReadRecord[];
  paymentAllocations: Array<{
    amount: string;
    allocatedAt: string;
    paymentNumber: string | null;
    paymentMethod: PaymentMethod | null;
    paymentStatus: PaymentStatus | null;
    paidAt: string | null;
  }>;
}

export interface PaymentReadRecord {
  id: string;
  paymentNumber: string;
  roomId: string;
  roomCode: string | null;
  payerTenantName: string | null;
  amount: string;
  method: PaymentMethod;
  status: PaymentStatus;
  paidAt: string;
  voidedAt: string | null;
}

export interface DebtSummaryReadRecord extends Omit<
  DebtSummaryRecord,
  "invoices"
> {
  invoices: InvoiceReadRecord[];
}

export interface DashboardSummaryRecord {
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

export interface DashboardActionRecord {
  id: string;
  kind: DashboardActionKind;
  roomId: string;
  roomCode: string | null;
  periodStart: string | null;
  periodEnd: string | null;
  dueOn: string | null;
  amount: string | null;
  target: {
    route: "/utilities" | "/invoices";
    params: Record<string, string>;
  };
}

export interface DashboardActionsRecord {
  asOf: string;
  dueSoonDays: 3;
  items: DashboardActionRecord[];
}

export interface MonthlyReportRecord {
  billingYear: number;
  billingMonth: number;
  periodStart: string;
  periodEnd: string;
  totals: {
    invoiceTotal: string;
    collected: string;
    outstanding: string;
    grossBilled: string;
    cashReceived: string;
    cashReversed: string;
    creditApplied: string;
    netOutstanding: string;
    overdue: string;
    electricity: string;
    water: string;
  };
  invoices: InvoiceReadRecord[];
  payments: PaymentReadRecord[];
  debts: DebtSummaryReadRecord[];
}
