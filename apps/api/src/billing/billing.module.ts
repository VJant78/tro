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
import { ReceiptController } from "./receipt.controller.js";
import { ReceiptService } from "./receipt.service.js";

@Module({
  imports: [AuditModule, DatabaseModule, RoomsModule, UtilitiesModule],
  controllers: [BillingController, ReceiptController],
  providers: [
    BillingService,
    ReceiptService,
    {
      provide: BILLING_REPOSITORY,
      useClass:
        process.env.NODE_ENV === "test"
          ? InMemoryBillingRepository
          : PrismaBillingRepository,
    },
  ],
  exports: [BillingService, ReceiptService],
})
export class BillingModule {}
