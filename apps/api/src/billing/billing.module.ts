import { Module } from "@nestjs/common";
import { AuditModule } from "../audit/audit.module.js";
import { DatabaseModule } from "../database/database.module.js";
import { RoomsModule } from "../rooms/rooms.module.js";
import { UtilitiesModule } from "../utilities/utilities.module.js";
import { BillingController } from "./billing.controller.js";
import { BillingService } from "./billing.service.js";
import { BILLING_REPOSITORY } from "./billing.tokens.js";
import { InMemoryBillingRepository } from "./in-memory-billing.repository.js";
import { PrismaBillingRepository } from "./prisma-billing.repository.js";

@Module({
  imports: [AuditModule, DatabaseModule, RoomsModule, UtilitiesModule],
  controllers: [BillingController],
  providers: [
    BillingService,
    {
      provide: BILLING_REPOSITORY,
      useClass:
        process.env.NODE_ENV === "test"
          ? InMemoryBillingRepository
          : PrismaBillingRepository,
    },
  ],
})
export class BillingModule {}
