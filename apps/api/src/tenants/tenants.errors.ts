import { ConflictException, NotFoundException } from "@nestjs/common";
import { DomainException } from "../platform/domain.exception.js";

export class TenantNotFoundException extends NotFoundException {
  constructor() {
    super("Tenant not found");
  }
}

export class TenancyNotFoundException extends NotFoundException {
  constructor() {
    super("Tenancy not found");
  }
}

export class ActiveTenancyConflictException extends ConflictException {
  constructor(message = "Active tenancy conflict") {
    super(message);
  }
}

export class RepresentativeNotActiveCotenantException extends DomainException {
  constructor() {
    super(
      "REPRESENTATIVE_NOT_ACTIVE_COTENANT",
      "New representative must be an active co-tenant in this tenancy",
    );
  }
}

export class IdempotencyKeyReusedException extends DomainException {
  constructor() {
    super(
      "IDEMPOTENCY_KEY_REUSED",
      "Idempotency key was already used with a different request",
    );
  }
}

export class OldRoomSettlementRequiredException extends DomainException {
  constructor() {
    super(
      "OLD_ROOM_SETTLEMENT_REQUIRED",
      "Use the whole-room close workflow before moving or removing the representative",
    );
  }
}
