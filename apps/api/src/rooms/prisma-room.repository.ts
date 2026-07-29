import { Inject, Injectable } from "@nestjs/common";
import {
  Prisma,
  type Room,
  type Tenant,
  type Tenancy,
  type TenancyMember,
} from "@prisma/client";
import { PrismaService } from "../database/prisma.service.js";
import { RoomCodeConflictException } from "./rooms.errors.js";
import type {
  RoomCreateInput,
  RoomListQuery,
  RoomRecord,
  RoomRepository,
  RoomUpdateInput,
} from "./rooms.types.js";

function toDateString(value: Date | null) {
  return value ? value.toISOString().slice(0, 10) : null;
}

type RoomWithOccupancy = Room & {
  tenancies?: Array<
    Tenancy & {
      representativeTenant: Pick<Tenant, "id" | "fullName">;
      members: Array<
        TenancyMember & { tenant: Pick<Tenant, "id" | "fullName" | "phone"> }
      >;
    }
  >;
};

const activeOccupancyInclude = {
  tenancies: {
    where: { status: "ACTIVE", deletedAt: null },
    orderBy: { createdAt: "desc" },
    take: 1,
    include: {
      representativeTenant: { select: { id: true, fullName: true } },
      members: {
        where: { leftOn: null, deletedAt: null },
        include: {
          tenant: { select: { id: true, fullName: true, phone: true } },
        },
        orderBy: { createdAt: "asc" },
      },
    },
  },
} satisfies Prisma.RoomInclude;

function mapRoom(room: RoomWithOccupancy): RoomRecord {
  const tenancy = room.tenancies?.[0];
  const occupants =
    tenancy?.members
      .map((member) => ({
        tenantId: member.tenantId,
        fullName: member.tenant.fullName,
        phone: member.tenant.phone,
        role:
          member.isRepresentative ||
          member.tenantId === tenancy.representativeTenantId
            ? ("REPRESENTATIVE" as const)
            : ("CO_TENANT" as const),
        joinedOn: toDateString(member.joinedOn) ?? "",
      }))
      .sort((left, right) =>
        left.role === right.role ? 0 : left.role === "REPRESENTATIVE" ? -1 : 1,
      ) ?? [];
  const representative =
    occupants.find((occupant) => occupant.role === "REPRESENTATIVE") ??
    (tenancy
      ? {
          tenantId: tenancy.representativeTenantId,
          fullName: tenancy.representativeTenant.fullName,
          phone: null,
          role: "REPRESENTATIVE" as const,
          joinedOn: toDateString(tenancy.startDate) ?? "",
        }
      : null);

  return {
    id: room.id,
    propertyId: room.propertyId,
    roomGroupId: room.roomGroupId,
    code: room.code,
    name: room.name,
    roomType: room.roomType,
    status: room.status,
    defaultRentAmount: room.defaultRentAmount.toString(),
    defaultBillingCycleType: room.defaultBillingCycleType,
    defaultBillingCycleCount: room.defaultBillingCycleCount,
    maxOccupants: room.maxOccupants,
    rentPaidUntil: toDateString(room.rentPaidUntil),
    depositAmount: room.depositAmount.toString(),
    notes: room.notes,
    currentOccupancy:
      tenancy && representative
        ? {
            tenancyId: tenancy.id,
            representativeTenantId: tenancy.representativeTenantId,
            representativeName: representative.fullName,
            startedOn: toDateString(tenancy.startDate) ?? "",
            memberCount: occupants.length || 1,
            coTenantCount: Math.max(0, (occupants.length || 1) - 1),
            occupants: occupants.length ? occupants : [representative],
          }
        : null,
    createdAt: room.createdAt.toISOString(),
    updatedAt: room.updatedAt.toISOString(),
  };
}

function orderByFor(
  sort: RoomListQuery["sort"],
): Prisma.RoomOrderByWithRelationInput {
  if (sort === "createdAt:asc") return { createdAt: "asc" };
  if (sort === "code:asc") return { code: "asc" };
  if (sort === "code:desc") return { code: "desc" };
  return { createdAt: "desc" };
}

