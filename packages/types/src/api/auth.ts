/**
 * Auth response shapes — mirror apps/api/src/auth/auth.service.ts.
 * Keep field names in sync; the API is the source of truth.
 */

export type RoleKey = "super_admin" | "hr_admin" | "manager" | "employee";

export interface AuthUser {
  id: string;
  email: string;
  role: RoleKey;
}

export interface AuthOrganization {
  id: string;
  slug: string;
  name: string;
}

/** POST /auth/signup → 201 */
export interface SignUpResponse {
  user: AuthUser;
  organization: AuthOrganization;
}

/** POST /auth/signin → 200 */
export interface SignInResponse {
  user: AuthUser;
}

/** GET /auth/me → 200 */
export interface MeResponse {
  user: AuthUser;
}

/** Roles that get the admin portal as their default destination. */
export const ADMIN_ROLES: ReadonlySet<RoleKey> = new Set([
  "super_admin",
  "hr_admin",
  "manager",
]);

export function defaultPortalForRole(role: RoleKey): "admin" | "employee" {
  return ADMIN_ROLES.has(role) ? "admin" : "employee";
}
