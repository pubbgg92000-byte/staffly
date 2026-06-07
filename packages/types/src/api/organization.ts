/**
 * Wire shapes for the v0.23 Organization profile, branding, and key/value
 * settings surface. Mirrors apps/api/src/organization/{dto,organization.service}.ts
 * — keep field names in lockstep; the API is the source of truth.
 */

export type OrgPlan = "trial" | "starter" | "growth" | "scale";
export type OrgStatus = "active" | "suspended" | "trial_expired";

/** GET /organization → 200. PATCH /organization → 200 (same shape). */
export interface OrganizationProfile {
  id: string;
  name: string;
  slug: string;
  legalName: string | null;
  domain: string | null;
  /** Re-presigned GET URL for the logo object, or null when unset/unconfigured. */
  logoUrl: string | null;
  primaryColor: string;
  timezone: string;
  locale: string;
  currency: string;
  weekStart: number;
  billingEmail: string | null;
  plan: OrgPlan;
  status: OrgStatus;
  trialEndsAt: string | null;
  createdAt: string;
  updatedAt: string;
}

/** PATCH /organization body. Every field optional; service rejects unknown keys. */
export interface UpdateOrganizationInput {
  name?: string;
  legalName?: string | null;
  domain?: string | null;
  primaryColor?: string;
  timezone?: string;
  locale?: string;
  currency?: string;
  weekStart?: number;
  billingEmail?: string | null;
}

/** POST /organization/logo/presign-upload body. */
export interface LogoPresignInput {
  fileName: string;
  mimeType: string;
  sizeBytes: number;
}

/** POST /organization/logo/presign-upload → 200. */
export interface LogoPresignResponse {
  url: string;
  key: string;
  expiresIn: number;
}

/** PATCH /organization/settings body — dotted lowercase keys. */
export type UpdateOrgSettingsInput = Record<string, unknown>;

/** GET /organization/settings → 200. */
export type OrgSettings = Record<string, unknown>;
