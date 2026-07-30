import { Injectable } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { InvoiceNotFoundException } from "./billing.errors.js";
import { buildDebtSummaries } from "./debt-summary.js";
import type {
  BillingRepository,
  DebtListQuery,
  InvoiceCreateInput,
  InvoiceListQuery,
  InvoiceRecord,
  PaymentCreateInput,
  PaymentCreateResult,
  PaymentListQuery,
  PaymentRecord,
} from "./billing.types.js";

@Injectable()
export class InMemoryBillingRepository implements BillingRepository {
  private readonly invoices = new Map<string, InvoiceRecord>();
  private readonly payments = new Map<string, PaymentRecord>();

  async listInvoices(query: InvoiceListQuery) {
    return [...this.invoices.values()]
      .filter((invoice) => !query.roomId || invoice.roomId === query.roomId)
      .filter(
        (invoice) => !query.tenancyId || invoice.tenancyId === query.tenancyId,
      )
      .filter(
        (invoice) =>
          !query.payerTenantId || invoice.payerTenantId === query.payerTenantId,
      )
      .filter((invoice) => !query.status || invoice.status === query.status)
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  }

  async findInvoiceById(id: string) {
    return this.invoices.get(id) ?? null;
  }

  async findInvoiceBySourceKey(sourceKey: string) {
    return (
      [...this.invoices.values()].find(
        (invoice) => invoice.sourceKey === sourceKey,
      ) ?? null
    );
  }

  async createInvoice(input: InvoiceCreateInput) {
    const now = new Date().toISOString();
    const invoice: InvoiceRecord = {
      ...input,
      id: randomUUID(),
      roomCode: null,
      payerTenantName: null,
      fullyPaidAt: null,
      createdAt: now,
      updatedAt: now,
      items: input.items.map((item) => ({
        id: randomUUID(),
        invoiceId: "",
        itemType: item.itemType,
        description: item.description,
        quantity: item.quantity,
        unit: item.unit,
        unitPrice: item.unitPrice,
        amount: item.amount,
        sortOrder: item.sortOrder,
        metadata: item.metadata ?? null,
        createdAt: now,
        updatedAt: now,
      })),
      paymentAllocations: [],
    };
    invoice.items = invoice.items.map((item) => ({
      ...item,
      invoiceId: invoice.id,
    }));
    this.invoices.set(invoice.id, invoice);
    return invoice;
  }

  async listPayments(query: PaymentListQuery) {
    return [...this.payments.values()]
      .filter((payment) => !query.roomId || payment.roomId === query.roomId)
      .filter(
        (payment) =>
          !query.payerTenantId || payment.payerTenantId === query.payerTenantId,
      )
      .filter(
        (payment) =>
          !query.invoiceId ||
          payment.allocations.some(
            (allocation) => allocation.invoiceId === query.invoiceId,
          ),
      )
      .sort((left, right) => right.paidAt.localeCompare(left.paidAt));
  }

  async findPaymentByIdempotencyKey(idempotencyKey: string) {
    return (
      [...this.payments.values()].find(
        (payment) => payment.idempotencyKey === idempotencyKey,
      ) ?? null
    );
  }

  async createPayment(input: PaymentCreateInput): Promise<PaymentCreateResult> {
    const invoice = this.invoices.get(input.invoiceId);
    if (!invoice) throw new InvoiceNotFoundException();

    const amount = Number(input.amount);
    const outstanding = Number(invoice.outstandingAmount);
    const nextPaid = Number(invoice.paidAmount) + amount;
    const nextOutstanding = outstanding - amount;
    const now = new Date().toISOString();
    const paymentId = randomUUID();
    const allocation = {
      id: randomUUID(),
      paymentId,
      invoiceId: invoice.id,
      amount: input.amount,
      allocatedAt: input.paidAt,
      paymentNumber: input.paymentNumber,
      paymentMethod: input.method,
      paymentStatus: "CONFIRMED" as const,
      paidAt: input.paidAt,
      createdAt: now,
      updatedAt: now,
    };
    const payment: PaymentRecord = {
      id: paymentId,
      paymentNumber: input.paymentNumber,
      propertyId: invoice.propertyId,
      roomId: invoice.roomId,
      roomCode: invoice.roomCode,
      payerTenantId: invoice.payerTenantId,
      payerTenantName: invoice.payerTenantName,
      amount: input.amount,
      method: input.method,
      status: "CONFIRMED",
      paidAt: input.paidAt,
      idempotencyKey: input.idempotencyKey ?? null,
      description: input.description ?? null,
      notes: input.notes ?? null,
      createdAt: now,
      updatedAt: now,
      allocations: [allocation],
    };
    const updatedInvoice: InvoiceRecord = {
      ...invoice,
      paidAmount: String(nextPaid),
      outstandingAmount: String(Math.max(0, nextOutstanding)),
      status: nextOutstanding <= 0 ? "PAID" : "PARTIALLY_PAID",
      fullyPaidAt: nextOutstanding <= 0 ? now : invoice.fullyPaidAt,
      updatedAt: now,
      paymentAllocations: [...invoice.paymentAllocations, allocation],
    };
    this.payments.set(payment.id, payment);
    this.invoices.set(invoice.id, updatedInvoice);
    return { payment, invoice: updatedInvoice };
  }

  async listDebts(query: DebtListQuery) {
    const invoices = await this.listInvoices({});
    return buildDebtSummaries(invoices, query);
  }
}
