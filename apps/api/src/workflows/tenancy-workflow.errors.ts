import { HttpStatus } from "@nestjs/common";
import { DomainException } from "../platform/domain.exception.js";

export class WorkflowIdempotencyKeyReusedException extends DomainException {
  constructor() {
    super(
      "IDEMPOTENCY_KEY_REUSED",
      "Idempotency key was already used with a different request",
    );
  }
}

export class CommandAlreadyInProgressException extends DomainException {
  constructor() {
    super(
      "COMMAND_ALREADY_IN_PROGRESS",
      "The same command is already in progress",
    );
  }
}

export class TargetRoomUnavailableException extends DomainException {
  constructor() {
    super("TARGET_ROOM_UNAVAILABLE", "Target room is not available");
  }
}

export class CommandActionRequiredException extends DomainException {
  constructor() {
    super(
      "COMMAND_ACTION_REQUIRED",
      "This operation requires manual review before it can continue",
    );
  }
}

export class WorkflowValidationException extends DomainException {
  constructor(code: string, message: string) {
    super(code, message, HttpStatus.UNPROCESSABLE_ENTITY);
  }
}
