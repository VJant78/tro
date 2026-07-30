import { randomUUID } from "node:crypto";
import { Inject, Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import type { AppRole } from "../security/roles.decorator.js";
import { AuditService } from "../audit/audit.service.js";
import { PrismaService } from "../database/prisma.service.js";
import { requestHash } from "../platform/idempotency.js";
import { DomainException } from "../platform/domain.exception.js";
import { authorizedPropertyId } from "../platform/property-scope.js";
import { moneyString, moneyValue } from "../platform/numeric.js";
import {
  CreditBalanceConflictException,
  PaymentIdempotencyKeyReusedException,
  PaymentIdempotencyRequiredException,
  ReceiptAlreadyVoidedException,
  ReceiptDateOutOfRangeException,
  ReceiptNotFoundException,
  ReceiptPayerNotActiveException,
  ReceiptReversalConflictException,
  TenancyNotActiveException,
} from "./billing.errors.js";
import { allocateReceiptFifo } from "./receipt-allocator.js";
import {
  createReceiptPreviewToken,
  verifyReceiptPreviewToken,
} from "./receipt-token.js";
import type { InvoiceCreateInput } from "./billing.types.js";
import type {
  ReceiptAllocationLine,
  ReceiptIntent,
  ReceiptInvoiceSnapshot,
  ReceiptRecord,
  ReceiptResult,
} from "./receipt.types.js";

type ReceiptDb = Pick<
  Prisma.TransactionClient,
  "tenancy" | "invoice" | "tenantAccountEntry"
>;

interface ReceiptRequestInput {
  amount: string;
  method: "CASH" | "BANK_TRANSFER" | "OTHER";
  receivedAt: string;
  payerTenantId?: string | null;
  notes?: string | null;
}

const receiptInclude = {
  payerTenant: { select: { fullName: true } },
  allocations: {
    where: { deletedAt: null },
    include: {
      invoice: {
        select: {
          invoiceNumber: true,
          billingPeriodStart: true,
          billingPeriodEnd: true,
        },
      },
    },
    orderBy: { allocatedAt: "asc" as const },
  },
  operations: {
    include: { actor: { select: { fullName: true } } },
    orderBy: { createdAt: "asc" as const },
  },
  accountEntries: true,
} as const;

type PaymentDetail = Prisma.PaymentGetPayload<{
  include: typeof receiptInclude;
}>;

@Injectable()
export class ReceiptService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AuditService) private readonly audit: AuditService,
  ) {
    receiptPreviewSecret();
  }

  async preview(
    tenancyId: string,
    input: ReceiptRequestInput,
    actorUserId: string,
  ) {
    const propertyId = authorizedPropertyId();
    const intent = normalizeIntent(input);
    const state = await this.loadState(
      this.prisma,
      propertyId,
      tenancyId,
      intent,
    );
    const outcome = allocateReceiptFifo(intent.amount, state.invoices);
    const token = createReceiptPreviewToken(
      {
        propertyId,
        tenancyId,
        actorUserId,
        intentHash: requestHash(intent),
        snapshotHash: state.snapshotHash,
      },
      receiptPreviewSecret(),
    );
    return {
      previewToken: token.token,
      expiresAt: token.expiresAt,
      allocations: outcome.allocations,
      creditCreated: outcome.creditCreated,
      creditBalanceAfter: moneyString(
        state.creditBalance + moneyValue(outcome.creditCreated),
      ),
    };
  }

  async confirm(
    tenancyId: string,
    input: ReceiptRequestInput & { previewToken: string },
    idempotencyKey: string | undefined,
    actorUserId: string,
    role: AppRole,
  ): Promise<ReceiptResult> {
    if (!idempotencyKey) throw new PaymentIdempotencyRequiredException();
    const propertyId = authorizedPropertyId();
    const intent = normalizeIntent(input);
    const hash = requestHash({ tenancyId, actorUserId, ...intent });
    const replay = await this.findOperationReplay(
      propertyId,
      "CONFIRM",
      idempotencyKey,
      hash,
      actorUserId,
    );
    if (replay) return withReplay(replay);

    const token = verifyReceiptPreviewToken(
      input.previewToken,
      receiptPreviewSecret(),
    );
    if (
      token.propertyId !== propertyId ||
      token.tenancyId !== tenancyId ||
      token.actorUserId !== actorUserId ||
      token.intentHash !== requestHash(intent)
    ) {
      throw stalePreview();
    }

    return this.runSerializable(async (tx) => {
      const replayInside = await this.findOperationReplay(
        propertyId,
        "CONFIRM",
        idempotencyKey,
        hash,
        actorUserId,
        tx,
      );
      if (replayInside) return withReplay(replayInside);

      await lockTenancy(tx, tenancyId);
      const state = await this.loadState(tx, propertyId, tenancyId, intent);
      if (state.snapshotHash !== token.snapshotHash) throw stalePreview();

      const outcome = allocateReceiptFifo(intent.amount, state.invoices);
      const payment = await tx.payment.create({
        data: {
          paymentNumber: receiptNumberFor(intent.receivedAt),
          propertyId,
          roomId: state.roomId,
          tenancyId,
          payerTenantId: intent.payerTenantId,
          amount: intent.amount,
          method: intent.method,
          status: "CONFIRMED",
          paidAt: new Date(intent.receivedAt),
          idempotencyKey,
          requestHash: hash,
          sourceType: "DAILY_RECEIPT",
          receiptVersion: 2,
          description: "Thu tien phong",
          notes: intent.notes,
        },
      });

      const savedAllocations: ReceiptAllocationLine[] = [];
      for (const line of outcome.allocations) {
        const invoice = state.invoices.find(
          (item) => item.id === line.invoiceId,
        );
        if (!invoice) throw stalePreview();
        const allocation = await tx.paymentAllocation.create({
          data: {
            paymentId: payment.id,
            invoiceId: line.invoiceId,
            amount: line.amount,
            allocatedAt: new Date(intent.receivedAt),
          },
        });
        const paid = moneyValue(line.amount);
        const nextOutstanding = moneyValue(invoice.outstandingAmount) - paid;
        const current = await tx.invoice.findUniqueOrThrow({
          where: { id: line.invoiceId },
          select: { paidAmount: true, fullyPaidAt: true },
        });
        await tx.invoice.update({
          where: { id: line.invoiceId },
          data: {
            paidAmount: moneyString(
              moneyValue(current.paidAmount.toString()) + paid,
            ),
            outstandingAmount: moneyString(nextOutstanding),
            status: nextOutstanding === 0n ? "PAID" : "PARTIALLY_PAID",
            fullyPaidAt:
              nextOutstanding === 0n ? new Date(intent.receivedAt) : null,
          },
        });
        savedAllocations.push({ ...line, id: allocation.id });
      }

      if (moneyValue(outcome.creditCreated) > 0n) {
        await tx.tenantAccountEntry.create({
          data: {
            propertyId,
            tenancyId,
            roomId: state.roomId,
            tenantId: intent.payerTenantId,
            sourcePaymentId: payment.id,
            journalType: "RECEIPT_CREDIT",
            direction: "CREDIT",
            journalVersion: 2,
            amount: outcome.creditCreated,
            effectiveOn: dateValue(businessDateFor(intent.receivedAt)),
            notes: "So du tu lan thu",
          },
        });
      }

      const creditBalanceAfter = await this.creditBalance(tx, tenancyId);
      const actor = await tx.user.findUnique({
        where: { id: actorUserId },
        select: { fullName: true },
      });
      const detail = await tx.payment.findUniqueOrThrow({
        where: { id: payment.id },
        include: receiptInclude,
      });
      const result: ReceiptResult = {
        receipt: mapReceipt(detail, role, actor?.fullName ?? null),
        allocations: savedAllocations,
        creditCreated: outcome.creditCreated,
        creditBalanceAfter: moneyString(creditBalanceAfter),
        replayed: false,
      };
      await tx.paymentOperation.create({
        data: {
          propertyId,
          tenancyId,
          paymentId: payment.id,
          operationType: "CONFIRM",
          idempotencyKey,
          requestHash: hash,
          actorUserId,
          resultJson: result as unknown as Prisma.InputJsonObject,
        },
      });
      await this.audit.record(
        {
          action: "CONFIRM_PAYMENT",
          entityType: "receipt",
          entityId: payment.id,
          actorUserId,
          newValues: {
            amount: intent.amount,
            method: intent.method,
            receivedAt: intent.receivedAt,
            allocationCount: savedAllocations.length,
            creditCreated: outcome.creditCreated,
          },
          metadata: { tenancyId, roomId: state.roomId },
        },
        tx,
      );
      return result;
    });
  }

  async list(
    tenancyId: string,
    query: { cursor?: string; limit: number },
    role: AppRole,
  ) {
    const propertyId = authorizedPropertyId();
    await this.assertTenancyScope(propertyId, tenancyId);
    const rows = await this.prisma.payment.findMany({
      where: {
        propertyId,
        tenancyId,
        sourceType: "DAILY_RECEIPT",
        deletedAt: null,
      },
      include: receiptInclude,
      orderBy: [{ paidAt: "desc" }, { id: "desc" }],
      cursor: query.cursor ? { id: query.cursor } : undefined,
      skip: query.cursor ? 1 : 0,
      take: query.limit + 1,
    });
    const hasMore = rows.length > query.limit;
    const page = rows.slice(0, query.limit);
    const [creditBalance, receiptCount] = await Promise.all([
      this.creditBalance(this.prisma, tenancyId),
      this.prisma.payment.count({
        where: {
          propertyId,
          tenancyId,
          sourceType: "DAILY_RECEIPT",
          deletedAt: null,
        },
      }),
    ]);
    return {
      data: page.map((payment) => mapReceipt(payment, role)),
      page: {
        limit: query.limit,
        nextCursor: hasMore ? (page.at(-1)?.id ?? null) : null,
        hasMore,
      },
      summary: {
        creditBalance: moneyString(creditBalance),
        receiptCount,
      },
    };
  }

  async detail(receiptId: string, role: AppRole) {
    const propertyId = authorizedPropertyId();
    const payment = await this.prisma.payment.findFirst({
      where: {
        id: receiptId,
        propertyId,
        sourceType: "DAILY_RECEIPT",
        deletedAt: null,
      },
      include: receiptInclude,
    });
    if (!payment) throw new ReceiptNotFoundException();
    const creditBalance = await this.creditBalance(
      this.prisma,
      payment.tenancyId,
    );
    const confirmOperation = payment.operations.find(
      (operation) => operation.operationType === "CONFIRM",
    );
    return {
      receipt: mapReceipt(payment, role),
      allocations: mapAllocations(payment),
      creditCreated: creditCreatedFor(payment),
      creditBalanceAfter: moneyString(creditBalance),
      replayed: false,
      transfers: payment.accountEntries
        .filter(
          (entry) =>
            entry.journalType === "TRANSFER_IN" ||
            entry.journalType === "TRANSFER_OUT",
        )
        .map((entry) => ({
          id: entry.id,
          amount: entry.amount.toString(),
          direction:
            entry.direction === "CREDIT" ? ("IN" as const) : ("OUT" as const),
          createdAt: entry.createdAt.toISOString(),
        })),
      reversal: payment.voidedAt
        ? {
            voidedAt: payment.voidedAt.toISOString(),
            reason: role === "VIEWER" ? null : (payment.voidReason ?? ""),
          }
        : null,
      recordedByUserId:
        role === "VIEWER" ? null : (confirmOperation?.actorUserId ?? null),
    };
  }

  async void(
    receiptId: string,
    reason: string,
    idempotencyKey: string | undefined,
    actorUserId: string,
    role: AppRole,
  ) {
    if (!idempotencyKey) throw new PaymentIdempotencyRequiredException();
    const propertyId = authorizedPropertyId();
    const normalizedReason = reason.trim();
    const hash = requestHash({
      receiptId,
      reason: normalizedReason,
      actorUserId,
    });
    const replay = await this.findOperationReplay(
      propertyId,
      "VOID",
      idempotencyKey,
      hash,
      actorUserId,
    );
    if (replay) return withReplay(replay);

    return this.runSerializable(async (tx) => {
      const replayInside = await this.findOperationReplay(
        propertyId,
        "VOID",
        idempotencyKey,
        hash,
        actorUserId,
        tx,
      );
      if (replayInside) return withReplay(replayInside);

      const payment = await tx.payment.findFirst({
        where: {
          id: receiptId,
          propertyId,
          sourceType: "DAILY_RECEIPT",
          deletedAt: null,
        },
        include: receiptInclude,
      });
      if (!payment) throw new ReceiptNotFoundException();
      await lockTenancy(tx, payment.tenancyId);
      await lockPayment(tx, payment.id);
      if (payment.status === "VOIDED")
        throw new ReceiptAlreadyVoidedException();
      if (payment.status !== "CONFIRMED")
        throw new ReceiptReversalConflictException();

      const operation = await tx.paymentOperation.create({
        data: {
          propertyId,
          tenancyId: payment.tenancyId,
          paymentId: payment.id,
          operationType: "VOID",
          idempotencyKey,
          requestHash: hash,
          actorUserId,
          resultJson: {},
        },
      });

      const relatedEntries = await tx.tenantAccountEntry.findMany({
        where: {
          sourcePaymentId: payment.id,
          reversalOfId: null,
          deletedAt: null,
        },
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      });
      const relatedTenancyIds = [
        ...new Set(relatedEntries.map((entry) => entry.tenancyId)),
      ]
        .filter((tenancyId) => tenancyId !== payment.tenancyId)
        .sort();
      for (const tenancyId of relatedTenancyIds) {
        await lockTenancy(tx, tenancyId);
      }
      const reversalIds: string[] = [];
      for (const entry of relatedEntries) {
        const reversal = await tx.tenantAccountEntry.create({
          data: {
            propertyId: entry.propertyId,
            tenantId: entry.tenantId,
            tenancyId: entry.tenancyId,
            roomId: entry.roomId,
            settlementId: entry.settlementId,
            sourcePaymentId: payment.id,
            paymentAllocationId: entry.paymentAllocationId,
            sourceLotId: entry.sourceLotId,
            reversalOfId: entry.id,
            paymentOperationId: operation.id,
            transferCorrelation: entry.transferCorrelation,
            journalType: "REVERSAL",
            direction: entry.direction === "CREDIT" ? "DEBIT" : "CREDIT",
            journalVersion: 2,
            amount: entry.amount,
            effectiveOn: dateValue(businessDateFor(new Date().toISOString())),
            notes: "Dao receipt da huy",
          },
        });
        reversalIds.push(reversal.id);
      }

      await tx.payment.update({
        where: { id: payment.id },
        data: {
          status: "VOIDED",
          voidedAt: new Date(),
          voidReason: normalizedReason,
        },
      });

      const affectedInvoiceIds = [
        ...new Set(payment.allocations.map((item) => item.invoiceId)),
      ];
      const affectedInvoices = [];
      for (const invoiceId of affectedInvoiceIds) {
        affectedInvoices.push(await rebuildInvoice(tx, invoiceId));
      }

      const affectedTenancies = [
        ...new Set([
          payment.tenancyId,
          ...relatedEntries.map((entry) => entry.tenancyId),
        ]),
      ];
      for (const tenancyId of affectedTenancies) {
        const balance = await this.creditBalance(tx, tenancyId);
        if (balance < 0n) throw new ReceiptReversalConflictException();
      }

      const saved = await tx.payment.findUniqueOrThrow({
        where: { id: payment.id },
        include: receiptInclude,
      });
      const result = {
        receipt: mapReceipt(saved, role),
        allocations: mapAllocations(saved),
        creditCreated: creditCreatedFor(saved),
        creditBalanceAfter: moneyString(
          await this.creditBalance(tx, payment.tenancyId),
        ),
        reversedAllocationIds: payment.allocations.map((item) => item.id),
        affectedInvoices,
        creditReversalIds: reversalIds,
        cashReversal: {
          amount: `-${payment.amount.toString()}`,
          occurredAt: saved.voidedAt?.toISOString() ?? new Date().toISOString(),
        },
        replayed: false,
      };
      await tx.paymentOperation.update({
        where: { id: operation.id },
        data: { resultJson: result as unknown as Prisma.InputJsonObject },
      });
      await this.audit.record(
        {
          action: "VOID_PAYMENT",
          entityType: "receipt",
          entityId: payment.id,
          actorUserId,
          oldValues: {
            status: payment.status,
            amount: payment.amount.toString(),
          },
          newValues: { status: "VOIDED", voidReason: normalizedReason },
          metadata: {
            tenancyId: payment.tenancyId,
            affectedInvoiceCount: affectedInvoiceIds.length,
            reversalCount: reversalIds.length,
          },
        },
        tx,
      );
      return result;
    }, true);
  }

  async applyAvailableCreditToInvoice(invoiceId: string, actorUserId?: string) {
    const propertyId = authorizedPropertyId();
    return this.runSerializable(async (tx) => {
      const scoped = await tx.invoice.findFirst({
        where: { id: invoiceId, propertyId, deletedAt: null },
      });
      if (!scoped?.tenancyId) return scoped;
      await lockTenancy(tx, scoped.tenancyId);
      return this.applyAvailableCreditToInvoiceTx(tx, scoped, actorUserId);
    });
  }

  async createInvoiceWithCredit(
    input: InvoiceCreateInput,
    actorUserId?: string,
  ) {
    const propertyId = authorizedPropertyId();
    if (input.propertyId !== propertyId || !input.tenancyId) {
      throw new ReceiptNotFoundException();
    }

    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        return await this.runSerializable(async (tx) => {
          await lockTenancy(tx, input.tenancyId as string);
          let invoice = await tx.invoice.findFirst({
            where: { propertyId, sourceKey: input.sourceKey, deletedAt: null },
          });
          if (!invoice) {
            invoice = await tx.invoice.create({
              data: {
                invoiceNumber: input.invoiceNumber,
                propertyId,
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
                pricingSnapshot:
                  input.pricingSnapshot as Prisma.InputJsonObject,
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
            });
            await this.audit.record(
              {
                action: "ISSUE_INVOICE",
                entityType: "invoice",
                entityId: invoice.id,
                actorUserId,
                newValues: {
                  totalAmount: input.totalAmount,
                  sourceKey: input.sourceKey,
                },
                metadata: { tenancyId: input.tenancyId, roomId: input.roomId },
              },
              tx,
            );
          }
          await this.applyAvailableCreditToTenancyInTransaction(
            tx,
            propertyId,
            input.tenancyId as string,
            actorUserId,
          );
          return invoice.id;
        });
      } catch (error) {
        if (isUniqueConflict(error) && attempt === 0) continue;
        throw error;
      }
    }
    throw new CreditBalanceConflictException();
  }

  async applyAvailableCreditToTenancyInTransaction(
    tx: Prisma.TransactionClient,
    propertyId: string,
    tenancyId: string,
    actorUserId?: string,
  ) {
    const invoices = await tx.invoice.findMany({
      where: {
        propertyId,
        tenancyId,
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
    });
    for (const invoice of invoices) {
      await this.applyAvailableCreditToInvoiceTx(tx, invoice, actorUserId);
    }
  }

  private async applyAvailableCreditToInvoiceTx(
    tx: Prisma.TransactionClient,
    scoped: {
      id: string;
      propertyId: string;
      tenancyId: string | null;
      roomId: string;
      sourceKey: string | null;
    },
    actorUserId?: string,
  ) {
    if (!scoped.tenancyId) return scoped;
    await lockInvoice(tx, scoped.id);
    const invoice = await tx.invoice.findUniqueOrThrow({
      where: { id: scoped.id },
    });
    let needed = moneyValue(invoice.outstandingAmount.toString());
    if (needed === 0n || invoice.status === "CANCELLED") return invoice;

    const lots = await tx.tenantAccountEntry.findMany({
      where: {
        propertyId: scoped.propertyId,
        tenancyId: scoped.tenancyId,
        direction: "CREDIT",
        journalType: { in: ["RECEIPT_CREDIT", "TRANSFER_IN"] },
        sourcePayment: { status: "CONFIRMED" },
        reversalOfId: null,
        deletedAt: null,
      },
      include: { lotConsumptions: { where: { deletedAt: null } } },
      orderBy: [{ effectiveOn: "asc" }, { createdAt: "asc" }, { id: "asc" }],
    });
    let applied = 0n;
    for (const lot of lots) {
      if (needed === 0n || !lot.sourcePaymentId) break;
      const consumed = lot.lotConsumptions.reduce((total, entry) => {
        const amount = moneyValue(entry.amount.toString());
        return entry.direction === "DEBIT" ? total + amount : total - amount;
      }, 0n);
      const remaining = moneyValue(lot.amount.toString()) - consumed;
      if (remaining <= 0n) continue;
      const amount = remaining < needed ? remaining : needed;
      const existing = await tx.paymentAllocation.findUnique({
        where: {
          paymentId_invoiceId: {
            paymentId: lot.sourcePaymentId,
            invoiceId: scoped.id,
          },
        },
      });
      const allocation = existing
        ? await tx.paymentAllocation.update({
            where: { id: existing.id },
            data: {
              amount: moneyString(
                moneyValue(existing.amount.toString()) + amount,
              ),
            },
          })
        : await tx.paymentAllocation.create({
            data: {
              paymentId: lot.sourcePaymentId,
              invoiceId: scoped.id,
              amount: moneyString(amount),
            },
          });
      await tx.tenantAccountEntry.create({
        data: {
          propertyId: scoped.propertyId,
          tenancyId: scoped.tenancyId,
          roomId: scoped.roomId,
          settlementId: settlementIdFromSource(scoped.sourceKey),
          sourcePaymentId: lot.sourcePaymentId,
          paymentAllocationId: allocation.id,
          sourceLotId: lot.id,
          journalType: "CREDIT_APPLIED",
          direction: "DEBIT",
          journalVersion: 2,
          amount: moneyString(amount),
          effectiveOn: dateValue(businessDateFor(new Date().toISOString())),
          notes: "Tu dong tru so du khi tao hoa don",
        },
      });
      needed -= amount;
      applied += amount;
    }

    const updated = await tx.invoice.update({
      where: { id: scoped.id },
      data: {
        paidAmount: moneyString(
          moneyValue(invoice.paidAmount.toString()) + applied,
        ),
        outstandingAmount: moneyString(needed),
        status:
          needed === 0n
            ? "PAID"
            : applied > 0n
              ? "PARTIALLY_PAID"
              : invoice.status,
        fullyPaidAt: needed === 0n ? new Date() : invoice.fullyPaidAt,
      },
    });
    const settlementId = settlementIdFromSource(invoice.sourceKey);
    if (settlementId) {
      await tx.settlement.updateMany({
        where: {
          id: settlementId,
          tenancyId: scoped.tenancyId,
          deletedAt: null,
        },
        data: {
          prepaidAppliedAmount: moneyString(
            moneyValue(invoice.paidAmount.toString()) + applied,
          ),
          outstandingAmount: moneyString(needed),
          carryForwardAmount: moneyString(
            await this.creditBalance(tx, scoped.tenancyId),
          ),
        },
      });
    }
    if (applied > 0n) {
      await this.audit.record(
        {
          action: "CONFIRM_PAYMENT",
          entityType: "invoice_credit_application",
          entityId: scoped.id,
          actorUserId,
          newValues: {
            appliedAmount: moneyString(applied),
            outstandingAmount: moneyString(needed),
          },
          metadata: { tenancyId: scoped.tenancyId },
        },
        tx,
      );
    }
    return updated;
  }

  private async loadState(
    db: ReceiptDb,
    propertyId: string,
    tenancyId: string,
    intent: ReceiptIntent,
  ) {
    const tenancy = await db.tenancy.findFirst({
      where: {
        id: tenancyId,
        room: { propertyId },
        deletedAt: null,
      },
      include: {
        room: { select: { id: true, propertyId: true } },
        members: { where: { deletedAt: null } },
      },
    });
    if (!tenancy) throw new ReceiptNotFoundException();
    if (tenancy.status !== "ACTIVE") throw new TenancyNotActiveException();
    const receivedOn = businessDateFor(intent.receivedAt);
    if (
      receivedOn < dateOnly(tenancy.startDate) ||
      receivedOn > businessDateFor(new Date().toISOString()) ||
      (tenancy.actualEndDate && receivedOn > dateOnly(tenancy.actualEndDate))
    ) {
      throw new ReceiptDateOutOfRangeException();
    }
    if (intent.payerTenantId) {
      const active = tenancy.members.some(
        (member) =>
          member.tenantId === intent.payerTenantId &&
          dateOnly(member.joinedOn) <= receivedOn &&
          (!member.leftOn || dateOnly(member.leftOn) >= receivedOn),
      );
      if (!active) throw new ReceiptPayerNotActiveException();
    }
    const invoiceRows = await db.invoice.findMany({
      where: {
        propertyId,
        tenancyId,
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
    });
    const invoices = invoiceRows.map(invoiceSnapshot);
    const entries = await db.tenantAccountEntry.findMany({
      where: { propertyId, tenancyId, deletedAt: null },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    });
    const creditBalance = signedBalance(entries);
    if (creditBalance < 0n) throw new CreditBalanceConflictException();
    return {
      roomId: tenancy.roomId,
      invoices,
      creditBalance,
      snapshotHash: requestHash({
        tenancyUpdatedAt: tenancy.updatedAt.toISOString(),
        invoices: invoices.map((invoice) => ({
          id: invoice.id,
          outstandingAmount: invoice.outstandingAmount,
          updatedAt: invoice.updatedAt,
        })),
        entries: entries.map((entry) => ({
          id: entry.id,
          direction: entry.direction,
          amount: entry.amount.toString(),
          sourceLotId: entry.sourceLotId,
          reversalOfId: entry.reversalOfId,
        })),
      }),
    };
  }

  private async assertTenancyScope(propertyId: string, tenancyId: string) {
    const tenancy = await this.prisma.tenancy.findFirst({
      where: { id: tenancyId, room: { propertyId }, deletedAt: null },
      select: { id: true },
    });
    if (!tenancy) throw new ReceiptNotFoundException();
  }

  private async creditBalance(db: ReceiptDb, tenancyId: string) {
    const entries = await db.tenantAccountEntry.findMany({
      where: {
        propertyId: authorizedPropertyId(),
        tenancyId,
        deletedAt: null,
      },
    });
    return signedBalance(entries);
  }

  private async findOperationReplay(
    propertyId: string,
    operationType: "CONFIRM" | "VOID",
    idempotencyKey: string,
    hash: string,
    actorUserId: string,
    tx?: Prisma.TransactionClient,
  ) {
    const client = tx ?? this.prisma;
    const operation = await client.paymentOperation.findUnique({
      where: {
        propertyId_operationType_idempotencyKey: {
          propertyId,
          operationType,
          idempotencyKey,
        },
      },
    });
    if (!operation) return null;
    if (
      operation.requestHash !== hash ||
      operation.actorUserId !== actorUserId
    ) {
      throw new PaymentIdempotencyKeyReusedException();
    }
    if (!isRecord(operation.resultJson))
      throw new ReceiptReversalConflictException();
    return operation.resultJson;
  }

  private async runSerializable<T>(
    action: (tx: Prisma.TransactionClient) => Promise<T>,
    reversal = false,
  ) {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        return await this.prisma.$transaction(action, {
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        });
      } catch (error) {
        if (isSerializationFailure(error) && attempt < 2) continue;
        if (reversal && isConstraintFailure(error)) {
          throw new ReceiptReversalConflictException();
        }
        throw error;
      }
    }
    throw reversal
      ? new ReceiptReversalConflictException()
      : new CreditBalanceConflictException();
  }
}

