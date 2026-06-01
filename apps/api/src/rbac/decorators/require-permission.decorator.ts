import { SetMetadata } from "@nestjs/common";

export const REQUIRE_PERMISSION_KEY = "rbac:requirePermissions";

/**
 * Require ALL of the listed permission keys for the route. Empty list is
 * treated as "no permission check" — equivalent to omitting the decorator.
 */
export const RequirePermission = (
  ...keys: string[]
): MethodDecorator & ClassDecorator =>
  SetMetadata(REQUIRE_PERMISSION_KEY, keys);
