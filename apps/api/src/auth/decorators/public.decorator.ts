import { SetMetadata } from "@nestjs/common";

export const IS_PUBLIC_KEY = "auth:isPublic";

/** Marks a route as exempt from JwtAuthGuard, CsrfGuard and PermissionGuard. */
export const Public = (): MethodDecorator & ClassDecorator =>
  SetMetadata(IS_PUBLIC_KEY, true);
