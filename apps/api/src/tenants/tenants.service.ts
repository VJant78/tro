import { Inject, Injectable } from "@nestjs/common";
import { AuditService } from "../audit/audit.service.js";
import { TENANT_REPOSITORY } from "./tenants.tokens.js";
import type {
  TenancyCreateInput,
  TenancyEndInput,
  TenancyMemberLeaveInput,
  TenancyMemberTransferInput,
  TenancyTransferInput,
  TenantCreateInput,
  TenantListQuery,
  TenantRepository,
  TenantUpdateInput,
} from "./tenants.types.js";

@Injectable()
export class TenantsService {
  constructor(
    @Inject(TENANT_REPOSITORY) private readonly tenants: TenantRepository,
    @Inject(AuditService) private readonly audit: AuditService,
  ) {}

  list(query: TenantListQuery) {
    return this.tenants.list(query);
  }

  findTenantById(id: string) {
    return this.tenants.findTenantById(id);
  }

  listTenancies(tenantId?: string) {
    return this.tenants.listTenancies(tenantId);
  }

  async createTenant(input: TenantCreateInput, actorUserId?: string) {
    const tenant = await this.tenants.createTenant(input);
    await this.audit.record({
      action: "CREATE",
      entityType: "tenant",
      entityId: tenant.id,
      actorUserId,
      newValues: tenant,
    });
    return tenant;
  }

  async updateTenant(
    id: string,
    input: TenantUpdateInput,
    actorUserId?: string,
  ) {
    const before = await this.tenants.findTenantById(id);
    const tenant = await this.tenants.updateTenant(id, input);
    if (!tenant) return null;
    await this.audit.record({
      action: "UPDATE",
      entityType: "tenant",
      entityId: tenant.id,
      actorUserId,
      oldValues: before ?? undefined,
      newValues: tenant,
    });
    return tenant;
  }

  async retireTenant(id: string, actorUserId?: string) {
    const before = await this.tenants.findTenantById(id);
    const tenant = await this.tenants.retireTenant(id);
    if (!tenant) return null;
    await this.audit.record({
      action: "DELETE",
      entityType: "tenant",
      entityId: tenant.id,
      actorUserId,
      oldValues: before ?? undefined,
      newValues: tenant,
      metadata: { mode: "soft-delete-retire" },
    });
    return tenant;
  }

  async createTenancy(input: TenancyCreateInput, actorUserId?: string) {
    const tenancy = await this.tenants.createTenancy(input);
    await this.audit.record({
      action: "CREATE",
      entityType: "tenancy",
      entityId: tenancy.id,
      actorUserId,
      newValues: tenancy,
    });
    return tenancy;
  }

  async endTenancy(id: string, input: TenancyEndInput, actorUserId?: string) {
    const tenancy = await this.tenants.endTenancy(id, input);
    if (!tenancy) return null;
    await this.audit.record({
      action: "STATUS_CHANGE",
      entityType: "tenancy",
      entityId: tenancy.id,
      actorUserId,
      newValues: tenancy,
      metadata: { status: "ENDED" },
    });
    return tenancy;
  }

  async transferTenancy(
    id: string,
    input: TenancyTransferInput,
    actorUserId?: string,
  ) {
    const tenancy = await this.tenants.transferTenancy(id, input);
    if (!tenancy) return null;
    await this.audit.record({
      action: "STATUS_CHANGE",
      entityType: "tenancy",
      entityId: tenancy.id,
      actorUserId,
      newValues: tenancy,
      metadata: { status: "TRANSFERRED", fromTenancyId: id },
    });
    return tenancy;
  }

  async transferMember(
    tenancyId: string,
    tenantId: string,
    input: TenancyMemberTransferInput,
    actorUserId?: string,
  ) {
    const tenancy = await this.tenants.transferMember(
      tenancyId,
      tenantId,
      input,
    );
    if (!tenancy) return null;
    await this.audit.record({
      action: "STATUS_CHANGE",
      entityType: "tenancy_member",
      entityId: tenantId,
      actorUserId,
      newValues: tenancy,
      metadata: {
        status: "TRANSFER_MEMBER",
        fromTenancyId: tenancyId,
        toTenancyId: tenancy.id,
      },
    });
    return tenancy;
  }

  async leaveMember(
    tenancyId: string,
    tenantId: string,
    input: TenancyMemberLeaveInput,
    actorUserId?: string,
  ) {
    const tenancy = await this.tenants.leaveMember(tenancyId, tenantId, input);
    if (!tenancy) return null;
    await this.audit.record({
      action: "STATUS_CHANGE",
      entityType: "tenancy_member",
      entityId: tenantId,
      actorUserId,
      newValues: tenancy,
      metadata: {
        status: "LEAVE_MEMBER",
        tenancyId,
      },
    });
    return tenancy;
  }
}
