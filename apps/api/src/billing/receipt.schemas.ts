import { z } from "zod";
import { positiveMoneySchema } from "../platform/numeric.js";
import { paymentMethodSchema } from "./billing.schemas.js";

const uuidSchema = z.uuid();

export const tenancyReceiptParamsSchema = z.object({ tenancyId: uuidSchema });
export const receiptParamsSchema = z.object({ receiptId: uuidSchema });

export const receiptIntentSchema = z.object({
  amount: positiveMoneySchema,
  method: paymentMethodSchema.default("CASH"),
  receivedAt: z.iso.datetime(),
  payerTenantId: uuidSchema.nullable().optional(),
  notes: z.string().trim().max(1000).nullable().optional(),
});

export const receiptConfirmSchema = receiptIntentSchema.extend({
  previewToken: z.string().trim().min(40).max(8192),
});

export const receiptHistorySchema = z
  .object({
    cursor: uuidSchema.optional(),
    limit: z.coerce.number().int().min(1).max(100).default(20),
  })
  .default({ limit: 20 });

export const receiptVoidSchema = z.object({
  reason: z.string().trim().min(3).max(500),
});
