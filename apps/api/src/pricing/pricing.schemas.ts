import { z } from "zod";

const uuidSchema = z.uuid();
const dateSchema = z.iso.date();
const moneySchema = z
  .union([z.string(), z.number()])
  .transform((value) => String(value).trim())
  .refine((value) => /^\d+$/.test(value), "Must be a non-negative integer");
const nullableMoneySchema = moneySchema.nullable().optional();

export const pricingScopeSchema = z.enum([
  "SYSTEM",
  "PROPERTY",
  "ROOM",
  "TENANCY",
]);

const pricingConfigBaseSchema = z.object({
  scope: pricingScopeSchema,
  propertyId: uuidSchema.nullable().optional(),
  roomId: uuidSchema.nullable().optional(),
  tenancyId: uuidSchema.nullable().optional(),
  rentAmount: nullableMoneySchema,
  electricityUnitPrice: nullableMoneySchema,
  waterUnitPrice: nullableMoneySchema,
  trashFee: nullableMoneySchema,
  internetFee: nullableMoneySchema,
  serviceFee: nullableMoneySchema,
  utilityClosingDay: z.coerce
    .number()
    .int()
    .min(1)
    .max(31)
    .nullable()
    .optional(),
  dueDay: z.coerce.number().int().min(1).max(31).nullable().optional(),
  currencyCode: z.string().trim().min(3).max(3).nullable().optional(),
  timezone: z.string().trim().min(1).max(80).nullable().optional(),
  effectiveFrom: dateSchema,
  effectiveTo: dateSchema.nullable().optional(),
  isActive: z.boolean().default(true),
  notes: z.string().trim().max(1000).nullable().optional(),
});

function validatePricingTarget(
  input: {
    scope?: "SYSTEM" | "PROPERTY" | "ROOM" | "TENANCY";
    propertyId?: string | null;
    roomId?: string | null;
    tenancyId?: string | null;
    effectiveFrom?: string;
    effectiveTo?: string | null;
  },
  context: z.RefinementCtx,
) {
  if (
    input.effectiveTo &&
    input.effectiveFrom &&
    input.effectiveTo <= input.effectiveFrom
  ) {
    context.addIssue({
      code: "custom",
      path: ["effectiveTo"],
      message: "effectiveTo must be after effectiveFrom",
    });
  }
  if (!input.scope) return;

  const hasProperty = Boolean(input.propertyId);
  const hasRoom = Boolean(input.roomId);
  const hasTenancy = Boolean(input.tenancyId);
  if (input.scope === "SYSTEM" && (hasProperty || hasRoom || hasTenancy)) {
    context.addIssue({
      code: "custom",
      path: ["scope"],
      message: "SYSTEM config must not target property, room or tenancy",
    });
  }
  if (input.scope === "PROPERTY" && (!hasProperty || hasRoom || hasTenancy)) {
    context.addIssue({
      code: "custom",
      path: ["propertyId"],
      message: "PROPERTY config requires propertyId only",
    });
  }
  if (input.scope === "ROOM" && (!hasRoom || hasProperty || hasTenancy)) {
    context.addIssue({
      code: "custom",
      path: ["roomId"],
      message: "ROOM config requires roomId only",
    });
  }
  if (input.scope === "TENANCY" && (!hasTenancy || hasProperty || hasRoom)) {
    context.addIssue({
      code: "custom",
      path: ["tenancyId"],
      message: "TENANCY config requires tenancyId only",
    });
  }
}

export const pricingConfigSchema = pricingConfigBaseSchema.superRefine(
  validatePricingTarget,
);

export const pricingUpdateSchema = pricingConfigBaseSchema
  .partial()
  .refine((input) => Object.keys(input).length > 0, {
    message: "At least one field is required",
  })
  .superRefine(validatePricingTarget);

export const pricingEffectiveQuerySchema = z.object({
  propertyId: uuidSchema.optional(),
  roomId: uuidSchema.optional(),
  tenancyId: uuidSchema.optional(),
  asOf: dateSchema.default("2026-07-29"),
});

export const globalPricingUpdateSchema = z
  .object({
    electricityUnitPrice: nullableMoneySchema,
    waterUnitPrice: nullableMoneySchema,
    trashFee: nullableMoneySchema,
    internetFee: nullableMoneySchema,
    serviceFee: nullableMoneySchema,
    utilityClosingDay: z.coerce
      .number()
      .int()
      .min(1)
      .max(31)
      .nullable()
      .optional(),
    dueDay: z.coerce.number().int().min(1).max(31).nullable().optional(),
    currencyCode: z.string().trim().min(3).max(3).nullable().optional(),
    timezone: z.string().trim().min(1).max(80).nullable().optional(),
    notes: z.string().trim().max(1000).nullable().optional(),
  })
  .refine((input) => Object.keys(input).length > 0, {
    message: "At least one field is required",
  });

export const idParamSchema = z.object({ id: uuidSchema });
