import { Module } from "@nestjs/common";
import { OrgBootstrapService } from "./org-bootstrap.service";
import { PermissionsService } from "./permissions.service";
import { PermissionGuard } from "./permission.guard";

@Module({
  providers: [OrgBootstrapService, PermissionsService, PermissionGuard],
  exports: [OrgBootstrapService, PermissionsService, PermissionGuard],
})
export class RbacModule {}
