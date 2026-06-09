import { Module } from "@nestjs/common";
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from "@nestjs/core";
import { ThrottlerModule } from "@nestjs/throttler";
import { HealthController } from "./health.controller";
import { ThrottlerBehindProxyGuard } from "./common/throttler-behind-proxy.guard";
import { StorageModule } from "./storage/storage.module";
import { PrismaModule } from "./infra/prisma/prisma.module";
import { AuthModule } from "./auth/auth.module";
import { RbacModule } from "./rbac/rbac.module";
import { AuditModule } from "./audit/audit.module";
import { OrgStructureModule } from "./org-structure/org-structure.module";
import { EmployeesModule } from "./employees/employees.module";
import { AttendanceModule } from "./attendance/attendance.module";
import { LeaveModule } from "./leave/leave.module";
import { HolidaysModule } from "./holidays/holidays.module";
import { AnnouncementsModule } from "./announcements/announcements.module";
import { DocumentsModule } from "./documents/documents.module";
import { DashboardModule } from "./dashboard/dashboard.module";
import { NotificationsModule } from "./notifications/notifications.module";
import { OrganizationModule } from "./organization/organization.module";
import { JwtAuthGuard } from "./auth/guards/jwt-auth.guard";
import { CsrfGuard } from "./auth/guards/csrf.guard";
import { PermissionGuard } from "./rbac/permission.guard";
import { TenantInterceptor } from "./tenant/tenant.interceptor";
import { GlobalExceptionFilter } from "./common/http-exception.filter";

@Module({
  imports: [
    // Global rate limiting. Generous default ceiling per client IP (keyed by
    // the proxy-aware guard below); /auth/* tightens this via @Throttle, and
    // /healthz + /readyz are exempt via @SkipThrottle. In-memory storage is
    // fine for the single-instance demo.
    ThrottlerModule.forRoot([{ name: "default", ttl: 60_000, limit: 120 }]),
    PrismaModule,
    StorageModule,
    AuditModule,
    AuthModule,
    RbacModule,
    OrgStructureModule,
    EmployeesModule,
    AttendanceModule,
    LeaveModule,
    HolidaysModule,
    AnnouncementsModule,
    DocumentsModule,
    DashboardModule,
    NotificationsModule,
    OrganizationModule,
  ],
  controllers: [HealthController],
  providers: [
    // Throttler runs FIRST so unauthenticated floods are rejected before the
    // auth/permission guards do any work.
    { provide: APP_GUARD, useClass: ThrottlerBehindProxyGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: CsrfGuard },
    { provide: APP_GUARD, useClass: PermissionGuard },
    { provide: APP_INTERCEPTOR, useClass: TenantInterceptor },
    { provide: APP_FILTER, useClass: GlobalExceptionFilter },
  ],
})
export class AppModule {}
