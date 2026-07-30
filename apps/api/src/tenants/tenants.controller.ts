import {
  Body,
  Controller,
  Delete,
  Get,
  Inject,
  Param,
  Patch,
  Post,
  Query,
  Req,
} from "@nestjs/common";
import type { Request } from "express";
import { parseRequest } from "../platform/validation.js";
import { Roles, type AppRole } from "../security/roles.decorator.js";
import {
  ActiveTenancyConflictException,
  TenancyNotFoundException,
  TenantNotFoundException,
} from "./tenants.errors.js";
import {
  idParamSchema,
  memberParamSchema,
  tenancyCreateSchema,
  tenancyMemberLeaveSchema,
  tenancyMemberTransferSchema,
  representativeChangeSchema,
  tenantCreateSchema,
  tenantListQuerySchema,
  tenantUpdateSchema,
} from "./tenants.schemas.js";
import { TenantsService } from "./tenants.service.js";
import type { TenancyRecord, TenantRecord } from "./tenants.types.js";

interface RequestWithUser extends Request {
  user?: {
    id: string;
    role: AppRole;
  };
}

@Roles("OWNER", "MANAGER", "STAFF", "VIEWER")
@Controller()
export class TenantsController {
  constructor(
    @Inject(TenantsService) private readonly tenants: TenantsService,
  ) {}

  @Get("tenants")
  async list(@Query() query: unknown, @Req() request: RequestWithUser) {
    const result = await this.tenants.list(
      parseRequest(tenantListQuerySchema, query),
    );
    return request.user?.role === "VIEWER"
      ? { ...result, data: result.data.map(maskTenantForViewer) }
      : result;
  }

  @Get("tenants/:id")
  async detail(@Param() params: unknown, @Req() request: RequestWithUser) {
    const { id } = parseRequest(idParamSchema, params);
    const tenant = await this.tenants.findTenantById(id);
    if (!tenant) throw new TenantNotFoundException();
    const tenancies = await this.tenants.listTenancies(id);
    return request.user?.role === "VIEWER"
      ? {
          ...maskTenantForViewer(tenant),
          tenancies: tenancies.map(maskTenancyForViewer),
        }
      : { ...tenant, tenancies };
  }

  @Roles("OWNER", "MANAGER", "STAFF")
  @Post("tenants")
  createTenant(@Body() body: unknown, @Req() request: RequestWithUser) {
    return this.tenants.createTenant(
      parseRequest(tenantCreateSchema, body),
      request.user?.id,
    );
  }

  @Roles("OWNER", "MANAGER", "STAFF")
  @Patch("tenants/:id")
  async updateTenant(
    @Param() params: unknown,
    @Body() body: unknown,
    @Req() request: RequestWithUser,
  ) {
    const { id } = parseRequest(idParamSchema, params);
    const tenant = await this.tenants.updateTenant(
      id,
      parseRequest(tenantUpdateSchema, body),
      request.user?.id,
    );
    if (!tenant) throw new TenantNotFoundException();
    return tenant;
  }

  @Roles("OWNER", "MANAGER")
  @Delete("tenants/:id")
  async retireTenant(
    @Param() params: unknown,
    @Req() request: RequestWithUser,
  ) {
    const { id } = parseRequest(idParamSchema, params);
    const tenant = await this.tenants.retireTenant(id, request.user?.id);
    if (!tenant) throw new TenantNotFoundException();
    return tenant;
  }

  @Get("tenancies")
  listTenancies(@Query("tenantId") tenantId?: string) {
    return this.tenants.listTenancies(tenantId);
  }

  @Roles("OWNER", "MANAGER", "STAFF")
  @Post("tenancies")
  async createTenancy(@Body() body: unknown, @Req() request: RequestWithUser) {
    try {
      return await this.tenants.createTenancy(
        parseRequest(tenancyCreateSchema, body),
        request.user?.id,
      );
    } catch (error) {
      if (error instanceof TenantNotFoundException) throw error;
      if (error instanceof ActiveTenancyConflictException) throw error;
      throw error;
    }
  }

  @Roles("OWNER", "MANAGER", "STAFF")
  @Post("tenancies/:id/change-representative")
  async changeRepresentative(
    @Param() params: unknown,
    @Body() body: unknown,
    @Req() request: RequestWithUser,
  ) {
    const { id } = parseRequest(idParamSchema, params);
    const result = await this.tenants.changeRepresentative(
      id,
      parseRequest(representativeChangeSchema, body),
      request.user?.id,
    );
    if (!result) throw new TenancyNotFoundException();
    return result;
  }

  @Roles("OWNER", "MANAGER", "STAFF")
  @Post("tenancies/:id/members/:tenantId/transfer")
  async transferMember(
    @Param() params: unknown,
    @Body() body: unknown,
    @Req() request: RequestWithUser,
  ) {
    const { id, tenantId } = parseRequest(memberParamSchema, params);
    const tenancy = await this.tenants.transferMember(
      id,
      tenantId,
      parseRequest(tenancyMemberTransferSchema, body),
      request.user?.id,
    );
    if (!tenancy) throw new TenancyNotFoundException();
    return tenancy;
  }

  @Roles("OWNER", "MANAGER", "STAFF")
  @Patch("tenancies/:id/members/:tenantId/leave")
  async leaveMember(
    @Param() params: unknown,
    @Body() body: unknown,
    @Req() request: RequestWithUser,
  ) {
    const { id, tenantId } = parseRequest(memberParamSchema, params);
    const tenancy = await this.tenants.leaveMember(
      id,
      tenantId,
      parseRequest(tenancyMemberLeaveSchema, body),
      request.user?.id,
    );
    if (!tenancy) throw new TenancyNotFoundException();
    return tenancy;
  }
}

function maskTenantForViewer(tenant: TenantRecord): TenantRecord {
  return {
    ...tenant,
    phone: null,
    identityNumber: null,
    permanentAddress: null,
    emergencyContactName: null,
    emergencyContactPhone: null,
    notes: null,
  };
}

function maskTenancyForViewer(tenancy: TenancyRecord): TenancyRecord {
  return {
    ...tenancy,
    notes: null,
    members: tenancy.members.map((member) => ({ ...member, phone: null })),
  };
}
