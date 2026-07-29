import { Module } from "@nestjs/common";
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from "@nestjs/core";
import { AuditModule } from "./audit/audit.module.js";
import { AuthModule } from "./auth/auth.module.js";
import { HealthController } from "./health/health.controller.js";
import { ApiExceptionFilter } from "./platform/api-exception.filter.js";
import { RequestContextInterceptor } from "./platform/request-context.interceptor.js";
import { PricingModule } from "./pricing/pricing.module.js";
import { RoomsModule } from "./rooms/rooms.module.js";
import { RbacGuard } from "./security/rbac.guard.js";
import { TenantsModule } from "./tenants/tenants.module.js";

@Module({
  imports: [AuditModule, AuthModule, RoomsModule, TenantsModule, PricingModule],
  controllers: [HealthController],
  providers: [
    { provide: APP_FILTER, useClass: ApiExceptionFilter },
    { provide: APP_INTERCEPTOR, useClass: RequestContextInterceptor },
    { provide: APP_GUARD, useClass: RbacGuard },
  ],
})
export class AppModule {}
