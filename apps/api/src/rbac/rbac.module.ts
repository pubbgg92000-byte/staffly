import { Module } from "@nestjs/common";
import { OrgBootstrapService } from "./org-bootstrap.service";
import { PermissionsService } from "./permissions.service";
import { PermissionGuard } from "./permission.guard";
import { RolesService } from "./roles.service";
import { UsersService } from "./users.service";
import { InvitesService } from "./invites.service";
import { RbacController } from "./rbac.controller";
import { AuditModule } from "../audit/audit.module";

@Module({
  imports: [AuditModule],
  controllers: [RbacController],
  providers: [
    OrgBootstrapService,
    PermissionsService,
    PermissionGuard,
    RolesService,
    UsersService,
    InvitesService,
  ],
  exports: [OrgBootstrapService, PermissionsService, PermissionGuard],
})
export class RbacModule {}
