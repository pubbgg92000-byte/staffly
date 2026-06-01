import { Module } from "@nestjs/common";
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from "@nestjs/core";
import { HealthController } from "./health.controller";
import { PrismaModule } from "./infra/prisma/prisma.module";
import { AuthModule } from "./auth/auth.module";
import { RbacModule } from "./rbac/rbac.module";
import { AuditModule } from "./audit/audit.module";
import { OrgStructureModule } from "./org-structure/org-structure.module";
import { EmployeesModule } from "./employees/employees.module";
import { JwtAuthGuard } from "./auth/guards/jwt-auth.guard";
import { CsrfGuard } from "./auth/guards/csrf.guard";
import { PermissionGuard } from "./rbac/permission.guard";
import { TenantInterceptor } from "./tenant/tenant.interceptor";
import { GlobalExceptionFilter } from "./common/http-exception.filter";

@Module({
  imports: [
    PrismaModule,
    AuditModule,
    AuthModule,
    RbacModule,
    OrgStructureModule,
    EmployeesModule,
  ],
  controllers: [HealthController],
  providers: [
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: CsrfGuard },
    { provide: APP_GUARD, useClass: PermissionGuard },
    { provide: APP_INTERCEPTOR, useClass: TenantInterceptor },
    { provide: APP_FILTER, useClass: GlobalExceptionFilter },
  ],
})
export class AppModule {}
