import { z } from "zod";
import { positiveMoneySchema } from "../platform/numeric.js";

const uuidSchema = z.uuid();

export const invoiceStatusSchema = z.enum([
  "DRAFT",
  "ISSUED",
  "PARTIALLY_PAID",
  "PAID",
  "OVERDUE",
  "CANCELLED",
]);
export const paymentMethodSchema = z.enum(["CASH", "BANK_TRANSFER", "OTHER"]);
export const debtStatusSchema = z.enum([
  "OUTSTANDING",
  "PARTIALLY_PAID",
  "DUE_TODAY",
  "OVERDUE",
]);

export const invoiceListQuerySchema = z
  .object({
    roomId: uuidSchema.optional(),
    tenancyId: uuidSchema.optional(),
    payerTenantId: uuidSchema.optional(),
    status: invoiceStatusSchema.optional(),
    billingYear: z.coerce.number().int().min(2000).max(2100).optional(),
    billingMonth: z.coerce.number().int().min(1).max(12).optional(),
    limit: z.coerce.number().int().min(1).max(200).default(100),
  })
  .default({ limit: 100 });

export const fromSettlementSchema = z.object({
  settlementId: uuidSchema,
});

export const paymentCreateSchema = z.object({
  invoiceId: uuidSchema,
  amount: positiveMoneySchema,
  method: paymentMethodSchema.default("CASH"),
  paidAt: z.iso.datetime(),
  idempotencyKey: z.string().trim().min(8).max(120).optional(),
  notes: z.string().trim().max(1000).nullable().optional(),
});

export const paymentListQuerySchema = z
  .object({
    invoiceId: uuidSchema.optional(),
    roomId: uuidSchema.optional(),
    payerTenantId: uuidSchema.optional(),
    paidFrom: z.iso.date().optional(),
    paidTo: z.iso.date().optional(),
  })
  .default({});

export const debtListQuerySchema = z
  .object({
    roomId: uuidSchema.optional(),
    payerTenantId: uuidSchema.optional(),
    status: debtStatusSchema.optional(),
    asOf: z.iso.date().optional(),
  })
  .default({});

export const idParamSchema = z.object({ id: uuidSchema });

export const dashboardSummaryQuerySchema = z
  .object({
    asOf: z.iso.date().optional(),
  })
  .default({});

export const monthlyReportQuerySchema = z.object({
  billingYear: z.coerce.number().int().min(2000).max(2100),
  billingMonth: z.coerce.number().int().min(1).max(12),
  roomId: uuidSchema.optional(),
  limit: z.coerce.number().int().min(1).max(200).default(100),
});
