import { z } from "zod";
import { settlementInputSchema } from "../utilities/utilities.schemas.js";
import {
  boundedMoneySchema,
  meterReadingSchema,
  meterValue,
} from "../platform/numeric.js";

const uuidSchema = z.uuid();
const dateSchema = z.iso.date();
const idempotencyKeySchema = z.string().trim().min(16).max(128);
const readingsSchema = z
  .object({
    electricityPrevious: meterReadingSchema,
    electricityCurrent: meterReadingSchema,
    waterPrevious: meterReadingSchema,
    waterCurrent: meterReadingSchema,
  })
  .superRefine((input, context) => {
    if (
      meterValue(input.electricityCurrent) <
      meterValue(input.electricityPrevious)
    ) {
      context.addIssue({
        code: "custom",
        path: ["electricityCurrent"],
        message: "electricityCurrent must not be below the previous reading",
      });
    }
    if (meterValue(input.waterCurrent) < meterValue(input.waterPrevious)) {
      context.addIssue({
        code: "custom",
        path: ["waterCurrent"],
        message: "waterCurrent must not be below the previous reading",
      });
    }
  });

export const finalizeAndInvoiceSchema = settlementInputSchema.extend({
  idempotencyKey: idempotencyKeySchema,
});

export const wholeGroupTransferSchema = z.object({
  idempotencyKey: idempotencyKeySchema,
  toRoomId: uuidSchema,
  transferDate: dateSchema,
  handoverReadings: readingsSchema,
  prepaidAmount: boundedMoneySchema.default("0"),
  notes: z.string().trim().max(1000).nullable().optional(),
});

export const wholeGroupEndSchema = z.object({
  idempotencyKey: idempotencyKeySchema,
  actualEndDate: dateSchema,
  handoverReadings: readingsSchema,
  prepaidAmount: boundedMoneySchema.default("0"),
  notes: z.string().trim().max(1000).nullable().optional(),
});

export const tenancyIdParamSchema = z.object({ id: uuidSchema });

export const operationRecoverySchema = z.object({
  idempotencyKey: idempotencyKeySchema,
});

export const operationCancelSchema = operationRecoverySchema.extend({
  reason: z.string().trim().min(3).max(500),
});

export type FinalizeAndInvoiceInput = z.infer<typeof finalizeAndInvoiceSchema>;
export type WholeGroupTransferInput = z.infer<typeof wholeGroupTransferSchema>;
export type WholeGroupEndInput = z.infer<typeof wholeGroupEndSchema>;
export type OperationRecoveryInput = z.infer<typeof operationRecoverySchema>;
export type OperationCancelInput = z.infer<typeof operationCancelSchema>;
