import { Inject, Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import type {
  Invoice,
  InvoiceItem,
  Payment,
  PaymentAllocation,
  Room,
  Tenant,
} from "@prisma/client";
import { AuditService } from "../audit/audit.service.js";
import { PrismaService } from "../database/prisma.service.js";
import {
  assertAuthorizedPropertyId,
  authorizedPropertyId,
} from "../platform/property-scope.js";
import { moneyString, moneyValue } from "../platform/numeric.js";
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

type InvoiceWithRelations = Invoice & {
  room?: Pick<Room, "code">;
  payerTenant?: Pick<Tenant, "fullName"> | null;
  items?: InvoiceItem[];
  paymentAllocations?: Array<
    PaymentAllocation & {
      payment?: Pick<
        Payment,
        "paymentNumber" | "method" | "status" | "paidAt"
      > | null;
    }
  >;
};

type PaymentWithRelations = Payment & {
  room?: Pick<Room, "code">;
  payerTenant?: Pick<Tenant, "fullName"> | null;
  allocations?: PaymentAllocation[];
};

function dateOnly(value: Date | null) {
  return value ? value.toISOString().slice(0, 10) : null;
}

function dateValue(value: string) {
  return new Date(`${value}T00:00:00.000Z`);
}

function mapInvoice(invoice: InvoiceWithRelations): InvoiceRecord {
  return {
    id: invoice.id,
    invoiceNumber: invoice.invoiceNumber,
    propertyId: invoice.propertyId,
    roomId: invoice.roomId,
    roomCode: invoice.room?.code ?? null,
    tenancyId: invoice.tenancyId,
    payerTenantId: invoice.payerTenantId,
    payerTenantName: invoice.payerTenant?.fullName ?? null,
    invoiceType: invoice.invoiceType,
    status: invoice.status,
    billingPeriodStart: dateOnly(invoice.billingPeriodStart) ?? "",
    billingPeriodEnd: dateOnly(invoice.billingPeriodEnd) ?? "",
    billingYear: invoice.billingYear,
    billingMonth: invoice.billingMonth,
    issuedOn: dateOnly(invoice.issuedOn),
    dueOn: dateOnly(invoice.dueOn) ?? "",
    totalAmount: invoice.totalAmount.toString(),
    paidAmount: invoice.paidAmount.toString(),
    outstandingAmount: invoice.outstandingAmount.toString(),
    fullyPaidAt: invoice.fullyPaidAt?.toISOString() ?? null,
    sourceKey: invoice.sourceKey,
    pricingSnapshot: isRecord(invoice.pricingSnapshot)
      ? invoice.pricingSnapshot
      : null,
    notes: invoice.notes,
    createdAt: invoice.createdAt.toISOString(),
    updatedAt: invoice.updatedAt.toISOString(),
    items: (invoice.items ?? [])
      .sort((left, right) => left.sortOrder - right.sortOrder)
      .map((item) => ({
        id: item.id,
        invoiceId: item.invoiceId,
        itemType: item.itemType,
        description: item.description,
        quantity: item.quantity.toString(),
        unit: item.unit,
        unitPrice: item.unitPrice.toString(),
        amount: item.amount.toString(),
        sortOrder: item.sortOrder,
        metadata: isRecord(item.metadata) ? item.metadata : null,
        createdAt: item.createdAt.toISOString(),
        updatedAt: item.updatedAt.toISOString(),
      })),
    paymentAllocations: (invoice.paymentAllocations ?? []).map(
      (allocation) => ({
        id: allocation.id,
        paymentId: allocation.paymentId,
        invoiceId: allocation.invoiceId,
        amount: allocation.amount.toString(),
        allocatedAt: allocation.allocatedAt.toISOString(),
        paymentNumber: allocation.payment?.paymentNumber ?? null,
        paymentMethod: allocation.payment?.method ?? null,
        paymentStatus: allocation.payment?.status ?? null,
        paidAt: allocation.payment?.paidAt.toISOString() ?? null,
        createdAt: allocation.createdAt.toISOString(),
        updatedAt: allocation.updatedAt.toISOString(),
      }),
    ),
  };
}

function mapPayment(payment: PaymentWithRelations): PaymentRecord {
  return {
    id: payment.id,
    paymentNumber: payment.paymentNumber,
    propertyId: payment.propertyId,
    roomId: payment.roomId,
    roomCode: payment.room?.code ?? null,
    payerTenantId: payment.payerTenantId,
    payerTenantName: payment.payerTenant?.fullName ?? null,
    amount: payment.amount.toString(),
    method: payment.method,
    status: payment.status,
    sourceType: payment.sourceType,
    paidAt: payment.paidAt.toISOString(),
    voidedAt: payment.voidedAt?.toISOString() ?? null,
    voidReason: payment.voidReason,
    idempotencyKey: payment.idempotencyKey,
    description: payment.description,
    notes: payment.notes,
    createdAt: payment.createdAt.toISOString(),
    updatedAt: payment.updatedAt.toISOString(),
    allocations: (payment.allocations ?? []).map((allocation) => ({
      id: allocation.id,
      paymentId: allocation.paymentId,
      invoiceId: allocation.invoiceId,
      amount: allocation.amount.toString(),
      allocatedAt: allocation.allocatedAt.toISOString(),
      paymentNumber: payment.paymentNumber,
      paymentMethod: payment.method,
      paymentStatus: payment.status,
      paidAt: payment.paidAt.toISOString(),
      createdAt: allocation.createdAt.toISOString(),
      updatedAt: allocation.updatedAt.toISOString(),
    })),
  };
}

@Injectable()
export class PrismaBillingRepository implements BillingRepository {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AuditService) private readonly audit: AuditService,
  ) {}

  async listInvoices(query: InvoiceListQuery) {
    const invoices = await this.prisma.invoice.findMany({
      where: {
        propertyId: authorizedPropertyId(),
        deletedAt: null,
        roomId: query.roomId,
        tenancyId: query.tenancyId,
        payerTenantId: query.payerTenantId,
        status: query.status,
        billingYear: query.billingYear,
        billingMonth: query.billingMonth,
      },
      include: invoiceInclude(),
      orderBy: { createdAt: "desc" },
      take: query.limit,
    });
    return invoices.map(mapInvoice);
  }

  async findInvoiceById(id: string) {
    const invoice = await this.prisma.invoice.findFirst({
      where: { id, propertyId: authorizedPropertyId(), deletedAt: null },
      include: invoiceInclude(),
    });
    return invoice ? mapInvoice(invoice) : null;
  }

  async findInvoiceBySourceKey(sourceKey: string) {
    const invoice = await this.prisma.invoice.findFirst({
      where: {
        sourceKey,
        propertyId: authorizedPropertyId(),
        deletedAt: null,
      },
      include: invoiceInclude(),
    });
    return invoice ? mapInvoice(invoice) : null;
  }

  async createInvoice(input: InvoiceCreateInput, actorUserId?: string) {
    assertAuthorizedPropertyId(input.propertyId);
    const invoice = await this.prisma.$transaction(async (tx) => {
      const created = await tx.invoice.create({
        data: {
          invoiceNumber: input.invoiceNumber,
          propertyId: input.propertyId,
          roomId: input.roomId,
          tenancyId: input.tenancyId,
          payerTenantId: input.payerTenantId,
          invoiceType: input.invoiceType,
          status: input.status,
          billingPeriodStart: dateValue(input.billingPeriodStart),
          billingPeriodEnd: dateValue(input.billingPeriodEnd),
          billingYear: input.billingYear,
          billingMonth: input.billingMonth,
          issuedOn: dateValue(input.issuedOn),
          dueOn: dateValue(input.dueOn),
          totalAmount: input.totalAmount,
          paidAmount: input.paidAmount,
          outstandingAmount: input.outstandingAmount,
          sourceKey: input.sourceKey,
          pricingSnapshot: input.pricingSnapshot as Prisma.InputJsonObject,
          notes: input.notes,
          items: {
            create: input.items.map((item) => ({
              itemType: item.itemType,
              description: item.description,
              quantity: item.quantity,
              unit: item.unit,
              unitPrice: item.unitPrice,
              amount: item.amount,
              sortOrder: item.sortOrder,
              metadata: item.metadata
                ? (item.metadata as Prisma.InputJsonObject)
                : undefined,
            })),
          },
        },
        include: invoiceInclude(),
      });
      await this.audit.record(
        {
          action: "ISSUE_INVOICE",
          entityType: "invoice",
          entityId: created.id,
          actorUserId,
          newValues: mapInvoice(created),
          metadata: { sourceKey: input.sourceKey },
        },
        tx,
      );
      return created;
    });
    return mapInvoice(invoice);
  }

  async listPayments(query: PaymentListQuery) {
    const payments = await this.prisma.payment.findMany({
      where: {
        propertyId: authorizedPropertyId(),
        deletedAt: null,
        roomId: query.roomId,
        payerTenantId: query.payerTenantId,
        allocations: query.invoiceId
          ? { some: { invoiceId: query.invoiceId, deletedAt: null } }
          : undefined,
        ...(query.eventFrom || query.eventTo
          ? {
              OR: [
                { paidAt: dateRange(query.eventFrom, query.eventTo) },
                { voidedAt: dateRange(query.eventFrom, query.eventTo) },
              ],
            }
          : {
              paidAt:
                query.paidFrom || query.paidTo
                  ? dateRange(query.paidFrom, query.paidTo)
                  : undefined,
            }),
      },
      include: paymentInclude(),
      orderBy: { paidAt: "desc" },
    });
    return payments.map(mapPayment);
  }

  async createPayment(input: PaymentCreateInput): Promise<PaymentCreateResult> {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        return await this.createPaymentAttempt(input);
      } catch (error) {
        if (isSerializationFailure(error) && attempt < 2) {
          await new Promise((resolve) =>
            setTimeout(resolve, 10 * (attempt + 1)),
          );
          continue;
        }
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === "P2002" &&
          input.idempotencyKey
        ) {
          return this.createPaymentAttempt(input);
        }
        throw error;
      }
    }
    throw new BillingValidationException(
      "Payment transaction could not complete",
    );
  }

  private async createPaymentAttempt(
    input: PaymentCreateInput,
  ): Promise<PaymentCreateResult> {
    const propertyId = authorizedPropertyId();
    const saved = await this.prisma.$transaction(
      async (tx) => {
        if (input.idempotencyKey) {
          const existing = await tx.payment.findFirst({
            where: {
              idempotencyKey: input.idempotencyKey,
              propertyId,
              deletedAt: null,
            },
            include: paymentInclude(),
          });
          if (existing) {
            const allocation = existing.allocations[0];
            const sameLegacyRequest =
              allocation?.invoiceId === input.invoiceId &&
              existing.amount.toString() === input.amount &&
              existing.method === input.method &&
              existing.paidAt.toISOString() === input.paidAt;
            if (
              (existing.requestHash &&
                existing.requestHash !== input.requestHash) ||
              (!existing.requestHash && !sameLegacyRequest)
            ) {
              throw new PaymentIdempotencyKeyReusedException();
            }
            if (!existing.requestHash) {
              const bound = await tx.payment.updateMany({
                where: { id: existing.id, requestHash: null },
                data: { requestHash: input.requestHash },
              });
              if (bound.count !== 1) {
                throw new PaymentIdempotencyKeyReusedException();
              }
              await this.audit.record(
                {
                  action: "UPDATE",
                  entityType: "payment",
                  entityId: existing.id,
                  actorUserId: input.actorUserId,
                  metadata: { mode: "bind-legacy-request-hash" },
                },
                tx,
              );
            }
            const invoice = allocation
              ? await tx.invoice.findFirst({
                  where: {
                    id: allocation.invoiceId,
                    propertyId,
                    deletedAt: null,
                  },
                  include: invoiceInclude(),
                })
              : null;
            if (!invoice) throw new InvoiceNotFoundException();
            return { payment: existing, invoice };
          }
        }

        let invoice = await tx.invoice.findFirst({
          where: { id: input.invoiceId, propertyId, deletedAt: null },
          include: { paymentAllocations: true },
        });
        if (!invoice) throw new InvoiceNotFoundException();
        if (!invoice.tenancyId) {
          throw new BillingValidationException(
            "Invoice must belong to a tenancy before it can be paid",
          );
        }
        await tx.$queryRaw(
          Prisma.sql`SELECT id FROM tenancies WHERE id = ${invoice.tenancyId}::uuid FOR UPDATE`,
        );
        const oldestInvoice = await tx.invoice.findFirst({
          where: {
            propertyId,
            tenancyId: invoice.tenancyId,
            deletedAt: null,
            status: { not: "CANCELLED" },
            outstandingAmount: { gt: 0 },
          },
          orderBy: [
            { billingPeriodStart: "asc" },
            { billingPeriodEnd: "asc" },
            { dueOn: "asc" },
            { createdAt: "asc" },
            { id: "asc" },
          ],
          select: { id: true },
        });
        if (oldestInvoice?.id !== invoice.id) {
          throw new BillingValidationException(
            "Payment must target the oldest outstanding invoice",
          );
        }
        await tx.$queryRaw(
          Prisma.sql`SELECT id FROM invoices WHERE id = ${invoice.id}::uuid FOR UPDATE`,
        );
        invoice = await tx.invoice.findFirst({
          where: { id: input.invoiceId, propertyId, deletedAt: null },
          include: { paymentAllocations: true },
        });
        if (!invoice?.tenancyId) throw new InvoiceNotFoundException();
        if (invoice.status === "CANCELLED") {
          throw new BillingValidationException(
            "Cannot pay a cancelled invoice",
          );
        }
        const amount = moneyValue(input.amount);
        const outstanding = moneyValue(invoice.outstandingAmount.toString());
        if (invoice.status === "PAID" || outstanding === 0n) {
          throw new BillingValidationException("Invoice is already paid");
        }
        if (amount > outstanding) {
          throw new BillingValidationException(
            "Payment amount cannot exceed invoice outstanding amount",
          );
        }
        const nextPaid = moneyValue(invoice.paidAmount.toString()) + amount;
        const nextOutstanding = outstanding - amount;
        const payment = await tx.payment.create({
          data: {
            paymentNumber: input.paymentNumber,
            propertyId: invoice.propertyId,
            roomId: invoice.roomId,
            tenancyId: invoice.tenancyId,
            payerTenantId: invoice.payerTenantId,
            amount: input.amount,
            method: input.method,
            status: "CONFIRMED",
            paidAt: new Date(input.paidAt),
            idempotencyKey: input.idempotencyKey,
            requestHash: input.requestHash,
            description: input.description,
            notes: input.notes,
          },
        });
        await tx.paymentAllocation.create({
          data: {
            paymentId: payment.id,
            invoiceId: invoice.id,
            amount: input.amount,
          },
        });
        const updatedInvoice = await tx.invoice.update({
          where: { id: invoice.id },
          data: {
            paidAmount: moneyString(nextPaid),
            outstandingAmount: moneyString(nextOutstanding),
            status: nextOutstanding === 0n ? "PAID" : "PARTIALLY_PAID",
            fullyPaidAt:
              nextOutstanding === 0n ? new Date() : invoice.fullyPaidAt,
          },
          include: invoiceInclude(),
        });
        const savedPayment = await tx.payment.findUniqueOrThrow({
          where: { id: payment.id },
          include: paymentInclude(),
        });
        await this.audit.record(
          {
            action: "CONFIRM_PAYMENT",
            entityType: "payment",
            entityId: payment.id,
            actorUserId: input.actorUserId,
            newValues: mapPayment(savedPayment),
            metadata: { invoiceId: invoice.id },
          },
          tx,
        );
        return { payment: savedPayment, invoice: updatedInvoice };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
    return {
      payment: mapPayment(saved.payment),
      invoice: mapInvoice(saved.invoice),
    };
  }

  async listDebts(query: DebtListQuery) {
    const invoices = await this.listInvoices({ roomId: query.roomId });
    return buildDebtSummaries(invoices, query);
  }
}

function isSerializationFailure(error: unknown) {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2034"
  );
}

function dateRange(from?: string, to?: string) {
  return {
    gte: from ? new Date(`${from}T00:00:00.000Z`) : undefined,
    lte: to ? new Date(`${to}T23:59:59.999Z`) : undefined,
  };
}

function invoiceInclude() {
  return {
    room: { select: { code: true } },
    payerTenant: { select: { fullName: true } },
    items: true,
    paymentAllocations: {
      include: {
        payment: {
          select: {
            paymentNumber: true,
            method: true,
            status: true,
            paidAt: true,
          },
        },
      },
    },
  } as const;
}

function paymentInclude() {
  return {
    room: { select: { code: true } },
    payerTenant: { select: { fullName: true } },
    allocations: true,
  } as const;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
