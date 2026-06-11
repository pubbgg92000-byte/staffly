/**
 * Demo login-password resolution (RC-01-residual).
 *
 * The bug this prevents: `seed-demo.ts` runs via `tsx`, which — unlike the
 * NestJS API boot (`main.ts` calls `process.loadEnvFile`) — does NOT load
 * `apps/api/.env`. So a reseed run without `DEMO_*_PASSWORD` exported used to
 * fall through to a random `strongPassword()` for the three admin accounts,
 * printing them once to the console and losing them — every admin demo login
 * then dead on arrival (this happened: RC-01).
 *
 * Two hardenings, layered:
 *   1. Explicitly load `apps/api/.env` so an operator who set the vars in the
 *      file (the normal case) gets them even under `tsx`.
 *   2. FAIL FAST when a required admin password is still missing, instead of
 *      silently generating an unknown one. The employee account keeps its
 *      published default.
 *
 * Both behaviours are pure functions of an injected env map so they are unit
 * testable without a database — mirroring `loadProfile(env)`.
 */
import { readFileSync } from "node:fs";
import path from "node:path";

export type DemoRole = "super_admin" | "hr_admin" | "manager" | "employee";

/** The published default for the employee demo account (safe to commit). */
export const EMPLOYEE_DEFAULT_PASSWORD = "Employee@123";

/** Minimum length we treat an env-provided password as usable. */
const MIN_PASSWORD_LENGTH = 8;

export const PW_ENV_BY_ROLE: Record<DemoRole, string> = {
  super_admin: "DEMO_SUPERADMIN_PASSWORD",
  hr_admin: "DEMO_HR_PASSWORD",
  manager: "DEMO_MANAGER_PASSWORD",
  employee: "DEMO_EMPLOYEE_PASSWORD",
};

/** Roles that have NO safe public default — missing ⇒ hard error. */
const ADMIN_ROLES: readonly DemoRole[] = ["super_admin", "hr_admin", "manager"];

export type ResolvedPassword = {
  password: string;
  source: "env" | "public demo";
};

/**
 * Parse a dotenv-style file into a plain object WITHOUT mutating
 * `process.env`. Returns `{}` if the file is absent (optional, like main.ts).
 * Minimal parser: `KEY=VALUE` lines, `#` comments, optional surrounding
 * single/double quotes. Good enough for the handful of DEMO_* vars.
 */
export function parseEnvFile(filePath: string): Record<string, string> {
  let raw: string;
  try {
    raw = readFileSync(filePath, "utf8");
  } catch {
    return {};
  }
  const out: Record<string, string> = {};
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    if (!key) continue;
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    out[key] = value;
  }
  return out;
}

/**
 * Merge the real `process.env` over the contents of `apps/api/.env` so an
 * exported var still wins over the file. The `.env` path is resolved relative
 * to this file (`prisma/seed-lib/` → `../../.env`) so it works regardless of
 * `process.cwd()` (turbo/pnpm run from the monorepo root).
 */
export function loadDemoEnv(
  processEnv: NodeJS.ProcessEnv = process.env,
  envFilePath: string = path.resolve(__dirname, "../../.env"),
): Record<string, string | undefined> {
  const fromFile = parseEnvFile(envFilePath);
  return { ...fromFile, ...processEnv };
}

/**
 * Resolve one role's password from the merged env. Admin roles with no env
 * value throw a clear, actionable error (listing every missing var) instead
 * of silently generating an unknown password. The employee role falls back to
 * the published default.
 *
 * Prefer {@link resolveDemoPasswords} which aggregates all missing admin vars
 * into a single error — call this directly only for a single role.
 */
export function resolveDemoPassword(
  role: DemoRole,
  env: Record<string, string | undefined>,
): ResolvedPassword {
  const value = env[PW_ENV_BY_ROLE[role]];
  if (value && value.length >= MIN_PASSWORD_LENGTH) {
    return { password: value, source: "env" };
  }
  if (role === "employee") {
    return { password: EMPLOYEE_DEFAULT_PASSWORD, source: "public demo" };
  }
  throw new MissingDemoPasswordError([role]);
}

export class MissingDemoPasswordError extends Error {
  constructor(public readonly roles: readonly DemoRole[]) {
    const vars = roles.map((r) => PW_ENV_BY_ROLE[r]);
    super(
      `Refusing to seed: required demo admin password(s) missing or too short ` +
        `(min ${MIN_PASSWORD_LENGTH} chars): ${vars.join(", ")}. ` +
        `Set them in apps/api/.env or export them before reseeding — ` +
        `otherwise the admin demo logins would be seeded with unknown ` +
        `random passwords (RC-01).`,
    );
    this.name = "MissingDemoPasswordError";
  }
}

/**
 * Resolve all four demo passwords at once. Aggregates EVERY missing admin var
 * into a single {@link MissingDemoPasswordError} so the operator sees the full
 * list in one run rather than fixing them one at a time.
 */
export function resolveDemoPasswords(
  env: Record<string, string | undefined>,
): Record<DemoRole, ResolvedPassword> {
  const missing: DemoRole[] = [];
  for (const role of ADMIN_ROLES) {
    const value = env[PW_ENV_BY_ROLE[role]];
    if (!value || value.length < MIN_PASSWORD_LENGTH) missing.push(role);
  }
  if (missing.length > 0) throw new MissingDemoPasswordError(missing);

  return {
    super_admin: resolveDemoPassword("super_admin", env),
    hr_admin: resolveDemoPassword("hr_admin", env),
    manager: resolveDemoPassword("manager", env),
    employee: resolveDemoPassword("employee", env),
  };
}
