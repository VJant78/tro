import { ConflictException, NotFoundException } from "@nestjs/common";

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