@Injectable()
export class PrismaRoomRepository implements RoomRepository {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async list(query: RoomListQuery) {
    const where: Prisma.RoomWhereInput = {
      deletedAt: null,
      ...(query.status ? { status: query.status } : {}),
      ...(query.groupId ? { roomGroupId: query.groupId } : {}),
      ...(query.q
        ? {
            OR: [
              { code: { contains: query.q, mode: "insensitive" } },
              { name: { contains: query.q, mode: "insensitive" } },
            ],
          }
        : {}),
    };

    const rooms = await this.prisma.room.findMany({
      where,
      orderBy: orderByFor(query.sort),
      take: query.limit + 1,
      ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
      include: activeOccupancyInclude,
    });

    const data = rooms.slice(0, query.limit).map(mapRoom);

    return {
      data,
      page: {
        limit: query.limit,
        nextCursor:
          rooms.length > query.limit ? (data.at(-1)?.id ?? null) : null,
        hasMore: rooms.length > query.limit,
      },
    };
  }

  async findById(id: string) {
    const room = await this.prisma.room.findFirst({
      where: { id, deletedAt: null },
      include: activeOccupancyInclude,
    });

    return room ? mapRoom(room) : null;
  }

  async create(input: RoomCreateInput) {
    await this.assertCodeAvailable(input.propertyId, input.code);

    try {
      const room = await this.prisma.room.create({
        data: {
          propertyId: input.propertyId,
          roomGroupId: input.roomGroupId,
          code: input.code,
          name: input.name,
          roomType: input.roomType,
          status: input.status,
          defaultRentAmount: input.defaultRentAmount,
          defaultBillingCycleType: input.defaultBillingCycleType,
          defaultBillingCycleCount: input.defaultBillingCycleCount,
          maxOccupants: input.maxOccupants,
          depositAmount: input.depositAmount,
          notes: input.notes,
        },
      });

      return mapRoom(room);
    } catch (error) {
      this.rethrowConflict(error);
      throw error;
    }
  }

  async update(id: string, input: RoomUpdateInput) {
    const existing = await this.prisma.room.findFirst({
      where: { id, deletedAt: null },
    });
    if (!existing) return null;

    if (input.code && input.code !== existing.code) {
      await this.assertCodeAvailable(existing.propertyId, input.code, id);
    }

    try {
      const room = await this.prisma.room.update({
        where: { id },
        data: {
          roomGroupId: input.roomGroupId,
          code: input.code,
          name: input.name,
          roomType: input.roomType,
          status: input.status,
          defaultRentAmount: input.defaultRentAmount,
          defaultBillingCycleType: input.defaultBillingCycleType,
          defaultBillingCycleCount: input.defaultBillingCycleCount,
          maxOccupants: input.maxOccupants,
          depositAmount: input.depositAmount,
          notes: input.notes,
        },
      });

      return mapRoom(room);
    } catch (error) {
      this.rethrowConflict(error);
      throw error;
    }
  }

  async retire(id: string) {
    const existing = await this.prisma.room.findFirst({
      where: { id, deletedAt: null },
    });
    if (!existing) return null;

    const room = await this.prisma.room.update({
      where: { id },
      data: {
        status: "INACTIVE",
        deletedAt: new Date(),
      },
    });

    return mapRoom(room);
  }

  private async assertCodeAvailable(
    propertyId: string,
    code: string,
    excludeId?: string,
  ) {
    const existing = await this.prisma.room.findFirst({
      where: {
        propertyId,
        code,
        deletedAt: null,
        ...(excludeId ? { id: { not: excludeId } } : {}),
      },
      select: { id: true },
    });

    if (existing) {
      throw new RoomCodeConflictException();
    }
  }

  private rethrowConflict(error: unknown) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      throw new RoomCodeConflictException();
    }
  }
}
