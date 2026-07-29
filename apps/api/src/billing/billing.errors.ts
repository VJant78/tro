import {
  ConflictException,
  NotFoundException,
  UnprocessableEntityException,
} from "@nestjs/common";

export class InvoiceNotFoundException extends NotFoundException {
  constructor() {
    super("Invoice not found");
  }
}

export class SettlementInvoiceNotFoundException extends NotFoundException {
  constructor() {
    super("Settlement not found for invoice");
  }
}

export class BillingRoomNotFoundException extends NotFoundException {
  constructor() {
    super("Room not found for invoice");
  }
}

export class BillingValidationException extends UnprocessableEntityException {
  constructor(message: string) {
    super({ message, details: [] });
  }
}

export class PaymentIdempotencyConflictException extends ConflictException {
  constructor() {
    super("A payment with this idempotency key already exists");
  }
}
