import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
} from "@nestjs/common";
import { RolesService } from "./roles.service";
import { UsersService } from "./users.service";
import { InvitesService } from "./invites.service";
import {
  AssignRoleBody,
  CreateInviteBody,
  CreateRoleBody,
  InviteListQuery,
  RoleListQuery,
  UpdateRoleBody,
  UserListQuery,
  type AssignRoleBodyT,
  type CreateInviteBodyT,
  type CreateRoleBodyT,
  type InviteListQueryT,
  type RoleListQueryT,
  type UpdateRoleBodyT,
  type UserListQueryT,
} from "./dto";
import { ZodBody } from "../common/zod-validation.pipe";
import { ZodQuery } from "../common/zod-query.pipe";
import { RequirePermission } from "./decorators/require-permission.decorator";
import {
  CurrentUser,
  type RequestUser,
} from "../auth/decorators/current-user.decorator";
import { ALL_PERMISSIONS } from "./system-roles";

@Controller()
export class RbacController {
  constructor(
    private readonly roles: RolesService,
    private readonly users: UsersService,
    private readonly invites: InvitesService,
  ) {}

  // ─── Roles ───────────────────────────────────────────────────────────────

  @Get("roles")
  @RequirePermission("rbac.read")
  listRoles(
    @Query(new ZodQuery(RoleListQuery)) q: RoleListQueryT,
  ): Promise<unknown> {
    return this.roles.list(q);
  }

  @Get("roles/:id")
  @RequirePermission("rbac.read")
  getRole(@Param("id", new ParseUUIDPipe()) id: string): Promise<unknown> {
    return this.roles.get(id);
  }

  @Post("roles")
  @RequirePermission("rbac.write")
  createRole(
    @Body(new ZodBody(CreateRoleBody)) body: CreateRoleBodyT,
  ): Promise<unknown> {
    return this.roles.create(body);
  }

  @Patch("roles/:id")
  @RequirePermission("rbac.write")
  updateRole(
    @Param("id", new ParseUUIDPipe()) id: string,
    @Body(new ZodBody(UpdateRoleBody)) body: UpdateRoleBodyT,
  ): Promise<unknown> {
    return this.roles.update(id, body);
  }

  @Delete("roles/:id")
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermission("rbac.write")
  removeRole(@Param("id", new ParseUUIDPipe()) id: string): Promise<void> {
    return this.roles.remove(id);
  }

  // ─── Permissions catalog ─────────────────────────────────────────────────

  @Get("permissions")
  @RequirePermission("rbac.read")
  listPermissions(): unknown {
    return { items: ALL_PERMISSIONS };
  }

  // ─── Users ───────────────────────────────────────────────────────────────

  @Get("users")
  @RequirePermission("rbac.read")
  listUsers(
    @Query(new ZodQuery(UserListQuery)) q: UserListQueryT,
  ): Promise<unknown> {
    return this.users.list(q);
  }

  @Put("users/:id/roles")
  @RequirePermission("rbac.write")
  assignRole(
    @Param("id", new ParseUUIDPipe()) userId: string,
    @Body(new ZodBody(AssignRoleBody)) body: AssignRoleBodyT,
    @CurrentUser() actor: RequestUser,
  ): Promise<unknown> {
    return this.users.assignRole(userId, body, actor.userId);
  }

  @Post("users/:id/deactivate")
  @HttpCode(HttpStatus.OK)
  @RequirePermission("rbac.write")
  deactivateUser(
    @Param("id", new ParseUUIDPipe()) userId: string,
    @CurrentUser() actor: RequestUser,
  ): Promise<unknown> {
    return this.users.deactivate(userId, actor.userId);
  }

  @Post("users/:id/activate")
  @HttpCode(HttpStatus.OK)
  @RequirePermission("rbac.write")
  activateUser(
    @Param("id", new ParseUUIDPipe()) userId: string,
  ): Promise<unknown> {
    return this.users.activate(userId);
  }

  // ─── Invites ─────────────────────────────────────────────────────────────

  @Post("invites")
  @RequirePermission("employee.invite")
  createInvite(
    @Body(new ZodBody(CreateInviteBody)) body: CreateInviteBodyT,
    @CurrentUser() actor: RequestUser,
  ): Promise<unknown> {
    return this.invites.create(body, actor.userId);
  }

  @Get("invites")
  @RequirePermission("employee.invite")
  listInvites(
    @Query(new ZodQuery(InviteListQuery)) q: InviteListQueryT,
  ): Promise<unknown> {
    return this.invites.list(q);
  }

  @Delete("invites/:id")
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermission("employee.invite")
  revokeInvite(@Param("id", new ParseUUIDPipe()) id: string): Promise<void> {
    return this.invites.revoke(id);
  }

  @Post("invites/:id/resend")
  @RequirePermission("employee.invite")
  resendInvite(
    @Param("id", new ParseUUIDPipe()) id: string,
    @CurrentUser() actor: RequestUser,
  ): Promise<unknown> {
    return this.invites.resend(id, actor.userId);
  }
}
