import {
  Body,
  Controller,
  Delete,
  Get,
  Inject,
  Param,
  Patch,
  Post,
  Query,
  Req,
} from "@nestjs/common";
import type { Request } from "express";
import { parseRequest } from "../platform/validation.js";
import { Roles, type AppRole } from "../security/roles.decorator.js";
import {
  idParamSchema,
  globalPricingUpdateSchema,
  pricingConfigSchema,
  pricingEffectiveQuerySchema,
  pricingUpdateSchema,
} from "./pricing.schemas.js";
import { PricingService } from "./pricing.service.js";

interface RequestWithUser extends Request {
  user?: {
    id: string;
    role: AppRole;
  };
}

@Roles("OWNER", "MANAGER", "STAFF", "VIEWER")
@Controller("pricing-configs")
export class PricingController {
  constructor(
    @Inject(PricingService) private readonly pricing: PricingService,
  ) {}

  @Get()
  list() {
    return this.pricing.list();
  }

  @Get("effective")
  effective(@Query() query: unknown) {
    return this.pricing.effective(
      parseRequest(pricingEffectiveQuerySchema, query),
    );
  }

  @Get("global")
  global() {
    return this.pricing.global();
  }

  @Roles("OWNER", "MANAGER")
  @Patch("global")
  updateGlobal(@Body() body: unknown, @Req() request: RequestWithUser) {
    return this.pricing.updateGlobal(
      parseRequest(globalPricingUpdateSchema, body),
      request.user?.id,
    );
  }

  @Roles("OWNER", "MANAGER")
  @Post()
  create(@Body() body: unknown, @Req() request: RequestWithUser) {
    return this.pricing.create(
      parseRequest(pricingConfigSchema, body),
      request.user?.id,
    );
  }

  @Roles("OWNER", "MANAGER")
  @Patch(":id")
  update(
    @Param() params: unknown,
    @Body() body: unknown,
    @Req() request: RequestWithUser,
  ) {
    const { id } = parseRequest(idParamSchema, params);
    return this.pricing.update(
      id,
      parseRequest(pricingUpdateSchema, body),
      request.user?.id,
    );
  }

  @Roles("OWNER", "MANAGER")
  @Delete(":id")
  deactivate(@Param() params: unknown, @Req() request: RequestWithUser) {
    const { id } = parseRequest(idParamSchema, params);
    return this.pricing.deactivate(id, request.user?.id);
  }
}