function normalizeIntent(input: ReceiptRequestInput): ReceiptIntent {
  return {
    amount: input.amount,
    method: input.method,
    receivedAt: new Date(input.receivedAt).toISOString(),
    payerTenantId: input.payerTenantId ?? null,
    notes: input.notes?.trim() || null,
  };
}

function invoiceSnapshot(invoice: {
  id: string;
  invoiceNumber: string;
  billingPeriodStart: Date;
  billingPeriodEnd: Date;
  dueOn: Date;
  createdAt: Date;
  updatedAt: Date;
  outstandingAmount: { toString(): string };
}): ReceiptInvoiceSnapshot {
  return {
    id: invoice.id,
    invoiceNumber: invoice.invoiceNumber,
    billingPeriodStart: dateOnly(invoice.billingPeriodStart),
    billingPeriodEnd: dateOnly(invoice.billingPeriodEnd),
    dueOn: dateOnly(invoice.dueOn),
    createdAt: invoice.createdAt.toISOString(),
    updatedAt: invoice.updatedAt.toISOString(),
    outstandingAmount: invoice.outstandingAmount.toString(),
  };
}

function mapReceipt(
  payment: PaymentDetail,
  role: AppRole,
  recordedByName?: string | null,
): ReceiptRecord {
  const isViewer = role === "VIEWER";
  const confirm = payment.operations.find(
    (operation) => operation.operationType === "CONFIRM",
  );
  return {
    id: payment.id,
    receiptNumber: payment.paymentNumber,
    tenancyId: payment.tenancyId,
    roomId: payment.roomId,
    amount: payment.amount.toString(),
    method: payment.method,
    receivedAt: payment.paidAt.toISOString(),
    status: payment.status === "VOIDED" ? "VOIDED" : "CONFIRMED",
    payerTenantId: isViewer ? null : payment.payerTenantId,
    payerTenantName: isViewer ? null : (payment.payerTenant?.fullName ?? null),
    notes: isViewer ? null : payment.notes,
    recordedByName: isViewer
      ? null
      : (recordedByName ?? confirm?.actor.fullName ?? null),
    voidedAt: payment.voidedAt?.toISOString() ?? null,
    voidReason: isViewer ? null : payment.voidReason,
    canVoid:
      payment.status === "CONFIRMED" &&
      (role === "OWNER" || role === "MANAGER"),
  };
}

