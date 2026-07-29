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
import { Roles, type AppRole } from "../security/roles.decorator.js";
import { parseRequest } from "../platform/validation.js";
import { RoomNotFoundException } from "./rooms.errors.js";
import {
  roomCreateSchema,
  roomListQuerySchema,
  roomUpdateSchema,
} from "./rooms.schemas.js";
import { RoomsService } from "./rooms.service.js";
import { z } from "zod";

interface RequestWithUser extends Request {
  user?: {
    id: string;
    role: AppRole;
  };
}

const idParamSchema = z.object({ id: z.uuid() });

@Roles("OWNER", "MANAGER", "STAFF", "VIEWER")
@Controller("rooms")
export class RoomsController {
  constructor(@Inject(RoomsService) private readonly rooms: RoomsService) {}

  @Get()
  list(@Query() query: unknown) {
    return this.rooms.list(parseRequest(roomListQuerySchema, query));
  }

  @Get(":id")
  async detail(@Param() params: unknown) {
    const { id } = parseRequest(idParamSchema, params);
    const room = await this.rooms.findById(id);
    if (!room) throw new RoomNotFoundException();
    return room;
  }

  @Roles("OWNER", "MANAGER", "STAFF")
  @Post()
  create(@Body() body: unknown, @Req() request: RequestWithUser) {
    return this.rooms.create(
      parseRequest(roomCreateSchema, body),
      request.user?.id,
    );
  }

  @Roles("OWNER", "MANAGER", "STAFF")
  @Patch(":id")
  async update(
    @Param() params: unknown,
    @Body() body: unknown,
    @Req() request: RequestWithUser,
  ) {
    const { id } = parseRequest(idParamSchema, params);
    const room = await this.rooms.update(
      id,
      parseRequest(roomUpdateSchema, body),
      request.user?.id,
    );
    if (!room) throw new RoomNotFoundException();
    return room;
  }

  @Roles("OWNER", "MANAGER")
  @Delete(":id")
  async retire(@Param() params: unknown, @Req() request: RequestWithUser) {
    const { id } = parseRequest(idParamSchema, params);
    const room = await this.rooms.retire(id, request.user?.id);
    if (!room) throw new RoomNotFoundException();
    return room;
  }
}
