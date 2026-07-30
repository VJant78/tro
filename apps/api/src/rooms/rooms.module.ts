import { Module } from "@nestjs/common";
import { AuditModule } from "../audit/audit.module.js";
import { DatabaseModule } from "../database/database.module.js";
import { TenantsModule } from "../tenants/tenants.module.js";
import { InMemoryRoomRepository } from "./in-memory-room.repository.js";
import { PrismaRoomRepository } from "./prisma-room.repository.js";
import { RoomsController } from "./rooms.controller.js";
import { RoomsService } from "./rooms.service.js";
import { ROOM_REPOSITORY } from "./rooms.tokens.js";

@Module({
  imports: [AuditModule, DatabaseModule, TenantsModule],
  controllers: [RoomsController],
  providers: [
    RoomsService,
    {
      provide: ROOM_REPOSITORY,
      useClass:
        process.env.NODE_ENV === "test"
          ? InMemoryRoomRepository
          : PrismaRoomRepository,
    },
  ],
  exports: [RoomsService],
})
export class RoomsModule {}
