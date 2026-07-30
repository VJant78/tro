import { z } from "zod";

const uuidSchema = z.uuid();
const moneySchema = z
  .union([z.string(), z.number()])
  .transform((value) => String(value).trim())
  .refine((value) => /^\d+$/.test(value), "Must be a non-negative integer")
  .refine((value) => Number(value) > 0, "Must be greater than zero");

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
  })
  .default({});

export const fromSettlementSchema = z.object({
  settlementId: uuidSchema,
});

export const paymentCreateSchema = z.object({
  invoiceId: uuidSchema,
  amount: moneySchema,
  method: paymentMethodSchema.default("CASH"),
  paidAt: z.iso.datetime().optional(),
  idempotencyKey: z.string().trim().min(8).max(120).optional(),
  notes: z.string().trim().max(1000).nullable().optional(),
});

export const paymentListQuerySchema = z
  .object({
    invoiceId: uuidSchema.optional(),
    roomId: uuidSchema.optional(),
    payerTenantId: uuidSchema.optional(),
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
