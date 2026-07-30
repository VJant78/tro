import { z } from "zod";
import { boundedMoneySchema } from "../platform/numeric.js";

const uuidSchema = z.uuid();
const dateSchema = z.iso.date();

export const tenantStatusSchema = z.enum(["ACTIVE", "LEFT", "INACTIVE"]);

export const tenantListQuerySchema = z
  .object({
    limit: z.coerce.number().int().min(1).max(100).default(20),
    cursor: z.string().min(1).optional(),
    q: z.string().trim().min(1).optional(),
    filter: z
      .object({
        status: tenantStatusSchema.optional(),
        roomId: uuidSchema.optional(),
      })
      .optional(),
    "filter[status]": tenantStatusSchema.optional(),
    "filter[roomId]": uuidSchema.optional(),
  })
  .transform((query) => ({
    limit: query.limit,
    cursor: query.cursor,
    q: query.q,
    status: query.filter?.status ?? query["filter[status]"],
    roomId: query.filter?.roomId ?? query["filter[roomId]"],
  }));

export const tenantCreateSchema = z.object({
  fullName: z.string().trim().min(1).max(160),
  phone: z.string().trim().max(40).nullable().optional(),
  identityNumber: z.string().trim().max(40).nullable().optional(),
  permanentAddress: z.string().trim().max(240).nullable().optional(),
  emergencyContactName: z.string().trim().max(160).nullable().optional(),
  emergencyContactPhone: z.string().trim().max(40).nullable().optional(),
  notes: z.string().trim().max(1000).nullable().optional(),
  status: tenantStatusSchema.default("ACTIVE"),
});

export const tenantUpdateSchema = tenantCreateSchema
  .partial()
  .refine((input) => Object.keys(input).length > 0, {
    message: "At least one field is required",
  });

export const tenancyCreateSchema = z.object({
  roomId: uuidSchema,
  representativeTenantId: uuidSchema,
  startDate: dateSchema,
  billingCycleType: z.enum(["DAILY", "WEEKLY", "MONTHLY"]).default("MONTHLY"),
  billingCycleCount: z.coerce.number().int().min(1).max(120).default(1),
  billingAnchorDay: z.coerce
    .number()
    .int()
    .min(1)
    .max(31)
    .nullable()
    .optional(),
  rentAmount: boundedMoneySchema.optional(),
  depositAmount: boundedMoneySchema.optional(),
  notes: z.string().trim().max(1000).nullable().optional(),
});

export const tenancyEndSchema = z.object({
  actualEndDate: dateSchema,
  notes: z.string().trim().max(1000).nullable().optional(),
});

export const tenancyTransferSchema = z.object({
  toRoomId: uuidSchema,
  transferDate: dateSchema,
  notes: z.string().trim().max(1000).nullable().optional(),
});

export const tenancyMemberTransferSchema = tenancyTransferSchema;

export const tenancyMemberLeaveSchema = z.object({
  leftOn: dateSchema,
  notes: z.string().trim().max(1000).nullable().optional(),
});

export const representativeChangeSchema = z.object({
  newRepresentativeTenantId: uuidSchema,
  idempotencyKey: z.string().trim().min(16).max(128),
});

export const idParamSchema = z.object({ id: uuidSchema });
export const memberParamSchema = z.object({
  id: uuidSchema,
  tenantId: uuidSchema,
});
