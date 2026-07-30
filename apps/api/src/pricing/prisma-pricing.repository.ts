import { Inject, Injectable } from "@nestjs/common";
import { Prisma, type PricingConfig } from "@prisma/client";
import { PrismaService } from "../database/prisma.service.js";
import { DomainException } from "../platform/domain.exception.js";
import { authorizedPropertyId } from "../platform/property-scope.js";
import { PricingOverlapException } from "./pricing.errors.js";
import { resolvePricing } from "./pricing-utils.js";
import type {
  PricingConfigInput,
  PricingConfigRecord,
  PricingRepository,
  PricingScope,
  GlobalPricingConfigInput,
} from "./pricing.types.js";

function dateOnly(value: Date | null) {
  return value ? value.toISOString().slice(0, 10) : null;
}

function asDate(value: string) {
  return new Date(`${value}T00:00:00.000Z`);
}

function mapConfig(config: PricingConfig): PricingConfigRecord {
  return {
    id: config.id,
    scope: config.scope,
    propertyId: config.propertyId,
    roomId: config.roomId,
    tenancyId: config.tenancyId,
    rentAmount: config.rentAmount?.toString() ?? null,
    electricityUnitPrice: config.electricityUnitPrice?.toString() ?? null,
    waterUnitPrice: config.waterUnitPrice?.toString() ?? null,
    trashFee: config.trashFee?.toString() ?? null,
    internetFee: config.internetFee?.toString() ?? null,
    serviceFee: config.serviceFee?.toString() ?? null,
    utilityClosingDay: config.utilityClosingDay,
    dueDay: config.dueDay,
    currencyCode: config.currencyCode,
    timezone: config.timezone,
    effectiveFrom: dateOnly(config.effectiveFrom) ?? "",
    effectiveTo: dateOnly(config.effectiveTo),
    isActive: config.isActive,
    notes: config.notes,
    createdAt: config.createdAt.toISOString(),
    updatedAt: config.updatedAt.toISOString(),
  };
}

@Injectable()
export class PrismaPricingRepository implements PricingRepository {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async list() {
    const configs = await this.prisma.pricingConfig.findMany({
      where: { deletedAt: null, ...this.authorizedScopeWhere() },
      orderBy: { createdAt: "desc" },
    });
    return configs.map(mapConfig);
  }

  async findById(id: string) {
    const config = await this.prisma.pricingConfig.findFirst({
      where: { id, deletedAt: null, ...this.authorizedScopeWhere() },
    });
    return config ? mapConfig(config) : null;
  }

  async getGlobal() {
    const config = await this.prisma.pricingConfig.findFirst({
      where: { deletedAt: null, isActive: true, scope: "SYSTEM" },
      orderBy: { createdAt: "desc" },
    });
    return config ? mapConfig(config) : null;
  }

  async upsertGlobal(input: GlobalPricingConfigInput) {
    const saved = await this.prisma.$transaction(async (tx) => {
      const current = await tx.pricingConfig.findFirst({
        where: { deletedAt: null, isActive: true, scope: "SYSTEM" },
        orderBy: { createdAt: "desc" },
      });
      const data = {
        scope: "SYSTEM" as const,
        propertyId: null,
        roomId: null,
        tenancyId: null,
        rentAmount: null,
        ...input,
        effectiveFrom: "2026-01-01",
        effectiveTo: null,
        isActive: true,
      };

      const config = current
        ? await tx.pricingConfig.update({
            where: { id: current.id },
            data: this.dataFor(
              data,
            ) as Prisma.PricingConfigUncheckedUpdateInput,
          })
        : await tx.pricingConfig.create({
            data: this.dataFor(
              data,
            ) as Prisma.PricingConfigUncheckedCreateInput,
          });

      await tx.pricingConfig.updateMany({
        where: {
          scope: "SYSTEM",
          isActive: true,
          deletedAt: null,
          id: { not: config.id },
        },
        data: { isActive: false },
      });

      return config;
    });

    return mapConfig(saved);
  }

  async create(input: PricingConfigInput) {
    await this.assertTargetScope(input);
    await this.assertNoOverlap(input);
    return mapConfig(
      await this.prisma.pricingConfig.create({
        data: this.dataFor(input) as Prisma.PricingConfigUncheckedCreateInput,
      }),
    );
  }

  async update(id: string, input: Partial<PricingConfigInput>) {
    const existing = await this.findById(id);
    if (!existing) return null;
    const next = { ...existing, ...input };
    await this.assertTargetScope(next);
    await this.assertNoOverlap(next, id);
    return mapConfig(
      await this.prisma.pricingConfig.update({
        where: { id },
        data: this.dataFor(input) as Prisma.PricingConfigUncheckedUpdateInput,
      }),
    );
  }

  async deactivate(id: string) {
    const existing = await this.findById(id);
    if (!existing) return null;
    return mapConfig(
      await this.prisma.pricingConfig.update({
        where: { id },
        data: { isActive: false },
      }),
    );
  }

