import {
  type CanActivate,
  type ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { Request } from "express";
import { PermissionsService } from "./permissions.service";
import { REQUIRE_PERMISSION_KEY } from "./decorators/require-permission.decorator";
import { IS_PUBLIC_KEY } from "../auth/decorators/public.decorator";
import type { RequestUser } from "../auth/decorators/current-user.decorator";

@Injectable()
export class PermissionGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly permissions: PermissionsService,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean | undefined>(
      IS_PUBLIC_KEY,
      [ctx.getHandler(), ctx.getClass()],
    );
    if (isPublic) return true;

    const required =
      this.reflector.getAllAndOverride<string[] | undefined>(
        REQUIRE_PERMISSION_KEY,
        [ctx.getHandler(), ctx.getClass()],
      ) ?? [];

    if (required.length === 0) return true;

    const req = ctx
      .switchToHttp()
      .getRequest<Request & { user?: RequestUser }>();
    if (!req.user) {
      throw new UnauthorizedException({ code: "auth.unauthenticated" });
    }

    const have = await this.permissions.loadUserPermissions(req.user.userId);
    const missing = required.filter((k) => !have.has(k));
    if (missing.length > 0) {
      throw new ForbiddenException({
        code: "auth.forbidden",
        missing,
      });
    }
    return true;
  }
}
