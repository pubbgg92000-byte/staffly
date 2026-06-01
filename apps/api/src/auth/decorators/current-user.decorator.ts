import { createParamDecorator, type ExecutionContext } from "@nestjs/common";

export interface RequestUser {
  userId: string;
  organizationId: string;
  /** How the request was authenticated. Used by CsrfGuard. */
  authVia: "cookie" | "bearer";
}

export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): RequestUser | undefined => {
    const req = ctx.switchToHttp().getRequest<{ user?: RequestUser }>();
    return req.user;
  },
);
