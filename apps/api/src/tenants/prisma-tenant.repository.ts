import { Inject, Injectable } from "@nestjs/common";
import {
  Prisma,
  type Room,
  type Tenant,
  type Tenancy,
  type TenancyMember,
} from "@prisma/client";
import { PrismaService } from "../database/prisma.service.js";
import { RoomNotFoundException } from "../rooms/rooms.errors.js";
import {
  ActiveTenancyConflictException,
  TenantNotFoundException,
} from "./tenants.errors.js";
import type {
  TenancyCreateInput,
  TenancyEndInput,
  TenancyMemberLeaveInput,
  TenancyMemberTransferInput,
  TenancyRecord,
  TenancyTransferInput,
  TenantCreateInput,
  TenantListQuery,
  TenantRecord,
  TenantRepository,
  TenantUpdateInput,
} from "./tenants.types.js";

function businessDate(value: Date | null) {
  return value ? value.toISOString().slice(0, 10) : null;
}

function asDate(value: string) {
  return new Date(`${value}T00:00:00.000Z`);
}

type TenantWithCurrentTenancy = Tenant & {
  memberships?: Array<
    TenancyMember & {
      tenancy: Tenancy & {
        room: Pick<Room, "id" | "code">;
        representativeTenant: Pick<Tenant, "id" | "fullName">;
      };
    }
  >;
};

type TenancyWithRelations = Tenancy & {
  room?: Pick<Room, "id" | "code">;
  representativeTenant?: Pick<Tenant, "id" | "fullName">;
  members?: Array<
    TenancyMember & { tenant: Pick<Tenant, "id" | "fullName" | "phone"> }
  >;
};

const activeMembershipInclude = {
  memberships: {
    where: {
      leftOn: null,
      deletedAt: null,
      tenancy: { status: "ACTIVE", deletedAt: null },
    },
    take: 1,
    include: {
      tenancy: {
        include: {
          room: { select: { id: true, code: true } },
          representativeTenant: { select: { id: true, fullName: true } },
        },
      },
    },
  },
} satisfies Prisma.TenantInclude;

const tenancyRelationInclude = {
  room: { select: { id: true, code: true } },
  representativeTenant: { select: { id: true, fullName: true } },
  members: {
    where: { deletedAt: null },
    include: { tenant: { select: { id: true, fullName: true, phone: true } } },
    orderBy: { createdAt: "asc" },
  },
} satisfies Prisma.TenancyInclude;

function mapTenant(tenant: TenantWithCurrentTenancy): TenantRecord {
  const membership = tenant.memberships?.[0];
  return {
    id: tenant.id,
    fullName: tenant.fullName,
    phone: tenant.phone,
    identityNumber: tenant.identityNumber,
    permanentAddress: tenant.permanentAddress,
    emergencyContactName: tenant.emergencyContactName,
    emergencyContactPhone: tenant.emergencyContactPhone,
    notes: tenant.notes,
    status: tenant.status,
    currentTenancy: membership
      ? {
          tenancyId: membership.tenancyId,
          roomId: membership.tenancy.roomId,
          roomCode: membership.tenancy.room.code,
          representativeTenantId: membership.tenancy.representativeTenantId,
          representativeName: membership.tenancy.representativeTenant.fullName,
          role:
            membership.isRepresentative ||
            membership.tenantId === membership.tenancy.representativeTenantId
              ? "REPRESENTATIVE"
              : "CO_TENANT",
          startDate: businessDate(membership.tenancy.startDate) ?? "",
          joinedOn: businessDate(membership.joinedOn) ?? "",
        }
      : null,
    createdAt: tenant.createdAt.toISOString(),
    updatedAt: tenant.updatedAt.toISOString(),
  };
}

