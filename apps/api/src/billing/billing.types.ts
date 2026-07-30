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
export type DebtStatus =
  "OUTSTANDING" | "PARTIALLY_PAID" | "DUE_TODAY" | "OVERDUE";

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
  paidAt: string;
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
}

export interface PaymentListQuery {
  invoiceId?: string;
  roomId?: string;
  payerTenantId?: string;
  paidFrom?: string;
  paidTo?: string;
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
  createInvoice(input: InvoiceCreateInput): Promise<InvoiceRecord>;
  listPayments(query: PaymentListQuery): Promise<PaymentRecord[]>;
  findPaymentByIdempotencyKey(
    idempotencyKey: string,
  ): Promise<PaymentRecord | null>;
  createPayment(input: PaymentCreateInput): Promise<PaymentCreateResult>;
  listDebts(query: DebtListQuery): Promise<DebtSummaryRecord[]>;
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
