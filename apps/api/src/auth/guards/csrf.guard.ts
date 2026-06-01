import {
  type CanActivate,
  type ExecutionContext,
  ForbiddenException,
  Injectable,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { Request } from "express";
import { CSRF_COOKIE, CSRF_HEADER } from "../cookies";
import { IS_PUBLIC_KEY } from "../decorators/public.decorator";
import type { RequestUser } from "../decorators/current-user.decorator";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

interface CookieBag {
  [name: string]: string | undefined;
}

/**
 * Double-submit CSRF check. On state-changing requests (POST/PUT/PATCH/DELETE)
 * authenticated via cookie, the `X-CSRF-Token` header value must match the
 * `sf_csrf` cookie. Skipped for:
 *   - safe methods,
 *   - @Public() routes,
 *   - requests authenticated via `Authorization: Bearer` (no cookie exposure).
 */
@Injectable()
export class CsrfGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(ctx: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean | undefined>(
      IS_PUBLIC_KEY,
      [ctx.getHandler(), ctx.getClass()],
    );
    if (isPublic) return true;

    const req = ctx
      .switchToHttp()
      .getRequest<Request & { cookies?: CookieBag; user?: RequestUser }>();

    if (SAFE_METHODS.has(req.method)) return true;
    if (req.user?.authVia === "bearer") return true;

    const cookieValue = req.cookies?.[CSRF_COOKIE];
    const headerValue = req.headers[CSRF_HEADER];

    if (
      !cookieValue ||
      typeof headerValue !== "string" ||
      headerValue !== cookieValue
    ) {
      throw new ForbiddenException({ code: "auth.csrf_failed" });
    }
    return true;
  }
}
