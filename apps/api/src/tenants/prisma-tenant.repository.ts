import { Inject, Injectable } from "@nestjs/common";
import {
  Prisma,
  type Room,
  type Tenant,
  type Tenancy,
  type TenancyMember,
} from "@prisma/client";
import { PrismaService } from "../database/prisma.service.js";
import { AuditService } from "../audit/audit.service.js";
import { authorizedPropertyId } from "../platform/property-scope.js";
import { RoomNotFoundException } from "../rooms/rooms.errors.js";
import {
  ActiveTenancyConflictException,
  IdempotencyKeyReusedException,
  OldRoomSettlementRequiredException,
  RepresentativeNotActiveCotenantException,
  TenantNotFoundException,
} from "./tenants.errors.js";
import type {
  TenancyCreateInput,
  TenancyEndInput,
  TenancyMemberLeaveInput,
  TenancyMemberTransferInput,
  TenancyRecord,
  TenancyTransferInput,
  RepresentativeChangeInput,
  RepresentativeChangeRecord,
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
    propertyId: tenant.propertyId,
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
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AuditService) private readonly audit: AuditService,
  ) {}

  async list(query: TenantListQuery) {
    const where: Prisma.TenantWhereInput = {
      propertyId: authorizedPropertyId(),
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
      where: { id, propertyId: authorizedPropertyId(), deletedAt: null },
      include: activeMembershipInclude,
    });
    return tenant ? mapTenant(tenant) : null;
  }

  async createTenant(input: TenantCreateInput) {
    return mapTenant(
      await this.prisma.tenant.create({
        data: {
          ...input,
          propertyId: input.propertyId ?? authorizedPropertyId(),
        },
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
          where: {
            id: input.representativeTenantId,
            propertyId: authorizedPropertyId(),
            deletedAt: null,
          },
          select: { id: true },
        });
        if (!tenant) throw new TenantNotFoundException();

        const room = await tx.room.findFirst({
          where: {
            id: input.roomId,
            propertyId: authorizedPropertyId(),
            deletedAt: null,
          },
          select: {
            id: true,
            defaultRentAmount: true,
            defaultBillingCycleType: true,
            defaultBillingCycleCount: true,
            depositAmount: true,
            maxOccupants: true,
            status: true,
          },
        });
        if (!room) throw new RoomNotFoundException();
        if (room.status === "MAINTENANCE" || room.status === "INACTIVE") {
          throw new ActiveTenancyConflictException(
            "Room is not available for occupancy",
          );
        }

        const reserved = await tx.tenancyOperation.findFirst({
          where: {
            targetRoomId: input.roomId,
            operationType: "WHOLE_GROUP_TRANSFER",
            status: {
              in: ["IN_PROGRESS", "INVOICE_PENDING", "ACTION_REQUIRED"],
            },
          },
          select: { id: true },
        });
        if (reserved) {
          throw new ActiveTenancyConflictException(
            "Target room is reserved by a pending transfer",
          );
        }

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
      where: {
        id,
        deletedAt: null,
        room: { propertyId: authorizedPropertyId() },
      },
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
      return tx.tenancy.findUniqueOrThrow({
        where: { id: ended.id },
        include: tenancyRelationInclude,
      });
    });

    return mapTenancy(tenancy);
  }

  async transferTenancy(id: string, input: TenancyTransferInput) {
    const existing = await this.prisma.tenancy.findFirst({
      where: {
        id,
        deletedAt: null,
        status: "ACTIVE",
        room: { propertyId: authorizedPropertyId() },
      },
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
      where: {
        id: input.toRoomId,
        propertyId: authorizedPropertyId(),
        deletedAt: null,
      },
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
    actorUserId?: string,
  ) {
    const existing = await this.prisma.tenancy.findFirst({
      where: {
        id: tenancyId,
        deletedAt: null,
        status: "ACTIVE",
        room: { propertyId: authorizedPropertyId() },
      },
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
    if (isRepresentative) throw new OldRoomSettlementRequiredException();

    const targetRoom = await this.prisma.room.findFirst({
      where: {
        id: input.toRoomId,
        propertyId: authorizedPropertyId(),
        deletedAt: null,
      },
      select: {
        id: true,
        defaultRentAmount: true,
        defaultBillingCycleType: true,
        defaultBillingCycleCount: true,
        depositAmount: true,
        maxOccupants: true,
        status: true,
      },
    });
    if (!targetRoom) throw new RoomNotFoundException();
    if (
      targetRoom.status === "MAINTENANCE" ||
      targetRoom.status === "INACTIVE"
    ) {
      throw new ActiveTenancyConflictException("Target room is unavailable");
    }
    const pendingReservation = await this.prisma.tenancyOperation.findFirst({
      where: {
        targetRoomId: input.toRoomId,
        operationType: "WHOLE_GROUP_TRANSFER",
        status: { in: ["IN_PROGRESS", "INVOICE_PENDING", "ACTION_REQUIRED"] },
      },
      select: { id: true },
    });
    if (pendingReservation) {
      throw new ActiveTenancyConflictException(
        "Target room is reserved by a pending transfer",
      );
    }

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
        await this.audit.record(
          {
            action: "STATUS_CHANGE",
            entityType: "tenancy_member",
            entityId: tenantId,
            actorUserId,
            newValues: {
              status: "TRANSFERRED",
              fromTenancyId: tenancyId,
              toTenancyId: targetTenancy.id,
              effectiveOn: input.transferDate,
            },
          },
          tx,
        );
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
      await tx.roomHandoverRecord.create({
        data: {
          roomId: input.toRoomId,
          tenancyId: created.id,
          handoverType: "TRANSFER_MEMBER",
          handoverAt: asDate(input.transferDate),
          notes: input.notes,
        },
      });
      await this.audit.record(
        {
          action: "STATUS_CHANGE",
          entityType: "tenancy_member",
          entityId: tenantId,
          actorUserId,
          newValues: {
            status: "TRANSFERRED",
            fromTenancyId: tenancyId,
            toTenancyId: created.id,
            effectiveOn: input.transferDate,
          },
        },
        tx,
      );
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
    actorUserId?: string,
  ) {
    const existing = await this.prisma.tenancy.findFirst({
      where: {
        id: tenancyId,
        deletedAt: null,
        status: "ACTIVE",
        room: { propertyId: authorizedPropertyId() },
      },
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
    if (isRepresentative) throw new OldRoomSettlementRequiredException();

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
      }

      await this.audit.record(
        {
          action: "STATUS_CHANGE",
          entityType: "tenancy_member",
          entityId: tenantId,
          actorUserId,
          newValues: {
            status: "LEFT",
            tenancyId,
            effectiveOn: input.leftOn,
          },
        },
        tx,
      );

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
        room: { propertyId: authorizedPropertyId() },
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

  async changeRepresentative(
    tenancyId: string,
    input: RepresentativeChangeInput,
  ): Promise<RepresentativeChangeRecord | null> {
    return this.prisma.$transaction(async (tx) => {
      const replay = await tx.tenancyRepresentativeChange.findFirst({
        where: {
          tenancyId,
          idempotencyKey: input.idempotencyKey,
          tenancy: { room: { propertyId: authorizedPropertyId() } },
        },
        include: {
          previousRepresentative: { select: { fullName: true } },
          newRepresentative: { select: { fullName: true } },
        },
      });
      if (replay) {
        if (replay.requestHash !== input.requestHash) {
          throw new IdempotencyKeyReusedException();
        }
        return {
          tenancyId,
          previousRepresentative: {
            tenantId: replay.previousRepresentativeTenantId,
            fullName: replay.previousRepresentative.fullName,
          },
          newRepresentative: {
            tenantId: replay.newRepresentativeTenantId,
            fullName: replay.newRepresentative.fullName,
          },
          effectiveAt: replay.changedAt.toISOString(),
          replayed: true,
        };
      }

      const tenancy = await tx.tenancy.findFirst({
        where: {
          id: tenancyId,
          status: "ACTIVE",
          deletedAt: null,
          room: { propertyId: authorizedPropertyId() },
        },
        include: {
          representativeTenant: { select: { fullName: true } },
          members: {
            where: { leftOn: null, deletedAt: null },
            include: { tenant: { select: { fullName: true } } },
          },
        },
      });
      if (!tenancy) return null;
      const next = tenancy.members.find(
        (member) =>
          member.tenantId === input.newRepresentativeTenantId &&
          member.tenantId !== tenancy.representativeTenantId &&
          !member.isRepresentative,
      );
      const previous = tenancy.members.find(
        (member) => member.tenantId === tenancy.representativeTenantId,
      );
      if (!next || !previous) {
        throw new RepresentativeNotActiveCotenantException();
      }

      await tx.tenancyMember.update({
        where: { id: previous.id },
        data: { isRepresentative: false, role: "CO_TENANT" },
      });
      await tx.tenancyMember.update({
        where: { id: next.id },
        data: { isRepresentative: true, role: "REPRESENTATIVE" },
      });
      await tx.tenancy.update({
        where: { id: tenancyId },
        data: { representativeTenantId: next.tenantId },
      });
      const changedAt = new Date();
      await tx.tenancyRepresentativeChange.create({
        data: {
          tenancyId,
          previousRepresentativeTenantId: previous.tenantId,
          newRepresentativeTenantId: next.tenantId,
          changedAt,
          idempotencyKey: input.idempotencyKey,
          requestHash: input.requestHash,
        },
      });
      await this.audit.record(
        {
          action: "STATUS_CHANGE",
          entityType: "tenancy_representative",
          entityId: tenancyId,
          actorUserId: input.actorUserId,
          oldValues: { representativeTenantId: previous.tenantId },
          newValues: { representativeTenantId: next.tenantId },
          metadata: { status: "REPRESENTATIVE_CHANGED" },
        },
        tx,
      );
      return {
        tenancyId,
        previousRepresentative: {
          tenantId: previous.tenantId,
          fullName: tenancy.representativeTenant.fullName,
        },
        newRepresentative: {
          tenantId: next.tenantId,
          fullName: next.tenant.fullName,
        },
        effectiveAt: changedAt.toISOString(),
        replayed: false,
      };
    });
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
          room: { propertyId: authorizedPropertyId() },
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
