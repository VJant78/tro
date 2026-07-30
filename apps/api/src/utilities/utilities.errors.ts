import {
  ConflictException,
  NotFoundException,
  UnprocessableEntityException,
} from "@nestjs/common";
import { DomainException } from "../platform/domain.exception.js";

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

export class FinalizedSettlementConflictException extends DomainException {
  constructor() {
    super(
      "SETTLEMENT_ALREADY_FINALIZED",
      "A finalized settlement already exists for this tenancy and period",
    );
  }
}

export class SettlementValidationException extends UnprocessableEntityException {
  constructor(message: string) {
    super({ message, details: [] });
  }
}

export class ReadingBaselineChangedException extends DomainException {
  constructor() {
    super(
      "READING_BASELINE_CHANGED",
      "Previous utility readings no longer match the latest finalized reading",
    );
  }
}

export class PrepaidInputDeprecatedException extends DomainException {
  constructor() {
    super(
      "PREPAID_INPUT_DEPRECATED",
      "Manual prepaid input is no longer supported; record a receipt instead",
      422,
    );
  }
}
