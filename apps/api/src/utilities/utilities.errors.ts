import {
  ConflictException,
  NotFoundException,
  UnprocessableEntityException,
} from "@nestjs/common";

export class UtilityReadingNotFoundException extends NotFoundException {
  constructor() {
    super("Utility reading not found");
  }
}

export class SettlementNotFoundException extends NotFoundException {
  constructor() {
    super("Settlement not found");
  }
}

export class SettlementTenancyNotFoundException extends NotFoundException {
  constructor() {
    super("Tenancy not found for settlement");
  }
}

export class FinalizedReadingConflictException extends ConflictException {
  constructor() {
    super(
      "A finalized utility reading already exists for this room and period",
    );
  }
}

export class FinalizedSettlementConflictException extends ConflictException {
  constructor() {
    super("A finalized settlement already exists for this tenancy and period");
  }
}

export class SettlementValidationException extends UnprocessableEntityException {
  constructor(message: string) {
    super({ message, details: [] });
  }
}
