import { ConflictException, NotFoundException } from "@nestjs/common";

export class PricingConfigNotFoundException extends NotFoundException {
  constructor() {
    super("Pricing config not found");
  }
}

export class PricingOverlapException extends ConflictException {
  constructor() {
    super("Pricing config overlaps an active effective period");
  }
}
