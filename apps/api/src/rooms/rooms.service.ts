import { Inject, Injectable } from "@nestjs/common";
import { AuditService } from "../audit/audit.service.js";
import { ROOM_REPOSITORY } from "./rooms.tokens.js";
import type {
  RoomCreateInput,
  RoomListQuery,
  RoomRepository,
  RoomUpdateInput,
} from "./rooms.types.js";

@Injectable()
export class RoomsService {
  constructor(
    @Inject(ROOM_REPOSITORY) private readonly rooms: RoomRepository,
    @Inject(AuditService) private readonly audit: AuditService,
  ) {}

  list(query: RoomListQuery) {
    return this.rooms.list(query);
  }

  findById(id: string) {
    return this.rooms.findById(id);
  }

  async create(input: RoomCreateInput, actorUserId?: string) {
    const room = await this.rooms.create(input);
    await this.audit.record({
      action: "CREATE",
      entityType: "room",
      entityId: room.id,
      actorUserId,
      newValues: room,
    });
    return room;
  }

  async update(id: string, input: RoomUpdateInput, actorUserId?: string) {
    const before = await this.rooms.findById(id);
    const room = await this.rooms.update(id, input);
    if (!room) return null;

    await this.audit.record({
      action: "UPDATE",
      entityType: "room",
      entityId: room.id,
      actorUserId,
      oldValues: before ?? undefined,
      newValues: room,
    });
    return room;
  }

  async retire(id: string, actorUserId?: string) {
    const before = await this.rooms.findById(id);
    const room = await this.rooms.retire(id);
    if (!room) return null;

    await this.audit.record({
      action: "DELETE",
      entityType: "room",
      entityId: room.id,
      actorUserId,
      oldValues: before ?? undefined,
      newValues: room,
      metadata: { mode: "soft-delete-retire" },
    });
    return room;
  }
}
