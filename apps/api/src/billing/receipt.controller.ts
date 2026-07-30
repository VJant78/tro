import {
  Body,
  Controller,
  Get,
  Headers,
  Inject,
  Param,
  Post,
  Query,
  Req,
} from "@nestjs/common";
import type { Request } from "express";
import { DomainException } from "../platform/domain.exception.js";
import { parseRequest } from "../platform/validation.js";
import { Roles, type AppRole } from "../security/roles.decorator.js";
import {
  receiptConfirmSchema,
  receiptHistorySchema,
  receiptIntentSchema,
  receiptParamsSchema,
  receiptVoidSchema,
  tenancyReceiptParamsSchema,
} from "./receipt.schemas.js";
import { ReceiptService } from "./receipt.service.js";

interface RequestWithUser extends Request {
  user?: { id: string; role: AppRole; propertyId: string };
}

@Roles("OWNER", "MANAGER", "STAFF", "VIEWER")
@Controller()
export class ReceiptController {
  constructor(
    @Inject(ReceiptService) private readonly receipts: ReceiptService,
  ) {}

  @Roles("OWNER", "MANAGER", "STAFF")
  @Post("tenancies/:tenancyId/receipts/preview")
  preview(
    @Param() params: unknown,
    @Body() body: unknown,
    @Req() request: RequestWithUser,
  ) {
    const { tenancyId } = parseRequest(tenancyReceiptParamsSchema, params);
    return this.receipts.preview(
      tenancyId,
      parseRequest(receiptIntentSchema, body),
      requireUser(request).id,
    );
  }

  @Roles("OWNER", "MANAGER", "STAFF")
  @Post("tenancies/:tenancyId/receipts")
  confirm(
    @Param() params: unknown,
    @Body() body: unknown,
    @Headers("idempotency-key") idempotencyKey: string | undefined,
    @Req() request: RequestWithUser,
  ) {
    const { tenancyId } = parseRequest(tenancyReceiptParamsSchema, params);
    const user = requireUser(request);
    return this.receipts.confirm(
      tenancyId,
      parseRequest(receiptConfirmSchema, body),
      normalizeIdempotencyKey(idempotencyKey),
      user.id,
      user.role,
    );
  }

  @Get("tenancies/:tenancyId/receipts")
  list(
    @Param() params: unknown,
    @Query() query: unknown,
    @Req() request: RequestWithUser,
  ) {
    const { tenancyId } = parseRequest(tenancyReceiptParamsSchema, params);
    return this.receipts.list(
      tenancyId,
      parseRequest(receiptHistorySchema, query),
      requireUser(request).role,
    );
  }

  @Get("receipts/:receiptId")
  detail(@Param() params: unknown, @Req() request: RequestWithUser) {
    const { receiptId } = parseRequest(receiptParamsSchema, params);
    return this.receipts.detail(receiptId, requireUser(request).role);
  }

  @Roles("OWNER", "MANAGER")
  @Post("receipts/:receiptId/void")
  void(
    @Param() params: unknown,
    @Body() body: unknown,
    @Headers("idempotency-key") idempotencyKey: string | undefined,
    @Req() request: RequestWithUser,
  ) {
    const { receiptId } = parseRequest(receiptParamsSchema, params);
    const { reason } = parseRequest(receiptVoidSchema, body);
    const user = requireUser(request);
    return this.receipts.void(
      receiptId,
      reason,
      normalizeIdempotencyKey(idempotencyKey),
      user.id,
      user.role,
    );
  }
}

function requireUser(request: RequestWithUser) {
  if (!request.user) {
    throw new DomainException(
      "UNAUTHENTICATED",
      "Authentication required",
      401,
    );
  }
  return request.user;
}

function normalizeIdempotencyKey(value: string | undefined) {
  const normalized = value?.trim();
  if (!normalized) return undefined;
  if (normalized.length < 16 || normalized.length > 128) {
    throw new DomainException(
      "IDEMPOTENCY_KEY_INVALID",
      "Idempotency-Key must contain 16 to 128 characters",
      422,
    );
  }
  return normalized;
}