function mapTenancy(
  tenancy: TenancyWithRelations,
  tenantId?: string,
): TenancyRecord {
  const members =
    tenancy.members
      ?.map((member) => ({
        tenantId: member.tenantId,
        fullName: member.tenant.fullName,
        phone: member.tenant.phone,
        role:
          member.isRepresentative ||
          member.tenantId === tenancy.representativeTenantId
            ? ("REPRESENTATIVE" as const)
            : ("CO_TENANT" as const),
        joinedOn: businessDate(member.joinedOn) ?? "",
        leftOn: businessDate(member.leftOn),
      }))
      .sort((left, right) =>
        left.role === right.role ? 0 : left.role === "REPRESENTATIVE" ? -1 : 1,
      ) ?? [];
  const membershipRole =
    members.find((member) => member.tenantId === tenantId)?.role ?? null;

  return {
    id: tenancy.id,
    roomId: tenancy.roomId,
    roomCode: tenancy.room?.code ?? null,
    representativeTenantId: tenancy.representativeTenantId,
    representativeTenantName: tenancy.representativeTenant?.fullName ?? null,
    status: tenancy.status,
    startDate: businessDate(tenancy.startDate) ?? "",
    actualEndDate: businessDate(tenancy.actualEndDate),
    billingCycleType: tenancy.billingCycleType,
    billingCycleCount: tenancy.billingCycleCount,
    billingAnchorDay: tenancy.billingAnchorDay,
    rentAmount: tenancy.rentAmount.toString(),
    rentPaidUntil: businessDate(tenancy.rentPaidUntil),
    depositAmount: tenancy.depositAmount.toString(),
    notes: tenancy.notes,
    membershipRole,
    memberCount:
      members.filter((member) => member.leftOn === null).length ||
      (tenancy.status === "ACTIVE" ? 1 : members.length),
    members,
    createdAt: tenancy.createdAt.toISOString(),
    updatedAt: tenancy.updatedAt.toISOString(),
  };
}

