export type TenantStatus = "ACTIVE" | "LEFT" | "INACTIVE";
export type TenancyStatus = "DRAFT" | "ACTIVE" | "ENDED" | "CANCELLED";
export type BillingCycleType = "DAILY" | "WEEKLY" | "MONTHLY";
export type TenancyMemberRole = "REPRESENTATIVE" | "CO_TENANT";

export interface TenantCurrentTenancyRecord {
  tenancyId: string;
  roomId: string;
  roomCode: string | null;
  representativeTenantId: string;
  representativeName: string | null;
  role: TenancyMemberRole;
  startDate: string;
  joinedOn: string;
}

export interface TenantRecord {
  id: string;
  propertyId: string;
  fullName: string;
  phone: string | null;
  identityNumber: string | null;
  permanentAddress: string | null;
  emergencyContactName: string | null;
  emergencyContactPhone: string | null;
  notes: string | null;
  status: TenantStatus;
  currentTenancy: TenantCurrentTenancyRecord | null;
  createdAt: string;
  updatedAt: string;
}

export interface TenancyMemberRecord {
  tenantId: string;
  fullName: string;
  phone: string | null;
  role: TenancyMemberRole;
  joinedOn: string;
  leftOn: string | null;
}

export interface TenancyRecord {
  id: string;
  roomId: string;
  roomCode: string | null;
  representativeTenantId: string;
  representativeTenantName: string | null;
  status: TenancyStatus;
  startDate: string;
  actualEndDate: string | null;
  billingCycleType: BillingCycleType;
  billingCycleCount: number;
  billingAnchorDay: number | null;
  rentAmount: string;
  rentPaidUntil: string | null;
  depositAmount: string;
  notes: string | null;
  membershipRole: TenancyMemberRole | null;
  memberCount: number;
  members: TenancyMemberRecord[];
  createdAt: string;
  updatedAt: string;
}

export interface TenantListQuery {
  limit: number;
  cursor?: string;
  q?: string;
  status?: TenantStatus;
  roomId?: string;
}

export interface TenantCreateInput {
  propertyId?: string;
  fullName: string;
  phone?: string | null;
  identityNumber?: string | null;
  permanentAddress?: string | null;
  emergencyContactName?: string | null;
  emergencyContactPhone?: string | null;
  notes?: string | null;
  status?: TenantStatus;
}

export type TenantUpdateInput = Partial<TenantCreateInput>;

export interface TenancyCreateInput {
  roomId: string;
  representativeTenantId: string;
  startDate: string;
  billingCycleType?: BillingCycleType;
  billingCycleCount?: number;
  billingAnchorDay?: number | null;
  rentAmount?: string;
  depositAmount?: string;
  notes?: string | null;
}

export interface TenancyEndInput {
  actualEndDate: string;
  notes?: string | null;
}

export interface TenancyTransferInput {
  toRoomId: string;
  transferDate: string;
  notes?: string | null;
}

export interface TenancyMemberTransferInput {
  toRoomId: string;
  transferDate: string;
  notes?: string | null;
}

export interface TenancyMemberLeaveInput {
  leftOn: string;
  notes?: string | null;
}

export interface RepresentativeChangeInput {
  newRepresentativeTenantId: string;
  idempotencyKey: string;
  requestHash: string;
  actorUserId?: string;
}

export interface RepresentativeChangeRecord {
  tenancyId: string;
  previousRepresentative: { tenantId: string; fullName: string | null };
  newRepresentative: { tenantId: string; fullName: string | null };
  effectiveAt: string;
  replayed: boolean;
}

export interface TenantRepository {
  list(query: TenantListQuery): Promise<{
    data: TenantRecord[];
    page: { limit: number; nextCursor: string | null; hasMore: boolean };
  }>;
  findTenantById(id: string): Promise<TenantRecord | null>;
  createTenant(input: TenantCreateInput): Promise<TenantRecord>;
  updateTenant(
    id: string,
    input: TenantUpdateInput,
  ): Promise<TenantRecord | null>;
  retireTenant(id: string): Promise<TenantRecord | null>;
  createTenancy(input: TenancyCreateInput): Promise<TenancyRecord>;
  endTenancy(id: string, input: TenancyEndInput): Promise<TenancyRecord | null>;
  transferTenancy(
    id: string,
    input: TenancyTransferInput,
  ): Promise<TenancyRecord | null>;
  transferMember(
    tenancyId: string,
    tenantId: string,
    input: TenancyMemberTransferInput,
    actorUserId?: string,
  ): Promise<TenancyRecord | null>;
  leaveMember(
    tenancyId: string,
    tenantId: string,
    input: TenancyMemberLeaveInput,
    actorUserId?: string,
  ): Promise<TenancyRecord | null>;
  changeRepresentative(
    tenancyId: string,
    input: RepresentativeChangeInput,
  ): Promise<RepresentativeChangeRecord | null>;
  listTenancies(tenantId?: string): Promise<TenancyRecord[]>;
}
