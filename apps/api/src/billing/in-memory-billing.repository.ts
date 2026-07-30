import { Inject, Injectable } from "@nestjs/common";
import { AuditService } from "../audit/audit.service.js";
import { randomUUID } from "node:crypto";
import { moneyString, moneyValue } from "../platform/numeric.js";
import { authorizedPropertyId } from "../platform/property-scope.js";
import {
  BillingValidationException,
  InvoiceNotFoundException,
  PaymentIdempotencyKeyReusedException,
} from "./billing.errors.js";
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
  private readonly paymentHashes = new Map<string, string>();

  constructor(@Inject(AuditService) private readonly audit: AuditService) {}

  async listInvoices(query: InvoiceListQuery) {
    return [...this.invoices.values()]
      .filter((invoice) => invoice.propertyId === authorizedPropertyId())
      .filter((invoice) => !query.roomId || invoice.roomId === query.roomId)
      .filter(
        (invoice) => !query.tenancyId || invoice.tenancyId === query.tenancyId,
      )
      .filter(
        (invoice) =>
          !query.payerTenantId || invoice.payerTenantId === query.payerTenantId,
      )
      .filter((invoice) => !query.status || invoice.status === query.status)
      .filter(
        (invoice) =>
          !query.billingYear || invoice.billingYear === query.billingYear,
      )
      .filter(
        (invoice) =>
          !query.billingMonth || invoice.billingMonth === query.billingMonth,
      )
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
      .slice(0, query.limit ?? Number.MAX_SAFE_INTEGER);
  }

  async findInvoiceById(id: string) {
    const invoice = this.invoices.get(id);
    return invoice?.propertyId === authorizedPropertyId() ? invoice : null;
  }

  async findInvoiceBySourceKey(sourceKey: string) {
    return (
      [...this.invoices.values()].find(
        (invoice) =>
          invoice.sourceKey === sourceKey &&
          invoice.propertyId === authorizedPropertyId(),
      ) ?? null
    );
  }

  async createInvoice(input: InvoiceCreateInput, actorUserId?: string) {
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
    await this.audit.record({
      action: "ISSUE_INVOICE",
      entityType: "invoice",
      entityId: invoice.id,
      actorUserId,
      newValues: invoice,
      metadata: { sourceKey: input.sourceKey },
    });
    return invoice;
  }

  async listPayments(query: PaymentListQuery) {
    return [...this.payments.values()]
      .filter((payment) => payment.propertyId === authorizedPropertyId())
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
      .filter(
        (payment) =>
          !query.paidFrom || payment.paidAt.slice(0, 10) >= query.paidFrom,
      )
      .filter(
        (payment) =>
          !query.paidTo || payment.paidAt.slice(0, 10) <= query.paidTo,
      )
      .filter(
        (payment) =>
          (!query.eventFrom && !query.eventTo) ||
          dateInRange(payment.paidAt, query.eventFrom, query.eventTo) ||
          dateInRange(payment.voidedAt, query.eventFrom, query.eventTo),
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
    const replay = input.idempotencyKey
      ? [...this.payments.values()].find(
          (payment) => payment.idempotencyKey === input.idempotencyKey,
        )
      : null;
    if (replay) {
      if (this.paymentHashes.get(replay.id) !== input.requestHash) {
        throw new PaymentIdempotencyKeyReusedException();
      }
      const invoice = this.invoices.get(input.invoiceId);
      if (!invoice) throw new InvoiceNotFoundException();
      return { payment: replay, invoice };
    }
    const invoice = this.invoices.get(input.invoiceId);
    if (!invoice) throw new InvoiceNotFoundException();
    if (invoice.propertyId !== authorizedPropertyId()) {
      throw new InvoiceNotFoundException();
    }
    if (!invoice.tenancyId) {
      throw new BillingValidationException(
        "Invoice must belong to a tenancy before it can be paid",
      );
    }
    const oldestInvoice = [...this.invoices.values()]
      .filter(
        (candidate) =>
          candidate.propertyId === invoice.propertyId &&
          candidate.tenancyId === invoice.tenancyId &&
          candidate.status !== "CANCELLED" &&
          moneyValue(candidate.outstandingAmount) > 0n,
      )
      .sort(compareInvoiceFifo)[0];
    if (oldestInvoice?.id !== invoice.id) {
      throw new BillingValidationException(
        "Payment must target the oldest outstanding invoice",
      );
    }

    const amount = moneyValue(input.amount);
    const outstanding = moneyValue(invoice.outstandingAmount);
    const nextPaid = moneyValue(invoice.paidAmount) + amount;
    const nextOutstanding = outstanding - amount;
    if (invoice.status === "CANCELLED") {
      throw new BillingValidationException("Cannot pay a cancelled invoice");
    }
    if (invoice.status === "PAID" || outstanding === 0n) {
      throw new BillingValidationException("Invoice is already paid");
    }
    if (amount > outstanding) {
      throw new BillingValidationException(
        "Payment amount cannot exceed invoice outstanding amount",
      );
    }
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
      sourceType: "LEGACY_INVOICE",
      paidAt: input.paidAt,
      voidedAt: null,
      voidReason: null,
      idempotencyKey: input.idempotencyKey ?? null,
      description: input.description ?? null,
      notes: input.notes ?? null,
      createdAt: now,
      updatedAt: now,
      allocations: [allocation],
    };
    const updatedInvoice: InvoiceRecord = {
      ...invoice,
      paidAmount: moneyString(nextPaid),
      outstandingAmount: moneyString(
        nextOutstanding > 0n ? nextOutstanding : 0n,
      ),
      status: nextOutstanding <= 0n ? "PAID" : "PARTIALLY_PAID",
      fullyPaidAt: nextOutstanding <= 0n ? now : invoice.fullyPaidAt,
      updatedAt: now,
      paymentAllocations: [...invoice.paymentAllocations, allocation],
    };
    this.payments.set(payment.id, payment);
    this.paymentHashes.set(payment.id, input.requestHash);
    this.invoices.set(invoice.id, updatedInvoice);
    await this.audit.record({
      action: "CONFIRM_PAYMENT",
      entityType: "payment",
      entityId: payment.id,
      actorUserId: input.actorUserId,
      newValues: payment,
      metadata: { invoiceId: invoice.id },
    });
    return { payment, invoice: updatedInvoice };
  }

  async listDebts(query: DebtListQuery) {
    const invoices = await this.listInvoices({ roomId: query.roomId });
    return buildDebtSummaries(invoices, query);
  }
}

function compareInvoiceFifo(left: InvoiceRecord, right: InvoiceRecord) {
  return (
    left.billingPeriodStart.localeCompare(right.billingPeriodStart) ||
    left.billingPeriodEnd.localeCompare(right.billingPeriodEnd) ||
    left.dueOn.localeCompare(right.dueOn) ||
    left.createdAt.localeCompare(right.createdAt) ||
    left.id.localeCompare(right.id)
  );
}

function dateInRange(value: string | null, from?: string, to?: string) {
  if (!value) return false;
  const date = value.slice(0, 10);
  return (!from || date >= from) && (!to || date <= to);
}
