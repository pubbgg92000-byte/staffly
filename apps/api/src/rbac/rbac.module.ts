import { Module } from "@nestjs/common";
import { OrgBootstrapService } from "./org-bootstrap.service";
import { PermissionsService } from "./permissions.service";
import { CallerScopeService } from "./caller-scope.service";
import { PermissionGuard } from "./permission.guard";
import { RolesService } from "./roles.service";
import { UsersService } from "./users.service";
import { InvitesService } from "./invites.service";
import { RbacController } from "./rbac.controller";
import { AuditModule } from "../audit/audit.module";
import { MailerModule } from "../mailer/mailer.module";

@Module({
  imports: [AuditModule, MailerModule],
  controllers: [RbacController],
  providers: [
    OrgBootstrapService,
    PermissionsService,
    CallerScopeService,
    PermissionGuard,
    RolesService,
    UsersService,
    InvitesService,
  ],
  exports: [
    OrgBootstrapService,
    PermissionsService,
    CallerScopeService,
    PermissionGuard,
    UsersService,
  ],
})
export class RbacModule {}
