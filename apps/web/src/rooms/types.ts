export type RoomStatus = "VACANT" | "OCCUPIED" | "MAINTENANCE" | "INACTIVE";
export type RoomOccupantRole = "REPRESENTATIVE" | "CO_TENANT";

export interface RoomOccupant {
  tenantId: string;
  fullName: string;
  phone: string | null;
  role: RoomOccupantRole;
  joinedOn: string;
}

export interface RoomOccupancy {
  tenancyId: string;
  representativeTenantId: string;
  representativeName: string;
  startedOn: string;
  memberCount: number;
  coTenantCount: number;
  occupants: RoomOccupant[];
}

export interface Room {
  id: string;
  code: string;
  name: string;
  roomType: string | null;
  status: RoomStatus;
  defaultRentAmount: string;
  defaultBillingCycleType: "DAILY" | "WEEKLY" | "MONTHLY";
  defaultBillingCycleCount: number;
  maxOccupants: number;
  depositAmount: string;
  notes: string | null;
  currentOccupancy: RoomOccupancy | null;
}

export interface RoomListResponse {
  data: Room[];
  page: {
    limit: number;
    nextCursor: string | null;
    hasMore: boolean;
  };
}
