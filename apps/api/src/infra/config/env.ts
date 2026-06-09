import { z } from "zod";

const EnvSchema = z.object({
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
  PORT: z.coerce.number().int().positive().default(4000),

  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().url().optional(),

  JWT_SECRET: z.string().min(32),
  ACCESS_TOKEN_TTL_SECONDS: z.coerce.number().int().positive().default(900),
  REFRESH_TOKEN_TTL_SECONDS: z.coerce
    .number()
    .int()
    .positive()
    .default(60 * 60 * 24 * 7),
  /**
   * Extended refresh TTL when the user opts in to "remember me" at sign-in.
   * Defaults to 30 days. Set on the refresh cookie's Max-Age, so the
   * difference is purely browser-side persistence.
   */
  REMEMBER_ME_REFRESH_TTL_SECONDS: z.coerce
    .number()
    .int()
    .positive()
    .default(60 * 60 * 24 * 30),
  /** TTL for password-reset tokens (default 1 hour). */
  PASSWORD_RESET_TTL_SECONDS: z.coerce
    .number()
    .int()
    .positive()
    .default(60 * 60),
  /** TTL for invite tokens (default 7 days). */
  INVITE_TOKEN_TTL_SECONDS: z.coerce
    .number()
    .int()
    .positive()
    .default(60 * 60 * 24 * 7),
  /** TTL for a 2FA challenge (default 5 minutes). */
  TWO_FACTOR_CHALLENGE_TTL_SECONDS: z.coerce
    .number()
    .int()
    .positive()
    .default(5 * 60),
  /** Base URL used to build dev reset/invite links printed to logs. */
  APP_BASE_URL: z.string().url().default("http://localhost:3000"),

  COOKIE_DOMAIN: z.string().default("localhost"),

  /**
   * Comma-separated allowlist of origins permitted to call the API with
   * credentials. The browser's Same-Origin policy needs an explicit echo
   * of the request's `Origin` header — wildcards are not allowed when
   * cookies are involved — so the CORS middleware checks each request's
   * origin against this list and reflects it on a match.
   *
   * Default covers the two dev portals (admin :3000, employee :3001).
   * In production, set this to the public portal hostnames.
   */
  CORS_ORIGINS: z
    .string()
    .default("http://localhost:3000,http://localhost:3001")
    .transform((value) =>
      value
        .split(",")
        .map((s) => s.trim())
        .filter((s) => s.length > 0),
    ),

  // ─── Object storage (MinIO / S3) ─────────────────────────────────────
  // All optional at boot — the StorageService is allowed to construct
  // without them and produce a clear error on first use. Tests stub the
  // client directly.
  S3_ENDPOINT: z.string().url().optional(),
  S3_REGION: z.string().default("us-east-1"),
  S3_BUCKET: z.string().default("staffly-dev"),
  S3_ACCESS_KEY_ID: z.string().optional(),
  S3_SECRET_ACCESS_KEY: z.string().optional(),
  S3_PRESIGN_TTL_SECONDS: z.coerce.number().int().positive().default(900),

  // ─── Observability ───────────────────────────────────────────────────
  // Sentry DSN for the API. Optional — when unset (dev/test/CI) Sentry init
  // is a no-op and nothing is reported.
  SENTRY_DSN: z.string().url().optional(),
});

export type Env = z.infer<typeof EnvSchema>;

let cached: Env | undefined;

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  if (cached) return cached;
  const parsed = EnvSchema.safeParse(source);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `${i.path.join(".")}: ${i.message}`)
      .join("; ");
    throw new Error(`Invalid environment: ${issues}`);
  }
  cached = parsed.data;
  return cached;
}

export function resetEnvCacheForTests(): void {
  cached = undefined;
}
