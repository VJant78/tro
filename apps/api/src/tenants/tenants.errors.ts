import { ConflictException, NotFoundException } from "@nestjs/common";

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
