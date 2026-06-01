import {
  type CanActivate,
  type ExecutionContext,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { Request } from "express";
import { TokensService } from "../tokens.service";
import { ACCESS_COOKIE } from "../cookies";
import { IS_PUBLIC_KEY } from "../decorators/public.decorator";
import type { RequestUser } from "../decorators/current-user.decorator";

interface CookieBag {
  [name: string]: string | undefined;
}

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly tokens: TokensService,
  ) {}

  canActivate(ctx: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean | undefined>(
      IS_PUBLIC_KEY,
      [ctx.getHandler(), ctx.getClass()],
    );
    if (isPublic) return true;

    const req = ctx.switchToHttp().getRequest<
      Request & { cookies?: CookieBag; user?: RequestUser }
    >();

    let token: string | undefined;
    let via: RequestUser["authVia"] = "cookie";

    const authHeader = req.headers.authorization;
    if (typeof authHeader === "string" && authHeader.startsWith("Bearer ")) {
      token = authHeader.slice("Bearer ".length).trim();
      via = "bearer";
    } else if (req.cookies?.[ACCESS_COOKIE]) {
      token = req.cookies[ACCESS_COOKIE];
      via = "cookie";
    }

    if (!token) {
      throw new UnauthorizedException({ code: "auth.unauthenticated" });
    }

    const claims = this.tokens.verifyAccessToken(token);
    req.user = {
      userId: claims.sub,
      organizationId: claims.org,
      authVia: via,
    };
    return true;
  }
}
