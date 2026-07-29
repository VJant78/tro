import {
  Body,
  Controller,
  Get,
  Inject,
  Param,
  Post,
  Query,
  Req,
} from "@nestjs/common";
import type { Request } from "express";
import { parseRequest } from "../platform/validation.js";
import { Roles, type AppRole } from "../security/roles.decorator.js";
import {
  idParamSchema,
  settlementInputSchema,
  settlementListQuerySchema,
  utilityReadingCreateSchema,
  utilityReadingListQuerySchema,
} from "./utilities.schemas.js";
import { UtilitiesService } from "./utilities.service.js";

interface RequestWithUser extends Request {
  user?: {
    id: string;
    role: AppRole;
  };
}

@Roles("OWNER", "MANAGER", "STAFF", "VIEWER")
@Controller()
export class UtilitiesController {
  constructor(
    @Inject(UtilitiesService) private readonly utilities: UtilitiesService,
  ) {}

  @Get("utility-readings")
  listReadings(@Query() query: unknown) {
    return this.utilities.listReadings(
      parseRequest(utilityReadingListQuerySchema, query),
    );
  }

  @Roles("OWNER", "MANAGER", "STAFF")
  @Post("utility-readings")
  createReading(@Body() body: unknown, @Req() request: RequestWithUser) {
    return this.utilities.createReading(
      parseRequest(utilityReadingCreateSchema, body),
      request.user?.id,
    );
  }

  @Roles("OWNER", "MANAGER", "STAFF")
  @Post("utility-readings/:id/finalize")
  finalizeReading(@Param() params: unknown, @Req() request: RequestWithUser) {
    const { id } = parseRequest(idParamSchema, params);
    return this.utilities.finalizeReading(id, request.user?.id);
  }

  @Get("settlements")
  listSettlements(@Query() query: unknown) {
    return this.utilities.listSettlements(
      parseRequest(settlementListQuerySchema, query),
    );
  }

  @Roles("OWNER", "MANAGER", "STAFF")
  @Post("settlements/preview")
  previewSettlement(@Body() body: unknown) {
    return this.utilities.previewSettlement(
      parseRequest(settlementInputSchema, body),
    );
  }

  @Roles("OWNER", "MANAGER", "STAFF")
  @Post("settlements")
  createSettlement(@Body() body: unknown, @Req() request: RequestWithUser) {
    return this.utilities.createSettlement(
      parseRequest(settlementInputSchema, body),
      request.user?.id,
    );
  }
}