function mapAllocations(payment: PaymentDetail): ReceiptAllocationLine[] {
  return payment.allocations.map((allocation) => ({
    id: allocation.id,
    invoiceId: allocation.invoiceId,
    invoiceNumber: allocation.invoice.invoiceNumber,
    billingPeriodStart: dateOnly(allocation.invoice.billingPeriodStart),
    billingPeriodEnd: dateOnly(allocation.invoice.billingPeriodEnd),
    amount: allocation.amount.toString(),
  }));
}

function creditCreatedFor(payment: PaymentDetail) {
  return moneyString(
    payment.accountEntries
      .filter(
        (entry) =>
          entry.journalType === "RECEIPT_CREDIT" &&
          entry.direction === "CREDIT" &&
          !entry.reversalOfId,
      )
      .reduce(
        (total, entry) => total + moneyValue(entry.amount.toString()),
        0n,
      ),
  );
}

function signedBalance(
  entries: Array<{
    direction: "CREDIT" | "DEBIT";
    amount: { toString(): string };
  }>,
) {
  return entries.reduce((total, entry) => {
    const amount = moneyValue(entry.amount.toString());
    return entry.direction === "CREDIT" ? total + amount : total - amount;
  }, 0n);
}

async function rebuildInvoice(tx: Prisma.TransactionClient, invoiceId: string) {
  await lockInvoice(tx, invoiceId);
  const invoice = await tx.invoice.findUnique({
    where: { id: invoiceId },
    include: {
      paymentAllocations: {
        where: { deletedAt: null, payment: { status: "CONFIRMED" } },
      },
    },
  });
  if (!invoice) throw new ReceiptReversalConflictException();
  const paid = invoice.paymentAllocations.reduce(
    (total, allocation) => total + moneyValue(allocation.amount.toString()),
    0n,
  );
  const total = moneyValue(invoice.totalAmount.toString());
  if (paid > total) throw new ReceiptReversalConflictException();
  const outstanding = total - paid;
  const status =
    outstanding === 0n
      ? "PAID"
      : paid > 0n
        ? "PARTIALLY_PAID"
        : invoice.status === "OVERDUE"
          ? "OVERDUE"
          : "ISSUED";
  const saved = await tx.invoice.update({
    where: { id: invoice.id },
    data: {
      paidAmount: moneyString(paid),
      outstandingAmount: moneyString(outstanding),
      status,
      fullyPaidAt:
        outstanding === 0n ? (invoice.fullyPaidAt ?? new Date()) : null,
    },
  });
  const settlementId = settlementIdFromSource(invoice.sourceKey);
  if (settlementId) {
    await tx.settlement.updateMany({
      where: { id: settlementId, deletedAt: null },
      data: {
        prepaidAppliedAmount: moneyString(paid),
        outstandingAmount: moneyString(outstanding),
      },
    });
  }
  return {
    id: saved.id,
    status: saved.status,
    paidAmount: saved.paidAmount.toString(),
    outstandingAmount: saved.outstandingAmount.toString(),
  };
}

