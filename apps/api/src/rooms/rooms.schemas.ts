import { z } from "zod";

export const defaultPropertyId = "00000000-0000-4000-8000-000000000002";

const uuidSchema = z.uuid();
const moneySchema = z
  .union([z.string(), z.number()])
  .transform((value) => String(value).trim())
  .refine((value) => /^\d+$/.test(value), "Must be a non-negative integer");

export const roomStatusSchema = z.enum([
  "VACANT",
  "OCCUPIED",
  "MAINTENANCE",
  "INACTIVE",
]);

export const billingCycleTypeSchema = z.enum(["DAILY", "WEEKLY", "MONTHLY"]);

export const roomListQuerySchema = z
  .object({
    limit: z.coerce.number().int().min(1).max(100).default(20),
    cursor: z.string().min(1).optional(),
    q: z.string().trim().min(1).optional(),
    sort: z
      .enum(["createdAt:desc", "createdAt:asc", "code:asc", "code:desc"])
      .default("createdAt:desc"),
    filter: z
      .object({
        status: roomStatusSchema.optional(),
        groupId: uuidSchema.optional(),
      })
      .optional(),
    "filter[status]": roomStatusSchema.optional(),
    "filter[groupId]": uuidSchema.optional(),
  })
  .transform((query) => ({
    limit: query.limit,
    cursor: query.cursor,
    q: query.q,
    sort: query.sort,
    status: query.filter?.status ?? query["filter[status]"],
    groupId: query.filter?.groupId ?? query["filter[groupId]"],
  }));

const normalizedCodeSchema = z
  .string()
  .trim()
  .min(1)
  .max(32)
  .regex(
    /^[A-Z0-9][A-Z0-9._-]*$/i,
    "Use letters, numbers, dot, dash or underscore",
  )
  .transform((value) => value.toUpperCase());

export const roomCreateSchema = z.object({
  propertyId: uuidSchema.default(defaultPropertyId),
  roomGroupId: uuidSchema.nullable().optional(),
  code: normalizedCodeSchema,
  name: z.string().trim().min(1).max(120),
  roomType: z.string().trim().max(80).nullable().optional(),
  status: roomStatusSchema.default("VACANT"),
  defaultRentAmount: moneySchema.default("0"),
  defaultBillingCycleType: billingCycleTypeSchema.default("MONTHLY"),
  defaultBillingCycleCount: z.coerce.number().int().min(1).max(120).default(1),
  maxOccupants: z.coerce.number().int().min(1).max(100).default(1),
  depositAmount: moneySchema.default("0"),
  notes: z.string().trim().max(1000).nullable().optional(),
});

export const roomUpdateSchema = roomCreateSchema
  .omit({ propertyId: true })
  .partial()
  .refine((input) => Object.keys(input).length > 0, {
    message: "At least one field is required",
  });