  async resolve(input: {
    propertyId?: string;
    roomId?: string;
    tenancyId?: string;
    asOf: string;
  }) {
    await this.assertResolutionScope(input);
    const asOfDate = asDate(input.asOf);
    const configs = await this.prisma.pricingConfig.findMany({
      where: {
        deletedAt: null,
        isActive: true,
        effectiveFrom: { lte: asOfDate },
        OR: [{ effectiveTo: null }, { effectiveTo: { gt: asOfDate } }],
        AND: [
          {
            OR: [
              { scope: "SYSTEM" },
              ...(input.propertyId
                ? [
                    {
                      scope: "PROPERTY" as PricingScope,
                      propertyId: input.propertyId,
                    },
                  ]
                : []),
              ...(input.roomId
                ? [{ scope: "ROOM" as PricingScope, roomId: input.roomId }]
                : []),
              ...(input.tenancyId
                ? [
                    {
                      scope: "TENANCY" as PricingScope,
                      tenancyId: input.tenancyId,
                    },
                  ]
                : []),
            ],
          },
        ],
      },
    });

    return resolvePricing(configs.map(mapConfig));
  }

  private dataFor(input: Partial<PricingConfigInput>) {
    return {
      scope: input.scope,
      propertyId: input.propertyId,
      roomId: input.roomId,
      tenancyId: input.tenancyId,
      rentAmount: input.rentAmount,
      electricityUnitPrice: input.electricityUnitPrice,
      waterUnitPrice: input.waterUnitPrice,
      trashFee: input.trashFee,
      internetFee: input.internetFee,
      serviceFee: input.serviceFee,
      utilityClosingDay: input.utilityClosingDay,
      dueDay: input.dueDay,
      currencyCode: input.currencyCode,
      timezone: input.timezone,
      effectiveFrom: input.effectiveFrom
        ? asDate(input.effectiveFrom)
        : undefined,
      effectiveTo: input.effectiveTo
        ? asDate(input.effectiveTo)
        : input.effectiveTo,
      isActive: input.isActive,
      notes: input.notes,
    };
  }

  private authorizedScopeWhere(): Prisma.PricingConfigWhereInput {
    const propertyId = authorizedPropertyId();
    return {
      OR: [
        { scope: "SYSTEM" },
        { scope: "PROPERTY", propertyId },
        { scope: "ROOM", room: { propertyId } },
        { scope: "TENANCY", tenancy: { room: { propertyId } } },
      ],
    };
  }

  private async assertTargetScope(
    input: Pick<
      PricingConfigInput,
      "scope" | "propertyId" | "roomId" | "tenancyId"
    >,
  ) {
    if (input.scope === "SYSTEM") return;
    const propertyId = authorizedPropertyId();
    if (input.scope === "PROPERTY") {
      if (input.propertyId === propertyId) return;
      throw this.scopeException();
    }
    if (input.scope === "ROOM") {
      const room = await this.prisma.room.findFirst({
        where: { id: input.roomId ?? "", propertyId, deletedAt: null },
        select: { id: true },
      });
      if (room) return;
      throw this.scopeException();
    }

    const tenancy = await this.prisma.tenancy.findFirst({
      where: {
        id: input.tenancyId ?? "",
        deletedAt: null,
        room: { propertyId },
      },
      select: { id: true },
    });
    if (!tenancy) throw this.scopeException();
  }

  private async assertResolutionScope(input: {
    propertyId?: string;
    roomId?: string;
    tenancyId?: string;
  }) {
    const propertyId = authorizedPropertyId();
    if (input.propertyId && input.propertyId !== propertyId) {
      throw this.scopeException();
    }
    if (input.roomId) {
      const room = await this.prisma.room.findFirst({
        where: { id: input.roomId, propertyId, deletedAt: null },
        select: { id: true },
      });
      if (!room) throw this.scopeException();
    }
    if (input.tenancyId) {
      const tenancy = await this.prisma.tenancy.findFirst({
        where: {
          id: input.tenancyId,
          deletedAt: null,
          room: { propertyId },
        },
        select: { id: true },
      });
      if (!tenancy) throw this.scopeException();
    }
  }

  private scopeException() {
    return new DomainException(
      "PROPERTY_SCOPE_FORBIDDEN",
      "Resource does not belong to the authorized property",
      403,
    );
  }

  private async assertNoOverlap(
    input: Pick<
      PricingConfigInput,
      | "scope"
      | "propertyId"
      | "roomId"
      | "tenancyId"
      | "effectiveFrom"
      | "effectiveTo"
      | "isActive"
    >,
    excludeId?: string,
  ) {
    if (input.isActive === false) return;
    const effectiveFrom = asDate(input.effectiveFrom);
    const effectiveTo = input.effectiveTo ? asDate(input.effectiveTo) : null;
    const target =
      input.scope === "SYSTEM"
        ? {}
        : input.scope === "PROPERTY"
          ? { propertyId: input.propertyId }
          : input.scope === "ROOM"
            ? { roomId: input.roomId }
            : { tenancyId: input.tenancyId };

    const overlap = await this.prisma.pricingConfig.findFirst({
      where: {
        id: excludeId ? { not: excludeId } : undefined,
        deletedAt: null,
        isActive: true,
        scope: input.scope,
        ...target,
        effectiveFrom: {
          lt: effectiveTo ?? new Date("9999-12-31T00:00:00.000Z"),
        },
        OR: [{ effectiveTo: null }, { effectiveTo: { gt: effectiveFrom } }],
      },
      select: { id: true },
    });

    if (overlap) throw new PricingOverlapException();
  }
}
