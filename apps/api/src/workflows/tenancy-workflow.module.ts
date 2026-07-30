import { Module } from "@nestjs/common";
import { AuditModule } from "../audit/audit.module.js";
import { BillingModule } from "../billing/billing.module.js";
import { DatabaseModule } from "../database/database.module.js";
import { TenantsModule } from "../tenants/tenants.module.js";
import { UtilitiesModule } from "../utilities/utilities.module.js";
import { TenancyWorkflowController } from "./tenancy-workflow.controller.js";
import { TenancyWorkflowService } from "./tenancy-workflow.service.js";

@Module({
  imports: [
    AuditModule,
    BillingModule,
    DatabaseModule,
    TenantsModule,
    UtilitiesModule,
  ],
  controllers: [TenancyWorkflowController],
  providers: [TenancyWorkflowService],
  exports: [TenancyWorkflowService],
})
export class TenancyWorkflowModule {}
