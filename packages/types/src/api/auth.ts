/**
 * Auth response shapes — mirror apps/api/src/auth/auth.service.ts.
 * Keep field names in sync; the API is the source of truth.
 */

export type RoleKey = "super_admin" | "hr_admin" | "manager" | "employee";
export type DefaultPortal = "admin" | "employee";

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

/** Successful auth — set by signup / signin (no 2FA) / verify-2fa / accept-invite. */
export interface AuthSuccess {
  user: AuthUser;
  organization: AuthOrganization;
  defaultPortal: DefaultPortal;
}

export interface TwoFactorChallenge {
  challenge: {
    id: string;
    kind: "totp" | "dev_otp";
    expiresAt: string;
  };
}

/** POST /auth/signin → 200, can be either branch. */
export type SignInResponse = AuthSuccess | TwoFactorChallenge;

/** POST /auth/signup → 201. */
export type SignUpResponse = AuthSuccess;

/** POST /auth/verify-2fa → 200. */
export type VerifyTwoFactorResponse = AuthSuccess;

/** POST /auth/accept-invite → 200. */
export type AcceptInviteResponse = AuthSuccess;

/** POST /auth/forgot-password → 200. devResetUrl is dev-only. */
export interface ForgotPasswordResponse {
  ok: true;
  devResetUrl?: string;
}

/** POST /auth/reset-password → 200. */
export interface ResetPasswordResponse {
  ok: true;
}

/** GET /auth/invite?token=... → 200. */
export interface InvitePeekResponse {
  email: string;
  organization: AuthOrganization;
  roleKey: RoleKey;
  expiresAt: string;
}

/** GET /auth/me → 200. */
export interface MeResponse {
  user: AuthUser & {
    organizationId: string;
    defaultPortal: DefaultPortal;
  };
}

/** Roles that get the admin portal as their default destination. */
export const ADMIN_ROLES: ReadonlySet<RoleKey> = new Set([
  "super_admin",
  "hr_admin",
  "manager",
]);

export function defaultPortalForRole(role: RoleKey): DefaultPortal {
  return ADMIN_ROLES.has(role) ? "admin" : "employee";
}

export function isTwoFactorChallenge(
  res: SignInResponse,
): res is TwoFactorChallenge {
  return "challenge" in res;
}
