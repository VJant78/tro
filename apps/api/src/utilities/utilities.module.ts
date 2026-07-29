import { Module } from "@nestjs/common";
import { AuditModule } from "../audit/audit.module.js";
import { DatabaseModule } from "../database/database.module.js";
import { PricingModule } from "../pricing/pricing.module.js";
import { TenantsModule } from "../tenants/tenants.module.js";
import { InMemoryUtilitiesRepository } from "./in-memory-utilities.repository.js";
import { PrismaUtilitiesRepository } from "./prisma-utilities.repository.js";
import { UtilitiesController } from "./utilities.controller.js";
import { UtilitiesService } from "./utilities.service.js";
import { UTILITIES_REPOSITORY } from "./utilities.tokens.js";

@Module({
  imports: [AuditModule, DatabaseModule, PricingModule, TenantsModule],
  controllers: [UtilitiesController],
  providers: [
    UtilitiesService,
    {
      provide: UTILITIES_REPOSITORY,
      useClass:
        process.env.NODE_ENV === "test"
          ? InMemoryUtilitiesRepository
          : PrismaUtilitiesRepository,
    },
  ],
})
export class UtilitiesModule {}
