import type { Room } from "../rooms/types";

export type TenantStatus = "ACTIVE" | "LEFT" | "INACTIVE";
export type TenancyStatus = "DRAFT" | "ACTIVE" | "ENDED" | "CANCELLED";
export type TenancyMemberRole = "REPRESENTATIVE" | "CO_TENANT";

export interface TenantCurrentTenancy {
  tenancyId: string;
  roomId: string;
  roomCode: string | null;
  representativeTenantId: string;
  representativeName: string | null;
  role: TenancyMemberRole;
  startDate: string;
  joinedOn: string;
}

export interface TenancyMember {
  tenantId: string;
  fullName: string;
  phone: string | null;
  role: TenancyMemberRole;
  joinedOn: string;
  leftOn: string | null;
}

export interface Tenancy {
  id: string;
  roomId: string;
  roomCode: string | null;
  representativeTenantId: string;
  representativeTenantName: string | null;
  status: TenancyStatus;
  startDate: string;
  actualEndDate: string | null;
  rentAmount: string;
  depositAmount: string;
  notes: string | null;
  membershipRole: TenancyMemberRole | null;
  memberCount: number;
  members: TenancyMember[];
}

export interface Tenant {
  id: string;
  fullName: string;
  phone: string | null;
  identityNumber: string | null;
  permanentAddress: string | null;
  emergencyContactName: string | null;
  emergencyContactPhone: string | null;
  notes: string | null;
  status: TenantStatus;
  currentTenancy: TenantCurrentTenancy | null;
  tenancies?: Tenancy[];
}

export interface TenantListResponse {
  data: Tenant[];
  page: {
    limit: number;
    nextCursor: string | null;
    hasMore: boolean;
  };
}

export interface RoomListResponse {
  data: Room[];
}
