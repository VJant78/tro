export type RoomStatus = "VACANT" | "OCCUPIED" | "MAINTENANCE" | "INACTIVE";
export type BillingCycleType = "DAILY" | "WEEKLY" | "MONTHLY";
export type RoomOccupantRole = "REPRESENTATIVE" | "CO_TENANT";

export interface RoomOccupantRecord {
  tenantId: string;
  fullName: string;
  phone: string | null;
  role: RoomOccupantRole;
  joinedOn: string;
}

export interface RoomOccupancyRecord {
  tenancyId: string;
  representativeTenantId: string;
  representativeName: string;
  startedOn: string;
  memberCount: number;
  coTenantCount: number;
  occupants: RoomOccupantRecord[];
}

export interface RoomRecord {
  id: string;
  propertyId: string;
  roomGroupId: string | null;
  code: string;
  name: string;
  roomType: string | null;
  status: RoomStatus;
  defaultRentAmount: string;
  defaultBillingCycleType: BillingCycleType;
  defaultBillingCycleCount: number;
  maxOccupants: number;
  rentPaidUntil: string | null;
  depositAmount: string;
  notes: string | null;
  currentOccupancy: RoomOccupancyRecord | null;
  createdAt: string;
  updatedAt: string;
}

export interface RoomListQuery {
  limit: number;
  cursor?: string;
  q?: string;
  status?: RoomStatus;
  groupId?: string;
  sort: "createdAt:desc" | "createdAt:asc" | "code:asc" | "code:desc";
}

export interface RoomCreateInput {
  propertyId: string;
  roomGroupId?: string | null;
  code: string;
  name: string;
  roomType?: string | null;
  status?: RoomStatus;
  defaultRentAmount?: string;
  defaultBillingCycleType?: BillingCycleType;
  defaultBillingCycleCount?: number;
  maxOccupants?: number;
  depositAmount?: string;
  notes?: string | null;
}

export type RoomUpdateInput = Partial<Omit<RoomCreateInput, "propertyId">>;

export interface RoomRepository {
  list(query: RoomListQuery): Promise<{
    data: RoomRecord[];
    page: { limit: number; nextCursor: string | null; hasMore: boolean };
  }>;
  findById(id: string): Promise<RoomRecord | null>;
  create(input: RoomCreateInput): Promise<RoomRecord>;
  update(id: string, input: RoomUpdateInput): Promise<RoomRecord | null>;
  retire(id: string): Promise<RoomRecord | null>;
}
