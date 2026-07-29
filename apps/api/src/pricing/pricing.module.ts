import { Module } from "@nestjs/common";
import { AuditModule } from "../audit/audit.module.js";
import { DatabaseModule } from "../database/database.module.js";
import { InMemoryPricingRepository } from "./in-memory-pricing.repository.js";
import { PricingController } from "./pricing.controller.js";
import { PrismaPricingRepository } from "./prisma-pricing.repository.js";
import { PricingService } from "./pricing.service.js";
import { PRICING_REPOSITORY } from "./pricing.tokens.js";

@Module({
  imports: [AuditModule, DatabaseModule],
  controllers: [PricingController],
  providers: [
    PricingService,
    {
      provide: PRICING_REPOSITORY,
      useClass:
        process.env.NODE_ENV === "test"
          ? InMemoryPricingRepository
          : PrismaPricingRepository,
    },
  ],
  exports: [PricingService],
})
export class PricingModule {}
