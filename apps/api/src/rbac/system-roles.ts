/**
 * System role catalog loader.
 *
 * Source of truth: apps/api/src/seeds/role-permissions.json. Imported
 * statically via `resolveJsonModule` so the data ships inline with the
 * compiled bundle (no runtime fs read, no dist-asset copy step).
 */
import rawCatalog from "../seeds/role-permissions.json";

export type RoleKey = "super_admin" | "hr_admin" | "manager" | "employee";

export interface PermissionEntry {
  key: string;
  resource: string;
  action: string;
  description: string;
}

export interface RoleEntry {
  key: RoleKey;
  name: string;
  description: string;
  isSystem: boolean;
  /** Either the literal string `"*"` (means: all permissions) or an explicit list. */
  permissions: "*" | string[];
}

interface Catalog {
  permissions: PermissionEntry[];
  roles: RoleEntry[];
}

const catalog = rawCatalog as unknown as Catalog;

export const ALL_PERMISSIONS: readonly PermissionEntry[] = Object.freeze(
  catalog.permissions,
);
export const ALL_PERMISSION_KEYS: readonly string[] = Object.freeze(
  catalog.permissions.map((p) => p.key),
);
export const SYSTEM_ROLES: readonly RoleEntry[] = Object.freeze(catalog.roles);

/**
 * Highest to lowest. A user with multiple roles is presented to the API as the
 * highest-precedence one in this list (used for `/auth/me`'s singular `role`
 * projection).
 */
export const ROLE_PRECEDENCE: readonly RoleKey[] = Object.freeze([
  "super_admin",
  "hr_admin",
  "manager",
  "employee",
]);

export function highestRole(roleKeys: readonly string[]): RoleKey | undefined {
  for (const r of ROLE_PRECEDENCE) {
    if (roleKeys.includes(r)) return r;
  }
  return undefined;
}

/** Expand a role's permission set, handling the `"*"` sentinel. */
export function expandRolePermissions(role: RoleEntry): readonly string[] {
  if (role.permissions === "*") return ALL_PERMISSION_KEYS;
  return role.permissions;
}
