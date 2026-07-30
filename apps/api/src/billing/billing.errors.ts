import {
  ConflictException,
  NotFoundException,
  UnprocessableEntityException,
} from "@nestjs/common";
import { DomainException } from "../platform/domain.exception.js";

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

export class PaymentIdempotencyKeyReusedException extends DomainException {
  constructor() {
    super(
      "IDEMPOTENCY_KEY_REUSED",
      "Idempotency key was already used with a different payment request",
    );
  }
}

export class PaymentIdempotencyRequiredException extends DomainException {
  constructor() {
    super(
      "IDEMPOTENCY_KEY_REQUIRED",
      "Payment requires an idempotency key",
      422,
    );
  }
}

export class ReceiptNotFoundException extends DomainException {
  constructor() {
    super("RECEIPT_NOT_FOUND", "Receipt not found", 404);
  }
}

export class TenancyNotActiveException extends DomainException {
  constructor() {
    super("TENANCY_NOT_ACTIVE", "Tenancy is not active", 409);
  }
}

export class ReceiptDateOutOfRangeException extends DomainException {
  constructor() {
    super(
      "RECEIPT_DATE_OUT_OF_RANGE",
      "Receipt date must be within the active tenancy and current business date",
      422,
    );
  }
}

export class ReceiptPayerNotActiveException extends DomainException {
  constructor() {
    super(
      "RECEIPT_PAYER_NOT_ACTIVE",
      "Payer must be an active member of this tenancy on the receipt date",
      422,
    );
  }
}

export class ReceiptAlreadyVoidedException extends DomainException {
  constructor() {
    super("RECEIPT_ALREADY_VOIDED", "Receipt has already been voided", 409);
  }
}

export class ReceiptReversalConflictException extends DomainException {
  constructor() {
    super(
      "RECEIPT_REVERSAL_CONFLICT",
      "Receipt cannot be reversed without violating financial history",
      409,
    );
  }
}

export class CreditBalanceConflictException extends DomainException {
  constructor() {
    super(
      "CREDIT_BALANCE_CONFLICT",
      "Tenancy credit balance changed or would become invalid",
      409,
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
