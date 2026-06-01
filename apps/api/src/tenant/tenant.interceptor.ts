import {
  type CallHandler,
  type ExecutionContext,
  Injectable,
  type NestInterceptor,
} from "@nestjs/common";
import type { Request } from "express";
import type { Observable } from "rxjs";
import { runWithTenant } from "./tenant-context";
import type { RequestUser } from "../auth/decorators/current-user.decorator";

/**
 * Opens an AsyncLocalStorage tenant context for the duration of the request
 * handler so the Prisma tenant extension auto-scopes every query.
 *
 * Runs as a global interceptor — by the time `intercept()` fires, JwtAuthGuard
 * has already set `req.user` (or short-circuited the request). If no user is
 * present (e.g. on @Public() routes such as signup), we skip wrapping; the
 * extension treats "no tenant context" as "pass queries through".
 */
@Injectable()
export class TenantInterceptor implements NestInterceptor {
  intercept(ctx: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = ctx.switchToHttp().getRequest<
      Request & { user?: RequestUser }
    >();
    const user = req.user;
    if (!user) return next.handle();
    return runWithTenant(
      { organizationId: user.organizationId, userId: user.userId },
      () => next.handle(),
    );
  }
}
