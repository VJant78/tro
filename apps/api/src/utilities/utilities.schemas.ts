import { z } from "zod";
import {
  boundedMoneySchema,
  meterReadingSchema,
  meterValue,
} from "../platform/numeric.js";

const uuidSchema = z.uuid();
const dateSchema = z.iso.date();

export const utilityReadingKindSchema = z.enum(["MONTHLY", "MOVE_OUT"]);
export const utilityReadingStatusSchema = z.enum([
  "DRAFT",
  "FINALIZED",
  "VOIDED",
]);
export const settlementTypeSchema = z.enum(["MONTHLY", "MOVE_OUT"]);

export const utilityReadingListQuerySchema = z
  .object({
    roomId: uuidSchema.optional(),
    tenancyId: uuidSchema.optional(),
    billingYear: z.coerce.number().int().min(2000).max(2100).optional(),
    billingMonth: z.coerce.number().int().min(1).max(12).optional(),
    readingKind: utilityReadingKindSchema.optional(),
    status: utilityReadingStatusSchema.optional(),
  })
  .default({});

export const utilityReadingCreateSchema = z
  .object({
    roomId: uuidSchema,
    tenancyId: uuidSchema.nullable().optional(),
    readingKind: utilityReadingKindSchema.default("MONTHLY"),
    billingPeriodStart: dateSchema,
    billingPeriodEnd: dateSchema,
    billingYear: z.coerce.number().int().min(2000).max(2100),
    billingMonth: z.coerce.number().int().min(1).max(12),
    electricityPrevious: meterReadingSchema,
    electricityCurrent: meterReadingSchema,
    waterPrevious: meterReadingSchema,
    waterCurrent: meterReadingSchema,
    recordedAt: z.iso.datetime().optional(),
    notes: z.string().trim().max(1000).nullable().optional(),
  })
  .superRefine((input, context) => {
    if (input.billingPeriodEnd < input.billingPeriodStart) {
      context.addIssue({
        code: "custom",
        path: ["billingPeriodEnd"],
        message: "billingPeriodEnd must be on or after billingPeriodStart",
      });
    }
    if (
      meterValue(input.electricityCurrent) <
      meterValue(input.electricityPrevious)
    ) {
      context.addIssue({
        code: "custom",
        path: ["electricityCurrent"],
        message: "electricityCurrent must be greater than previous reading",
      });
    }
    if (meterValue(input.waterCurrent) < meterValue(input.waterPrevious)) {
      context.addIssue({
        code: "custom",
        path: ["waterCurrent"],
        message: "waterCurrent must be greater than previous reading",
      });
    }
  });

export const settlementInputSchema = z.object({
  tenancyId: uuidSchema,
  settlementType: settlementTypeSchema.default("MONTHLY"),
  billingYear: z.coerce.number().int().min(2000).max(2100),
  billingMonth: z.coerce.number().int().min(1).max(12),
  periodEnd: dateSchema.optional(),
  utilityReadingId: uuidSchema.nullable().optional(),
  utilityReading: z
    .object({
      electricityPrevious: meterReadingSchema,
      electricityCurrent: meterReadingSchema,
      waterPrevious: meterReadingSchema,
      waterCurrent: meterReadingSchema,
    })
    .optional()
    .superRefine((input, context) => {
      if (!input) return;
      if (
        meterValue(input.electricityCurrent) <
        meterValue(input.electricityPrevious)
      ) {
        context.addIssue({
          code: "custom",
          path: ["electricityCurrent"],
          message: "electricityCurrent must be greater than previous reading",
        });
      }
      if (meterValue(input.waterCurrent) < meterValue(input.waterPrevious)) {
        context.addIssue({
          code: "custom",
          path: ["waterCurrent"],
          message: "waterCurrent must be greater than previous reading",
        });
      }
    }),
  prepaidAmount: boundedMoneySchema.default("0"),
  notes: z.string().trim().max(1000).nullable().optional(),
});

export const settlementListQuerySchema = z
  .object({
    tenancyId: uuidSchema.optional(),
    roomId: uuidSchema.optional(),
    billingYear: z.coerce.number().int().min(2000).max(2100).optional(),
    billingMonth: z.coerce.number().int().min(1).max(12).optional(),
  })
  .default({});

export const idParamSchema = z.object({ id: uuidSchema });
