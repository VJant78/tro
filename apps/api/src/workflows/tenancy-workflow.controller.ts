import {
  Body,
  Controller,
  Headers,
  HttpCode,
  Inject,
  Param,
  Patch,
  Post,
  Req,
  Res,
} from "@nestjs/common";
import type { Request, Response } from "express";
import { parseRequest } from "../platform/validation.js";
import { Roles, type AppRole } from "../security/roles.decorator.js";
import {
  finalizeAndInvoiceSchema,
  tenancyIdParamSchema,
  wholeGroupEndSchema,
  wholeGroupTransferSchema,
  operationRecoverySchema,
  operationCancelSchema,
} from "./tenancy-workflow.schemas.js";
import { TenancyWorkflowService } from "./tenancy-workflow.service.js";
import { WorkflowValidationException } from "./tenancy-workflow.errors.js";

interface AuthenticatedRequest extends Request {
  user?: { id: string; role: AppRole };
}

@Roles("OWNER", "MANAGER", "STAFF")
@Controller()
export class TenancyWorkflowController {
  constructor(
    @Inject(TenancyWorkflowService)
    private readonly workflows: TenancyWorkflowService,
  ) {}

  @Post("settlements/finalize-and-invoice")
  async finalizeAndInvoice(
    @Body() body: unknown,
    @Headers("idempotency-key") idempotencyHeader: string | undefined,
    @Req() request: AuthenticatedRequest,
    @Res({ passthrough: true }) response: Response,
  ) {
    const input = parseRequest(finalizeAndInvoiceSchema, body);
    assertIdempotencyHeader(input.idempotencyKey, idempotencyHeader);
    const result = await this.workflows.finalizeAndInvoice(
      input,
      request.user?.id,
    );
    response.status(result.httpStatus);
    const { httpStatus: _httpStatus, ...payload } = result;
    return payload;
  }

  @Post("tenancies/:id/transfer")
  async transfer(
    @Param() params: unknown,
    @Body() body: unknown,
    @Headers("idempotency-key") idempotencyHeader: string | undefined,
    @Req() request: AuthenticatedRequest,
    @Res({ passthrough: true }) response: Response,
  ) {
    const { id } = parseRequest(tenancyIdParamSchema, params);
    const input = parseRequest(wholeGroupTransferSchema, body);
    assertIdempotencyHeader(input.idempotencyKey, idempotencyHeader);
    const result = await this.workflows.transferWholeGroup(
      id,
      input,
      request.user?.id,
    );
    response.status(result.httpStatus);
    const { httpStatus: _httpStatus, ...payload } = result;
    return payload;
  }

  @Patch("tenancies/:id/end")
  async end(
    @Param() params: unknown,
    @Body() body: unknown,
    @Headers("idempotency-key") idempotencyHeader: string | undefined,
    @Req() request: AuthenticatedRequest,
    @Res({ passthrough: true }) response: Response,
  ) {
    const { id } = parseRequest(tenancyIdParamSchema, params);
    const input = parseRequest(wholeGroupEndSchema, body);
    assertIdempotencyHeader(input.idempotencyKey, idempotencyHeader);
    const result = await this.workflows.endWholeGroup(
      id,
      input,
      request.user?.id,
    );
    response.status(result.httpStatus);
    const { httpStatus: _httpStatus, ...payload } = result;
    return payload;
  }

  @Roles("OWNER", "MANAGER")
  @Post("tenancy-operations/:id/resume")
  @HttpCode(200)
  resumeOperation(
    @Param() params: unknown,
    @Body() body: unknown,
    @Headers("idempotency-key") idempotencyHeader: string | undefined,
    @Req() request: AuthenticatedRequest,
  ) {
    const { id } = parseRequest(tenancyIdParamSchema, params);
    const input = parseRequest(operationRecoverySchema, body);
    assertIdempotencyHeader(input.idempotencyKey, idempotencyHeader);
    return this.workflows.resumeOperation(id, input, request.user?.id);
  }

  @Roles("OWNER", "MANAGER")
  @Post("tenancy-operations/:id/cancel")
  @HttpCode(200)
  cancelOperation(
    @Param() params: unknown,
    @Body() body: unknown,
    @Headers("idempotency-key") idempotencyHeader: string | undefined,
    @Req() request: AuthenticatedRequest,
  ) {
    const { id } = parseRequest(tenancyIdParamSchema, params);
    const input = parseRequest(operationCancelSchema, body);
    assertIdempotencyHeader(input.idempotencyKey, idempotencyHeader);
    return this.workflows.cancelOperation(id, input, request.user?.id);
  }
}

function assertIdempotencyHeader(bodyKey: string, headerKey?: string) {
  if (headerKey && headerKey !== bodyKey) {
    throw new WorkflowValidationException(
      "IDEMPOTENCY_KEY_MISMATCH",
      "Idempotency-Key header must match idempotencyKey in the request body",
    );
  }
}
