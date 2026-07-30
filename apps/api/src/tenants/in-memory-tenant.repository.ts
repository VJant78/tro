import { randomUUID } from "node:crypto";
import { Inject, Injectable } from "@nestjs/common";
import { AuditService } from "../audit/audit.service.js";
import { authorizedPropertyId } from "../platform/property-scope.js";
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

type StoredTenant = TenantRecord & { deletedAt: string | null };
type StoredTenancy = TenancyRecord & { deletedAt: string | null };
type StoredTenancyMember = {
  tenancyId: string;
  tenantId: string;
  joinedOn: string;
  leftOn: string | null;
  isRepresentative: boolean;
  role: "REPRESENTATIVE" | "CO_TENANT";
  deletedAt: string | null;
};

@Injectable()
export class InMemoryTenantRepository implements TenantRepository {
  private readonly tenants: StoredTenant[] = [];
  private readonly tenancies: StoredTenancy[] = [];
  private readonly memberships: StoredTenancyMember[] = [];
  private readonly representativeChanges = new Map<
    string,
    RepresentativeChangeRecord & { requestHash: string }
  >();

  constructor(@Inject(AuditService) private readonly audit: AuditService) {}

  async list(query: TenantListQuery) {
    const q = query.q?.toUpperCase();
    const filtered = this.tenants
      .filter((tenant) => !tenant.deletedAt)
      .filter((tenant) => !query.status || tenant.status === query.status)
      .filter(
        (tenant) =>
          !query.roomId ||
          this.activeMembershipForTenant(tenant.id)?.roomId === query.roomId,
      )
      .filter(
        (tenant) =>
          !q ||
          tenant.fullName.toUpperCase().includes(q) ||
          tenant.phone?.toUpperCase().includes(q) ||
          tenant.identityNumber?.toUpperCase().includes(q),
      )
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt));

    const start = query.cursor
      ? Math.max(
          0,
          filtered.findIndex((tenant) => tenant.id === query.cursor) + 1,
        )
      : 0;
    const page = filtered.slice(start, start + query.limit + 1);
    const data = page
      .slice(0, query.limit)
      .map((tenant) => this.withCurrentTenancy(stripTenantDeletedAt(tenant)));

    return {
      data,
      page: {
        limit: query.limit,
        nextCursor:
          page.length > query.limit ? (data.at(-1)?.id ?? null) : null,
        hasMore: page.length > query.limit,
      },
    };
  }

  async findTenantById(id: string) {
    const tenant = this.tenants.find(
      (item) => item.id === id && !item.deletedAt,
    );
    return tenant
      ? this.withCurrentTenancy(stripTenantDeletedAt(tenant))
      : null;
  }

  async createTenant(input: TenantCreateInput) {
    const now = new Date().toISOString();
    const tenant: StoredTenant = {
      id: randomUUID(),
      propertyId: input.propertyId ?? authorizedPropertyId(),
      fullName: input.fullName,
      phone: input.phone ?? null,
      identityNumber: input.identityNumber ?? null,
      permanentAddress: input.permanentAddress ?? null,
      emergencyContactName: input.emergencyContactName ?? null,
      emergencyContactPhone: input.emergencyContactPhone ?? null,
      notes: input.notes ?? null,
      status: input.status ?? "ACTIVE",
      currentTenancy: null,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    };
    this.tenants.push(tenant);
    return stripTenantDeletedAt(tenant);
  }

  async updateTenant(id: string, input: TenantUpdateInput) {
    const tenant = this.tenants.find(
      (item) => item.id === id && !item.deletedAt,
    );
    if (!tenant) return null;
    Object.assign(tenant, { ...input, updatedAt: new Date().toISOString() });
    return this.withCurrentTenancy(stripTenantDeletedAt(tenant));
  }

  async retireTenant(id: string) {
    const tenant = this.tenants.find(
      (item) => item.id === id && !item.deletedAt,
    );
    if (!tenant) return null;
    tenant.status = "INACTIVE";
    tenant.deletedAt = new Date().toISOString();
    tenant.updatedAt = tenant.deletedAt;
    return this.withCurrentTenancy(stripTenantDeletedAt(tenant));
  }

  async createTenancy(input: TenancyCreateInput) {
    this.assertTenantExists(input.representativeTenantId);
    this.assertTenantHasNoActiveMembership(input.representativeTenantId);

    const activeRoomTenancy = this.tenancies.find(
      (tenancy) =>
        tenancy.roomId === input.roomId &&
        tenancy.status === "ACTIVE" &&
        !tenancy.deletedAt,
    );

    if (activeRoomTenancy) {
      const currentMembers = this.activeMembers(activeRoomTenancy.id);
      if (currentMembers.length >= 99) {
        throw new ActiveTenancyConflictException(
          "Room is at maximum occupancy",
        );
      }
      this.memberships.push({
        tenancyId: activeRoomTenancy.id,
        tenantId: input.representativeTenantId,
        joinedOn: input.startDate,
        leftOn: null,
        isRepresentative: false,
        role: "CO_TENANT",
        deletedAt: null,
      });
      activeRoomTenancy.memberCount = currentMembers.length + 1;
      activeRoomTenancy.members = this.membersForTenancy(activeRoomTenancy);
      return stripTenancyDeletedAt(activeRoomTenancy);
    }

    const now = new Date().toISOString();
    const tenancy: StoredTenancy = {
      id: randomUUID(),
      roomId: input.roomId,
      roomCode: null,
      representativeTenantId: input.representativeTenantId,
      representativeTenantName:
        this.tenants.find(
          (tenant) => tenant.id === input.representativeTenantId,
        )?.fullName ?? null,
      status: "ACTIVE",
      startDate: input.startDate,
      actualEndDate: null,
      billingCycleType: input.billingCycleType ?? "MONTHLY",
      billingCycleCount: input.billingCycleCount ?? 1,
      billingAnchorDay: input.billingAnchorDay ?? null,
      rentAmount: input.rentAmount ?? "0",
      rentPaidUntil: null,
      depositAmount: input.depositAmount ?? "0",
      notes: input.notes ?? null,
      membershipRole: "REPRESENTATIVE",
      memberCount: 1,
      members: [],
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    };
    this.tenancies.push(tenancy);
    this.memberships.push({
      tenancyId: tenancy.id,
      tenantId: input.representativeTenantId,
      joinedOn: input.startDate,
      leftOn: null,
      isRepresentative: true,
      role: "REPRESENTATIVE",
      deletedAt: null,
    });
    tenancy.members = this.membersForTenancy(tenancy);
    return stripTenancyDeletedAt(tenancy);
  }

  async endTenancy(id: string, input: TenancyEndInput) {
    const tenancy = this.tenancies.find(
      (item) => item.id === id && !item.deletedAt,
    );
    if (!tenancy) return null;
    tenancy.status = "ENDED";
    tenancy.actualEndDate = input.actualEndDate;
    tenancy.notes = input.notes ?? tenancy.notes;
    tenancy.updatedAt = new Date().toISOString();
    this.memberships
      .filter(
        (membership) =>
          membership.tenancyId === id &&
          membership.leftOn === null &&
          !membership.deletedAt,
      )
      .forEach((membership) => {
        membership.leftOn = input.actualEndDate;
      });
    tenancy.members = this.membersForTenancy(tenancy);
    return stripTenancyDeletedAt(tenancy);
  }

  async transferTenancy(id: string, input: TenancyTransferInput) {
    const tenancy = this.tenancies.find(
      (item) => item.id === id && item.status === "ACTIVE" && !item.deletedAt,
    );
    if (!tenancy) return null;
    const activeTargetRoom = this.tenancies.find(
      (item) =>
        item.roomId === input.toRoomId &&
        item.status === "ACTIVE" &&
        item.id !== id &&
        !item.deletedAt,
    );
    if (activeTargetRoom) {
      throw new ActiveTenancyConflictException(
        "Target room already has an active tenancy",
      );
    }
    const movingMembers = this.activeMembers(id);
    tenancy.status = "ENDED";
    tenancy.actualEndDate = input.transferDate;
    tenancy.updatedAt = new Date().toISOString();
    movingMembers.forEach((membership) => {
      membership.leftOn = input.transferDate;
    });
    const newTenancy = await this.createTenancy({
      roomId: input.toRoomId,
      representativeTenantId: tenancy.representativeTenantId,
      startDate: input.transferDate,
      billingCycleType: tenancy.billingCycleType,
      billingCycleCount: tenancy.billingCycleCount,
      billingAnchorDay: tenancy.billingAnchorDay,
      rentAmount: tenancy.rentAmount,
      depositAmount: tenancy.depositAmount,
      notes: input.notes,
    });
    movingMembers
      .filter((membership) => !membership.isRepresentative)
      .forEach((membership) => {
        this.memberships.push({
          tenancyId: newTenancy.id,
          tenantId: membership.tenantId,
          joinedOn: input.transferDate,
          leftOn: null,
          isRepresentative: false,
          role: "CO_TENANT",
          deletedAt: null,
        });
      });
    const stored = this.tenancies.find((item) => item.id === newTenancy.id);
    if (stored) {
      stored.memberCount = this.activeMembers(stored.id).length;
      stored.members = this.membersForTenancy(stored);
      return stripTenancyDeletedAt(stored);
    }
    return newTenancy;
  }

  async transferMember(
    tenancyId: string,
    tenantId: string,
    input: TenancyMemberTransferInput,
  ) {
    const tenancy = this.tenancies.find(
      (item) =>
        item.id === tenancyId && item.status === "ACTIVE" && !item.deletedAt,
    );
    if (!tenancy) return null;
    if (tenancy.roomId === input.toRoomId) {
      throw new ActiveTenancyConflictException(
        "Target room must be different from current room",
      );
    }

    const activeMembers = this.activeMembers(tenancyId);
    const movingMember = activeMembers.find(
      (membership) => membership.tenantId === tenantId,
    );
    if (!movingMember) return null;
    if (movingMember.isRepresentative)
      throw new OldRoomSettlementRequiredException();

    const targetTenancy = this.tenancies.find(
      (item) =>
        item.roomId === input.toRoomId &&
        item.status === "ACTIVE" &&
        !item.deletedAt,
    );

    movingMember.leftOn = input.transferDate;
    if (activeMembers.length === 1) {
      tenancy.status = "ENDED";
      tenancy.actualEndDate = input.transferDate;
      tenancy.notes = input.notes ?? tenancy.notes;
      tenancy.updatedAt = new Date().toISOString();
    }

    if (targetTenancy) {
      this.memberships.push({
        tenancyId: targetTenancy.id,
        tenantId,
        joinedOn: input.transferDate,
        leftOn: null,
        isRepresentative: false,
        role: "CO_TENANT",
        deletedAt: null,
      });
      targetTenancy.memberCount = this.activeMembers(targetTenancy.id).length;
      targetTenancy.members = this.membersForTenancy(targetTenancy);
      return stripTenancyDeletedAt({
        ...targetTenancy,
        membershipRole: "CO_TENANT",
      });
    }

    return this.createTenancy({
      roomId: input.toRoomId,
      representativeTenantId: tenantId,
      startDate: input.transferDate,
      notes: input.notes,
    });
  }

  async leaveMember(
    tenancyId: string,
    tenantId: string,
    input: TenancyMemberLeaveInput,
  ) {
    const tenancy = this.tenancies.find(
      (item) =>
        item.id === tenancyId && item.status === "ACTIVE" && !item.deletedAt,
    );
    if (!tenancy) return null;

    const activeMembers = this.activeMembers(tenancyId);
    const leavingMember = activeMembers.find(
      (membership) => membership.tenantId === tenantId,
    );
    if (!leavingMember) return null;
    if (leavingMember.isRepresentative)
      throw new OldRoomSettlementRequiredException();

    leavingMember.leftOn = input.leftOn;
    if (activeMembers.length === 1) {
      tenancy.status = "ENDED";
      tenancy.actualEndDate = input.leftOn;
      tenancy.notes = input.notes ?? tenancy.notes;
    }
    tenancy.updatedAt = new Date().toISOString();
    tenancy.memberCount = this.activeMembers(tenancyId).length;
    tenancy.members = this.membersForTenancy(tenancy);
    return stripTenancyDeletedAt({
      ...tenancy,
      membershipRole: leavingMember.role,
    });
  }

  async listTenancies(tenantId?: string) {
    return this.tenancies
      .filter((tenancy) => !tenancy.deletedAt)
      .filter(
        (tenancy) =>
          !tenantId ||
          this.memberships.some(
            (membership) =>
              membership.tenancyId === tenancy.id &&
              membership.tenantId === tenantId &&
              !membership.deletedAt,
          ),
      )
      .map((tenancy) =>
        stripTenancyDeletedAt({
          ...tenancy,
          membershipRole: tenantId
            ? (this.membersForTenancy(tenancy).find(
                (member) => member.tenantId === tenantId,
              )?.role ?? null)
            : null,
          memberCount: this.activeMembers(tenancy.id).length,
          members: this.membersForTenancy(tenancy),
        }),
      );
  }

  async changeRepresentative(
    tenancyId: string,
    input: RepresentativeChangeInput,
  ): Promise<RepresentativeChangeRecord | null> {
    const key = `${tenancyId}:${input.idempotencyKey}`;
    const replay = this.representativeChanges.get(key);
    if (replay) {
      if (replay.requestHash !== input.requestHash) {
        throw new IdempotencyKeyReusedException();
      }
      return {
        tenancyId: replay.tenancyId,
        previousRepresentative: replay.previousRepresentative,
        newRepresentative: replay.newRepresentative,
        effectiveAt: replay.effectiveAt,
        replayed: true,
      };
    }
    const tenancy = this.tenancies.find(
      (item) =>
        item.id === tenancyId && item.status === "ACTIVE" && !item.deletedAt,
    );
    if (!tenancy) return null;
    const members = this.activeMembers(tenancyId);
    const previous = members.find(
      (member) => member.tenantId === tenancy.representativeTenantId,
    );
    const next = members.find(
      (member) =>
        member.tenantId === input.newRepresentativeTenantId &&
        !member.isRepresentative,
    );
    if (!previous || !next) {
      throw new RepresentativeNotActiveCotenantException();
    }
    previous.isRepresentative = false;
    previous.role = "CO_TENANT";
    next.isRepresentative = true;
    next.role = "REPRESENTATIVE";
    const oldTenantId = tenancy.representativeTenantId;
    tenancy.representativeTenantId = next.tenantId;
    tenancy.representativeTenantName =
      this.tenants.find((tenant) => tenant.id === next.tenantId)?.fullName ??
      null;
    tenancy.members = this.membersForTenancy(tenancy);
    tenancy.updatedAt = new Date().toISOString();
    const record: RepresentativeChangeRecord & { requestHash: string } = {
      tenancyId,
      previousRepresentative: {
        tenantId: oldTenantId,
        fullName:
          this.tenants.find((tenant) => tenant.id === oldTenantId)?.fullName ??
          null,
      },
      newRepresentative: {
        tenantId: next.tenantId,
        fullName: tenancy.representativeTenantName,
      },
      effectiveAt: new Date().toISOString(),
      replayed: false,
      requestHash: input.requestHash,
    };
    this.representativeChanges.set(key, record);
    await this.audit.record({
      action: "STATUS_CHANGE",
      entityType: "tenancy_representative",
      entityId: tenancyId,
      actorUserId: input.actorUserId,
      oldValues: { representativeTenantId: oldTenantId },
      newValues: { representativeTenantId: next.tenantId },
      metadata: { status: "REPRESENTATIVE_CHANGED" },
    });
    return record;
  }

  private assertTenantExists(tenantId: string) {
    const tenant = this.tenants.find(
      (item) => item.id === tenantId && !item.deletedAt,
    );
    if (!tenant) throw new TenantNotFoundException();
  }

  private assertTenantHasNoActiveMembership(tenantId: string) {
    const activeTenant = this.activeMembershipForTenant(tenantId);
    if (activeTenant) {
      throw new ActiveTenancyConflictException(
        "Tenant already has an active room membership",
      );
    }
  }

  private activeMembershipForTenant(tenantId: string) {
    const membership = this.memberships.find(
      (item) =>
        item.tenantId === tenantId && item.leftOn === null && !item.deletedAt,
    );
    const tenancy = membership
      ? this.tenancies.find(
          (item) =>
            item.id === membership.tenancyId &&
            item.status === "ACTIVE" &&
            !item.deletedAt,
        )
      : null;
    return membership && tenancy
      ? { ...membership, roomId: tenancy.roomId, tenancy }
      : null;
  }

  private activeMembers(tenancyId: string) {
    return this.memberships.filter(
      (membership) =>
        membership.tenancyId === tenancyId &&
        membership.leftOn === null &&
        !membership.deletedAt,
    );
  }

  private membersForTenancy(tenancy: TenancyRecord) {
    return this.memberships
      .filter(
        (membership) =>
          membership.tenancyId === tenancy.id && !membership.deletedAt,
      )
      .map((membership) => {
        const tenant = this.tenants.find(
          (item) => item.id === membership.tenantId,
        );
        return {
          tenantId: membership.tenantId,
          fullName: tenant?.fullName ?? "Unknown",
          phone: tenant?.phone ?? null,
          role: membership.role,
          joinedOn: membership.joinedOn,
          leftOn: membership.leftOn,
        };
      })
      .sort((left, right) =>
        left.role === right.role ? 0 : left.role === "REPRESENTATIVE" ? -1 : 1,
      );
  }

  private withCurrentTenancy(tenant: TenantRecord): TenantRecord {
    const membership = this.activeMembershipForTenant(tenant.id);
    return {
      ...tenant,
      currentTenancy: membership
        ? {
            tenancyId: membership.tenancyId,
            roomId: membership.roomId,
            roomCode: membership.tenancy.roomCode,
            representativeTenantId: membership.tenancy.representativeTenantId,
            representativeName: membership.tenancy.representativeTenantName,
            role: membership.role,
            startDate: membership.tenancy.startDate,
            joinedOn: membership.joinedOn,
          }
        : null,
    };
  }
}

function stripTenantDeletedAt(tenant: StoredTenant): TenantRecord {
  const { deletedAt: _deletedAt, ...record } = tenant;
  return record;
}

function stripTenancyDeletedAt(tenancy: StoredTenancy): TenancyRecord {
  const { deletedAt: _deletedAt, ...record } = tenancy;
  return record;
}