async function lockTenancy(tx: Prisma.TransactionClient, tenancyId: string) {
  await tx.$queryRaw(
    Prisma.sql`SELECT id FROM tenancies WHERE id = ${tenancyId}::uuid FOR UPDATE`,
  );
}

async function lockPayment(tx: Prisma.TransactionClient, paymentId: string) {
  await tx.$queryRaw(
    Prisma.sql`SELECT id FROM payments WHERE id = ${paymentId}::uuid FOR UPDATE`,
  );
}

async function lockInvoice(tx: Prisma.TransactionClient, invoiceId: string) {
  await tx.$queryRaw(
    Prisma.sql`SELECT id FROM invoices WHERE id = ${invoiceId}::uuid FOR UPDATE`,
  );
}

export function receiptPreviewSecret() {
  const configured =
    process.env.RECEIPT_PREVIEW_SECRET ?? process.env.SESSION_SECRET;
  if (configured) return configured;
  if (process.env.NODE_ENV === "production") {
    throw new DomainException(
      "RECEIPT_PREVIEW_SECRET_MISSING",
      "Receipt preview signing secret is not configured",
      500,
    );
  }
  return "phase6-local-receipt-preview-secret";
}

function receiptNumberFor(receivedAt: string) {
  return `PT-${receivedAt.slice(0, 10).replaceAll("-", "")}-${randomUUID()
    .slice(0, 8)
    .toUpperCase()}`;
}

function dateValue(value: string) {
  return new Date(`${value}T00:00:00.000Z`);
}

function dateOnly(value: Date) {
  return value.toISOString().slice(0, 10);
}

function businessDateFor(value: string) {
  const timeZone = process.env.BUSINESS_TIMEZONE ?? "Asia/Bangkok";
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(value));
  const part = (type: "year" | "month" | "day") =>
    parts.find((item) => item.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

function settlementIdFromSource(sourceKey: string | null) {
  return sourceKey?.startsWith("settlement:") ? sourceKey.slice(11) : null;
}

function stalePreview() {
  return new DomainException(
    "ALLOCATION_PREVIEW_STALE",
    "Receipt preview expired or no longer matches current data",
    409,
  );
}

function withReplay(value: Record<string, unknown>) {
  return { ...value, replayed: true } as unknown as ReceiptResult;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isSerializationFailure(error: unknown) {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2034"
  );
}

function isUniqueConflict(error: unknown) {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2002"
  );
}

function isConstraintFailure(error: unknown) {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    ["P2002", "P2003", "P2014"].includes(error.code)
  );
}