@Injectable()
export class PrismaTenantRepository implements TenantRepository {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async list(query: TenantListQuery) {
    const where: Prisma.TenantWhereInput = {
      deletedAt: null,
      ...(query.status ? { status: query.status } : {}),
      ...(query.roomId
        ? {
            memberships: {
              some: {
                leftOn: null,
                deletedAt: null,
                tenancy: {
                  roomId: query.roomId,
                  status: "ACTIVE",
                  deletedAt: null,
                },
              },
            },
          }
        : {}),
      ...(query.q
        ? {
            OR: [
              { fullName: { contains: query.q, mode: "insensitive" } },
              { phone: { contains: query.q, mode: "insensitive" } },
              { identityNumber: { contains: query.q, mode: "insensitive" } },
            ],
          }
        : {}),
    };
    const tenants = await this.prisma.tenant.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: query.limit + 1,
      ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
      include: activeMembershipInclude,
    });
    const data = tenants.slice(0, query.limit).map(mapTenant);

    return {
      data,
      page: {
        limit: query.limit,
        nextCursor:
          tenants.length > query.limit ? (data.at(-1)?.id ?? null) : null,
        hasMore: tenants.length > query.limit,
      },
    };
  }

  async findTenantById(id: string) {
    const tenant = await this.prisma.tenant.findFirst({
      where: { id, deletedAt: null },
      include: activeMembershipInclude,
    });
    return tenant ? mapTenant(tenant) : null;
  }

  async createTenant(input: TenantCreateInput) {
    return mapTenant(
      await this.prisma.tenant.create({
        data: input,
        include: activeMembershipInclude,
      }),
    );
  }

  async updateTenant(id: string, input: TenantUpdateInput) {
    const existing = await this.findTenantById(id);
    if (!existing) return null;
    return mapTenant(
      await this.prisma.tenant.update({
        where: { id },
        data: input,
        include: activeMembershipInclude,
      }),
    );
  }

  async retireTenant(id: string) {
    const existing = await this.findTenantById(id);
    if (!existing) return null;
    return mapTenant(
      await this.prisma.tenant.update({
        where: { id },
        data: { status: "INACTIVE", deletedAt: new Date() },
        include: activeMembershipInclude,
      }),
    );
  }

  async createTenancy(input: TenancyCreateInput) {
    try {
      const tenancy = await this.prisma.$transaction(async (tx) => {
        const tenant = await tx.tenant.findFirst({
          where: { id: input.representativeTenantId, deletedAt: null },
          select: { id: true },
        });
        if (!tenant) throw new TenantNotFoundException();

        const room = await tx.room.findFirst({
          where: { id: input.roomId, deletedAt: null },
          select: {
            id: true,
            defaultRentAmount: true,
            defaultBillingCycleType: true,
            defaultBillingCycleCount: true,
            depositAmount: true,
            maxOccupants: true,
          },
        });
        if (!room) throw new RoomNotFoundException();

        await this.assertTenantHasNoActiveMembership(
          tx,
          input.representativeTenantId,
        );

        const activeRoomTenancy = await tx.tenancy.findFirst({
          where: { roomId: input.roomId, status: "ACTIVE", deletedAt: null },
          include: {
            members: {
              where: { leftOn: null, deletedAt: null },
              select: { id: true },
            },
          },
        });

        if (activeRoomTenancy) {
          if (activeRoomTenancy.members.length >= room.maxOccupants) {
            throw new ActiveTenancyConflictException(
              "Room is at maximum occupancy",
            );
          }

          await tx.tenancyMember.create({
            data: {
              tenancyId: activeRoomTenancy.id,
              tenantId: input.representativeTenantId,
              joinedOn: asDate(input.startDate),
              isRepresentative: false,
              role: "CO_TENANT",
            },
          });

          return tx.tenancy.findUniqueOrThrow({
            where: { id: activeRoomTenancy.id },
            include: tenancyRelationInclude,
          });
        }

        const created = await tx.tenancy.create({
          data: {
            roomId: input.roomId,
            representativeTenantId: input.representativeTenantId,
            status: "ACTIVE",
            startDate: asDate(input.startDate),
            billingCycleType:
              input.billingCycleType ?? room.defaultBillingCycleType,
            billingCycleCount:
              input.billingCycleCount ?? room.defaultBillingCycleCount,
            billingAnchorDay: input.billingAnchorDay,
            rentAmount: input.rentAmount ?? room.defaultRentAmount,
            depositAmount: input.depositAmount ?? room.depositAmount,
            notes: input.notes,
          },
        });

        await tx.tenancyMember.create({
          data: {
            tenancyId: created.id,
            tenantId: input.representativeTenantId,
            joinedOn: asDate(input.startDate),
            isRepresentative: true,
            role: "REPRESENTATIVE",
          },
        });

        await tx.room.update({
          where: { id: input.roomId },
          data: {
            status: "OCCUPIED",
            currentRentStartedOn: asDate(input.startDate),
          },
        });

        return tx.tenancy.findUniqueOrThrow({
          where: { id: created.id },
          include: tenancyRelationInclude,
        });
      });

      return mapTenancy(tenancy, input.representativeTenantId);
    } catch (error) {
      this.rethrowConflict(error);
      throw error;
    }
  }

  async endTenancy(id: string, input: TenancyEndInput) {
    const existing = await this.prisma.tenancy.findFirst({
      where: { id, deletedAt: null },
    });
    if (!existing) return null;

    const tenancy = await this.prisma.$transaction(async (tx) => {
      const ended = await tx.tenancy.update({
        where: { id },
        data: {
          status: "ENDED",
          actualEndDate: asDate(input.actualEndDate),
          notes: input.notes ?? existing.notes,
        },
      });
      await tx.tenancyMember.updateMany({
        where: { tenancyId: id, leftOn: null, deletedAt: null },
        data: { leftOn: asDate(input.actualEndDate) },
      });
      await tx.room.update({
        where: { id: existing.roomId },
        data: { status: "VACANT", currentRentStartedOn: null },
      });
      return tx.tenancy.findUniqueOrThrow({
        where: { id: ended.id },
        include: tenancyRelationInclude,
      });
    });

    return mapTenancy(tenancy);
  }

  async transferTenancy(id: string, input: TenancyTransferInput) {
    const existing = await this.prisma.tenancy.findFirst({
      where: { id, deletedAt: null, status: "ACTIVE" },
      include: {
        members: {
          where: { leftOn: null, deletedAt: null },
          select: {
            tenantId: true,
            role: true,
            isRepresentative: true,
          },
          orderBy: { createdAt: "asc" },
        },
      },
    });
    if (!existing) return null;

    const targetRoom = await this.prisma.room.findFirst({
      where: { id: input.toRoomId, deletedAt: null },
      select: { id: true, maxOccupants: true },
    });
    if (!targetRoom) throw new RoomNotFoundException();

    const activeTargetRoom = await this.prisma.tenancy.findFirst({
      where: {
        roomId: input.toRoomId,
        status: "ACTIVE",
        deletedAt: null,
        id: { not: id },
      },
      select: { id: true },
    });
    if (activeTargetRoom) {
      throw new ActiveTenancyConflictException(
        "Target room already has an active tenancy",
      );
    }

    const movingMembers = existing.members.length
      ? existing.members
      : [
          {
            tenantId: existing.representativeTenantId,
            role: "REPRESENTATIVE",
            isRepresentative: true,
          },
        ];
    if (movingMembers.length > targetRoom.maxOccupants) {
      throw new ActiveTenancyConflictException(
        "Target room cannot fit all current occupants",
      );
    }

    const newTenancy = await this.prisma.$transaction(async (tx) => {
      await tx.tenancy.update({
        where: { id },
        data: {
          status: "ENDED",
          actualEndDate: asDate(input.transferDate),
          notes: input.notes ?? existing.notes,
        },
      });
      await tx.tenancyMember.updateMany({
        where: { tenancyId: id, leftOn: null, deletedAt: null },
        data: { leftOn: asDate(input.transferDate) },
      });
      await tx.room.update({
        where: { id: existing.roomId },
        data: { status: "VACANT", currentRentStartedOn: null },
      });
      const created = await tx.tenancy.create({
        data: {
          roomId: input.toRoomId,
          representativeTenantId: existing.representativeTenantId,
          status: "ACTIVE",
          startDate: asDate(input.transferDate),
          billingCycleType: existing.billingCycleType,
          billingCycleCount: existing.billingCycleCount,
          billingAnchorDay: existing.billingAnchorDay,
          rentAmount: existing.rentAmount,
          depositAmount: existing.depositAmount,
          notes: input.notes,
        },
      });
      await tx.tenancyMember.createMany({
        data: movingMembers.map((member) => ({
          tenancyId: created.id,
          tenantId: member.tenantId,
          joinedOn: asDate(input.transferDate),
          isRepresentative:
            member.isRepresentative ||
            member.tenantId === existing.representativeTenantId,
          role:
            member.isRepresentative ||
            member.tenantId === existing.representativeTenantId
              ? "REPRESENTATIVE"
              : (member.role ?? "CO_TENANT"),
        })),
      });
      await tx.room.update({
        where: { id: input.toRoomId },
        data: {
          status: "OCCUPIED",
          currentRentStartedOn: asDate(input.transferDate),
        },
      });
      await tx.roomHandoverRecord.create({
        data: {
          roomId: input.toRoomId,
          tenancyId: created.id,
          handoverType: "TRANSFER",
          handoverAt: asDate(input.transferDate),
          notes: input.notes,
        },
      });
      return tx.tenancy.findUniqueOrThrow({
        where: { id: created.id },
        include: tenancyRelationInclude,
      });
    });

    return mapTenancy(newTenancy);
  }

  async transferMember(
    tenancyId: string,
    tenantId: string,
    input: TenancyMemberTransferInput,
  ) {
    const existing = await this.prisma.tenancy.findFirst({
      where: { id: tenancyId, deletedAt: null, status: "ACTIVE" },
      include: {
        members: {
          where: { leftOn: null, deletedAt: null },
          select: {
            id: true,
            tenantId: true,
            role: true,
            isRepresentative: true,
          },
          orderBy: { createdAt: "asc" },
        },
      },
    });
    if (!existing) return null;
    if (existing.roomId === input.toRoomId) {
      throw new ActiveTenancyConflictException(
        "Target room must be different from current room",
      );
    }

    const movingMember = existing.members.find(
      (member) => member.tenantId === tenantId,
    );
    if (!movingMember) return null;

    const isRepresentative =
      movingMember.isRepresentative ||
      tenantId === existing.representativeTenantId;
    if (isRepresentative && existing.members.length > 1) {
      throw new ActiveTenancyConflictException(
        "Representative cannot move alone while co-tenants remain",
      );
    }

    const targetRoom = await this.prisma.room.findFirst({
      where: { id: input.toRoomId, deletedAt: null },
      select: {
        id: true,
        defaultRentAmount: true,
        defaultBillingCycleType: true,
        defaultBillingCycleCount: true,
        depositAmount: true,
        maxOccupants: true,
      },
    });
    if (!targetRoom) throw new RoomNotFoundException();

    const targetTenancy = await this.prisma.tenancy.findFirst({
      where: { roomId: input.toRoomId, status: "ACTIVE", deletedAt: null },
      include: {
        members: {
          where: { leftOn: null, deletedAt: null },
          select: { id: true },
        },
      },
    });
    if (
      targetTenancy &&
      targetTenancy.members.length >= targetRoom.maxOccupants
    ) {
      throw new ActiveTenancyConflictException(
        "Target room is at maximum occupancy",
      );
    }

    const target = await this.prisma.$transaction(async (tx) => {
      await tx.tenancyMember.update({
        where: { id: movingMember.id },
        data: { leftOn: asDate(input.transferDate) },
      });

      if (existing.members.length === 1) {
        await tx.tenancy.update({
          where: { id: tenancyId },
          data: {
            status: "ENDED",
            actualEndDate: asDate(input.transferDate),
            notes: input.notes ?? existing.notes,
          },
        });
        await tx.room.update({
          where: { id: existing.roomId },
          data: { status: "VACANT", currentRentStartedOn: null },
        });
      }

      if (targetTenancy) {
        await tx.tenancyMember.create({
          data: {
            tenancyId: targetTenancy.id,
            tenantId,
            joinedOn: asDate(input.transferDate),
            isRepresentative: false,
            role: "CO_TENANT",
          },
        });
        await tx.roomHandoverRecord.create({
          data: {
            roomId: input.toRoomId,
            tenancyId: targetTenancy.id,
            handoverType: "TRANSFER_MEMBER",
            handoverAt: asDate(input.transferDate),
            notes: input.notes,
          },
        });
        return tx.tenancy.findUniqueOrThrow({
          where: { id: targetTenancy.id },
          include: tenancyRelationInclude,
        });
      }

      const created = await tx.tenancy.create({
        data: {
          roomId: input.toRoomId,
          representativeTenantId: tenantId,
          status: "ACTIVE",
          startDate: asDate(input.transferDate),
          billingCycleType: targetRoom.defaultBillingCycleType,
          billingCycleCount: targetRoom.defaultBillingCycleCount,
          rentAmount: targetRoom.defaultRentAmount,
          depositAmount: targetRoom.depositAmount,
          notes: input.notes,
        },
      });
      await tx.tenancyMember.create({
        data: {
          tenancyId: created.id,
          tenantId,
          joinedOn: asDate(input.transferDate),
          isRepresentative: true,
          role: "REPRESENTATIVE",
        },
      });
      await tx.room.update({
        where: { id: input.toRoomId },
        data: {
          status: "OCCUPIED",
          currentRentStartedOn: asDate(input.transferDate),
        },
      });
      await tx.roomHandoverRecord.create({
        data: {
          roomId: input.toRoomId,
          tenancyId: created.id,
          handoverType: "TRANSFER_MEMBER",
          handoverAt: asDate(input.transferDate),
          notes: input.notes,
        },
      });
      return tx.tenancy.findUniqueOrThrow({
        where: { id: created.id },
        include: tenancyRelationInclude,
      });
    });

    return mapTenancy(target, tenantId);
  }

  async leaveMember(
    tenancyId: string,
    tenantId: string,
    input: TenancyMemberLeaveInput,
  ) {
    const existing = await this.prisma.tenancy.findFirst({
      where: { id: tenancyId, deletedAt: null, status: "ACTIVE" },
      include: {
        members: {
          where: { leftOn: null, deletedAt: null },
          select: {
            id: true,
            tenantId: true,
            isRepresentative: true,
          },
        },
      },
    });
    if (!existing) return null;

    const leavingMember = existing.members.find(
      (member) => member.tenantId === tenantId,
    );
    if (!leavingMember) return null;

    const isRepresentative =
      leavingMember.isRepresentative ||
      tenantId === existing.representativeTenantId;
    if (isRepresentative && existing.members.length > 1) {
      throw new ActiveTenancyConflictException(
        "Representative cannot leave while co-tenants remain",
      );
    }

    const tenancy = await this.prisma.$transaction(async (tx) => {
      await tx.tenancyMember.update({
        where: { id: leavingMember.id },
        data: { leftOn: asDate(input.leftOn) },
      });

      if (existing.members.length === 1) {
        await tx.tenancy.update({
          where: { id: tenancyId },
          data: {
            status: "ENDED",
            actualEndDate: asDate(input.leftOn),
            notes: input.notes ?? existing.notes,
          },
        });
        await tx.room.update({
          where: { id: existing.roomId },
          data: { status: "VACANT", currentRentStartedOn: null },
        });
      }

      return tx.tenancy.findUniqueOrThrow({
        where: { id: tenancyId },
        include: tenancyRelationInclude,
      });
    });

    return mapTenancy(tenancy, tenantId);
  }

  async listTenancies(tenantId?: string) {
    const tenancies = await this.prisma.tenancy.findMany({
      where: {
        deletedAt: null,
        ...(tenantId
          ? {
              members: {
                some: { tenantId, deletedAt: null },
              },
            }
          : {}),
      },
      orderBy: { createdAt: "desc" },
      include: tenancyRelationInclude,
    });
    return tenancies.map((tenancy) => mapTenancy(tenancy, tenantId));
  }

  private async assertTenantHasNoActiveMembership(
    tx: Prisma.TransactionClient,
    tenantId: string,
    excludeTenancyId?: string,
  ) {
    const activeTenantMembership = await tx.tenancyMember.findFirst({
      where: {
        tenantId,
        leftOn: null,
        deletedAt: null,
        tenancy: {
          status: "ACTIVE",
          deletedAt: null,
          ...(excludeTenancyId ? { id: { not: excludeTenancyId } } : {}),
        },
      },
      select: { id: true },
    });

    if (activeTenantMembership) {
      throw new ActiveTenancyConflictException(
        "Tenant already has an active room membership",
      );
    }
  }

  private rethrowConflict(error: unknown) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      throw new ActiveTenancyConflictException();
    }
  }
}
