import { ConflictException, NotFoundException } from "@nestjs/common";
import { DomainException } from "../platform/domain.exception.js";

export class RoomCodeConflictException extends ConflictException {
  constructor() {
    super("An active room with this code already exists");
  }
}

export class RoomNotFoundException extends NotFoundException {
  constructor() {
    super("Room not found");
  }
}

export class RoomHasActiveOccupantsException extends DomainException {
  constructor() {
    super(
      "ROOM_HAS_ACTIVE_OCCUPANTS",
      "Room state cannot change while active occupants remain",
    );
  }
}

export class DerivedRoomStatusException extends DomainException {
  constructor() {
    super(
      "ROOM_STATUS_IS_DERIVED",
      "OCCUPIED is derived from active tenancy membership",
    );
  }
}
