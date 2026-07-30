import { randomUUID } from "node:crypto";
import { RoomCodeConflictException } from "./rooms.errors.js";
import type {
  RoomCreateInput,
  RoomListQuery,
  RoomRecord,
  RoomRepository,
  RoomUpdateInput,
} from "./rooms.types.js";

export class InMemoryRoomRepository implements RoomRepository {
  private readonly rooms: Array<RoomRecord & { deletedAt: string | null }> = [];

  async list(query: RoomListQuery) {
    const normalizedQuery = query.q?.toUpperCase();
    const filtered = this.rooms
      .filter((room) => !room.deletedAt)
      .filter((room) => !query.status || room.status === query.status)
      .filter((room) => !query.groupId || room.roomGroupId === query.groupId)
      .filter(
        (room) =>
          !normalizedQuery ||
          room.code.includes(normalizedQuery) ||
          room.name.toUpperCase().includes(normalizedQuery),
      )
      .sort((left, right) => compareRooms(left, right, query.sort));

    const start = query.cursor
      ? Math.max(0, filtered.findIndex((room) => room.id === query.cursor) + 1)
      : 0;
    const page = filtered.slice(start, start + query.limit + 1);
    const data = page.slice(0, query.limit).map(stripDeletedAt);

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

  async findById(id: string) {
    const room = this.rooms.find((item) => item.id === id && !item.deletedAt);
    return room ? stripDeletedAt(room) : null;
  }

  async create(input: RoomCreateInput) {
    this.assertCodeAvailable(input.propertyId, input.code);

    const now = new Date().toISOString();
    const room: RoomRecord & { deletedAt: string | null } = {
      id: randomUUID(),
      propertyId: input.propertyId,
      roomGroupId: input.roomGroupId ?? null,
      code: input.code,
      name: input.name,
      roomType: input.roomType ?? null,
      status: input.status ?? "VACANT",
      defaultRentAmount: input.defaultRentAmount ?? "0",
      defaultBillingCycleType: input.defaultBillingCycleType ?? "MONTHLY",
      defaultBillingCycleCount: input.defaultBillingCycleCount ?? 1,
      maxOccupants: input.maxOccupants ?? 1,
      rentPaidUntil: null,
      depositAmount: input.depositAmount ?? "0",
      notes: input.notes ?? null,
      currentOccupancy: null,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    };

    this.rooms.push(room);
    return stripDeletedAt(room);
  }

  async update(id: string, input: RoomUpdateInput) {
    const room = this.rooms.find((item) => item.id === id && !item.deletedAt);
    if (!room) return null;

    if (input.code && input.code !== room.code) {
      this.assertCodeAvailable(room.propertyId, input.code, id);
    }

    Object.assign(room, {
      ...input,
      roomGroupId:
        input.roomGroupId === undefined ? room.roomGroupId : input.roomGroupId,
      updatedAt: new Date().toISOString(),
    });

    return stripDeletedAt(room);
  }

  async retire(id: string) {
    const room = this.rooms.find((item) => item.id === id && !item.deletedAt);
    if (!room) return null;

    room.status = "INACTIVE";
    room.deletedAt = new Date().toISOString();
    room.updatedAt = room.deletedAt;

    return stripDeletedAt(room);
  }

  private assertCodeAvailable(
    propertyId: string,
    code: string,
    excludeId?: string,
  ) {
    const existing = this.rooms.find(
      (room) =>
        !room.deletedAt &&
        room.propertyId === propertyId &&
        room.code === code &&
        room.id !== excludeId,
    );

    if (existing) {
      throw new RoomCodeConflictException();
    }
  }
}

function stripDeletedAt(room: RoomRecord & { deletedAt: string | null }) {
  const { deletedAt: _deletedAt, ...record } = room;
  return {
    ...record,
    status:
      record.status === "INACTIVE" || record.status === "MAINTENANCE"
        ? record.status
        : record.currentOccupancy
          ? ("OCCUPIED" as const)
          : ("VACANT" as const),
  };
}

function compareRooms(
  left: RoomRecord,
  right: RoomRecord,
  sort: RoomListQuery["sort"],
) {
  if (sort === "code:asc") return left.code.localeCompare(right.code);
  if (sort === "code:desc") return right.code.localeCompare(left.code);
  if (sort === "createdAt:asc")
    return left.createdAt.localeCompare(right.createdAt);
  return right.createdAt.localeCompare(left.createdAt);
}
