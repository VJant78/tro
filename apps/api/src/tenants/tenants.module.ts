import { Module } from "@nestjs/common";
import { AuditModule } from "../audit/audit.module.js";
import { DatabaseModule } from "../database/database.module.js";
import { InMemoryTenantRepository } from "./in-memory-tenant.repository.js";
import { PrismaTenantRepository } from "./prisma-tenant.repository.js";
import { TenantsController } from "./tenants.controller.js";
import { TenantsService } from "./tenants.service.js";
import { TENANT_REPOSITORY } from "./tenants.tokens.js";

@Module({
  imports: [AuditModule, DatabaseModule],
  controllers: [TenantsController],
  providers: [
    TenantsService,
    {
      provide: TENANT_REPOSITORY,
      useClass:
        process.env.NODE_ENV === "test"
          ? InMemoryTenantRepository
          : PrismaTenantRepository,
    },
  ],
})
export class TenantsModule {}
