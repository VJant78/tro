import { Inject, Injectable } from "@nestjs/common";
import type {
  Invoice,
  InvoiceItem,
  Payment,
  PaymentAllocation,
  Prisma,
  Room,
  Tenant,
} from "@prisma/client";
import { PrismaService } from "../database/prisma.service.js";
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
    paidAt: payment.paidAt.toISOString(),
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
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async listInvoices(query: InvoiceListQuery) {
    const invoices = await this.prisma.invoice.findMany({
      where: {
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
    });
    return invoices.map(mapInvoice);
  }

  async findInvoiceById(id: string) {
    const invoice = await this.prisma.invoice.findFirst({
      where: { id, deletedAt: null },
      include: invoiceInclude(),
    });
    return invoice ? mapInvoice(invoice) : null;
  }

  async findInvoiceBySourceKey(sourceKey: string) {
    const invoice = await this.prisma.invoice.findFirst({
      where: { sourceKey, deletedAt: null },
      include: invoiceInclude(),
    });
    return invoice ? mapInvoice(invoice) : null;
  }

  async createInvoice(input: InvoiceCreateInput) {
    return mapInvoice(
      await this.prisma.invoice.create({
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
      }),
    );
  }

  async listPayments(query: PaymentListQuery) {
    const payments = await this.prisma.payment.findMany({
      where: {
        deletedAt: null,
        roomId: query.roomId,
        payerTenantId: query.payerTenantId,
        allocations: query.invoiceId
          ? { some: { invoiceId: query.invoiceId, deletedAt: null } }
          : undefined,
        paidAt:
          query.paidFrom || query.paidTo
            ? {
                gte: query.paidFrom
                  ? new Date(`${query.paidFrom}T00:00:00.000Z`)
                  : undefined,
                lte: query.paidTo
                  ? new Date(`${query.paidTo}T23:59:59.999Z`)
                  : undefined,
              }
            : undefined,
      },
      include: paymentInclude(),
      orderBy: { paidAt: "desc" },
    });
    return payments.map(mapPayment);
  }

  async findPaymentByIdempotencyKey(idempotencyKey: string) {
    const payment = await this.prisma.payment.findFirst({
      where: { idempotencyKey, deletedAt: null },
      include: paymentInclude(),
    });
    return payment ? mapPayment(payment) : null;
  }

  async createPayment(input: PaymentCreateInput): Promise<PaymentCreateResult> {
    const saved = await this.prisma.$transaction(async (tx) => {
      const invoice = await tx.invoice.findFirst({
        where: { id: input.invoiceId, deletedAt: null },
        include: { paymentAllocations: true },
      });
      if (!invoice) throw new InvoiceNotFoundException();

      const amount = Number(input.amount);
      const nextPaid = Number(invoice.paidAmount.toString()) + amount;
      const nextOutstanding =
        Number(invoice.outstandingAmount.toString()) - amount;
      const payment = await tx.payment.create({
        data: {
          paymentNumber: input.paymentNumber,
          propertyId: invoice.propertyId,
          roomId: invoice.roomId,
          payerTenantId: invoice.payerTenantId,
          amount: input.amount,
          method: input.method,
          status: "CONFIRMED",
          paidAt: new Date(input.paidAt),
          idempotencyKey: input.idempotencyKey,
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
          paidAmount: String(nextPaid),
          outstandingAmount: String(Math.max(0, nextOutstanding)),
          status: nextOutstanding <= 0 ? "PAID" : "PARTIALLY_PAID",
          fullyPaidAt: nextOutstanding <= 0 ? new Date() : invoice.fullyPaidAt,
        },
        include: invoiceInclude(),
      });
      const savedPayment = await tx.payment.findUniqueOrThrow({
        where: { id: payment.id },
        include: paymentInclude(),
      });
      return { payment: savedPayment, invoice: updatedInvoice };
    });
    return {
      payment: mapPayment(saved.payment),
      invoice: mapInvoice(saved.invoice),
    };
  }

  async listDebts(query: DebtListQuery) {
    const invoices = await this.listInvoices({});
    return buildDebtSummaries(invoices, query);
  }
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
