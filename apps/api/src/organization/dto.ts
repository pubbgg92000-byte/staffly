import { z } from "zod";

/** 6-digit hex only (locked decision). Stored in Organization.primaryColor. */
const HEX_COLOR = /^#[0-9A-Fa-f]{6}$/;

/** Pragmatic BCP-47: language(-Script)?(-REGION|-nnn)?. */
const BCP47 = /^[A-Za-z]{2,3}(-[A-Za-z]{4})?(-([A-Za-z]{2}|[0-9]{3}))?$/;

/** Active ISO-4217 alphabetic currency codes. */
const ISO_4217 = new Set(
  (
    "AED AFN ALL AMD ANG AOA ARS AUD AWG AZN BAM BBD BDT BGN BHD BIF BMD BND " +
    "BOB BRL BSD BTN BWP BYN BZD CAD CDF CHF CLP CNY COP CRC CUP CVE CZK DJF " +
    "DKK DOP DZD EGP ERN ETB EUR FJD FKP GBP GEL GHS GIP GMD GNF GTQ GYD HKD " +
    "HNL HRK HTG HUF IDR ILS INR IQD IRR ISK JMD JOD JPY KES KGS KHR KMF KPW " +
    "KRW KWD KYD KZT LAK LBP LKR LRD LSL LYD MAD MDL MGA MKD MMK MNT MOP MRU " +
    "MUR MVR MWK MXN MYR MZN NAD NGN NIO NOK NPR NZD OMR PAB PEN PGK PHP PKR " +
    "PLN PYG QAR RON RSD RUB RWF SAR SBD SCR SDG SEK SGD SHP SLE SLL SOS SRD " +
    "SSP STN SVC SYP SZL THB TJS TMT TND TOP TRY TTD TWD TZS UAH UGX USD UYU " +
    "UZS VED VES VND VUV WST XAF XCD XOF XPF YER ZAR ZMW ZWL"
  ).split(" "),
);

function isValidTimezone(tz: string): boolean {
  try {
    // Throws RangeError on an unknown IANA zone.
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/**
 * Organization profile patch (A-SET-001). Every field optional; `.strict()`
 * rejects unknown keys so `slug`, `plan`, `status`, `id` can never be set here.
 * `primaryColor` doubles as the branding update (A-SET-002).
 */
export const UpdateOrganizationBody = z
  .object({
    name: z.string().trim().min(1).max(120).optional(),
    legalName: z.string().trim().max(180).nullable().optional(),
    domain: z.string().trim().max(180).nullable().optional(),
    primaryColor: z
      .string()
      .regex(HEX_COLOR, "primaryColor must be a 6-digit hex like #1A2B3C")
      .optional(),
    timezone: z
      .string()
      .max(64)
      .refine(isValidTimezone, "timezone must be a valid IANA name")
      .optional(),
    locale: z
      .string()
      .trim()
      .max(16)
      .regex(BCP47, "locale must be a BCP-47 tag")
      .optional(),
    currency: z
      .string()
      .trim()
      .length(3)
      .transform((c) => c.toUpperCase())
      .refine((c) => ISO_4217.has(c), "currency must be an ISO-4217 code")
      .optional(),
    weekStart: z.coerce.number().int().min(0).max(6).optional(),
    billingEmail: z.string().trim().email().max(254).nullable().optional(),
  })
  .strict();
export type UpdateOrganizationBodyT = z.infer<typeof UpdateOrganizationBody>;

/** Allowed logo mime types + 2 MB cap (locked: image only, ≤2 MB). */
const LOGO_MIME = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/svg+xml",
  "image/gif",
]);
const MAX_LOGO_BYTES = 2 * 1024 * 1024;

export const LogoPresignBody = z.object({
  fileName: z.string().trim().min(1).max(255),
  mimeType: z
    .string()
    .refine((m) => LOGO_MIME.has(m), "logo must be a PNG, JPEG, WEBP, SVG or GIF"),
  sizeBytes: z
    .number()
    .int()
    .positive()
    .max(MAX_LOGO_BYTES, "logo must be 2 MB or smaller"),
});
export type LogoPresignBodyT = z.infer<typeof LogoPresignBody>;

export const ConfirmLogoBody = z.object({
  key: z.string().trim().min(1).max(512),
});
export type ConfirmLogoBodyT = z.infer<typeof ConfirmLogoBody>;

/** Org settings key/value patch (A-SET-001 extras). Dotted lowercase keys. */
const SETTING_KEY = z
  .string()
  .regex(/^[a-z][a-z0-9_]*(\.[a-z0-9_]+)*$/, "invalid setting key")
  .max(100);

export const UpdateOrgSettingsBody = z
  .record(SETTING_KEY, z.unknown())
  .refine((o) => Object.keys(o).length > 0, "no settings provided");
export type UpdateOrgSettingsBodyT = z.infer<typeof UpdateOrgSettingsBody>;
