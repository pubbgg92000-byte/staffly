import { INDIA_PROFILE } from "./india";
import type { DemoProfile } from "./types";
import { US_PROFILE } from "./us";

export type { DemoProfile } from "./types";
export { US_PROFILE, INDIA_PROFILE };

export const DEMO_PROFILES: Readonly<Record<DemoProfile["key"], DemoProfile>> =
  {
    us: US_PROFILE,
    india: INDIA_PROFILE,
  };

/**
 * Resolve which profile the seed should use.
 *
 * `DEMO_PROFILE=us|india` selects the profile; unset → `us` (default; preserves
 * pre-feature behavior). Unknown values fall back to `us` with a single warning
 * to stderr so a typo can't silently change demo identity.
 */
export function loadProfile(env: NodeJS.ProcessEnv = process.env): DemoProfile {
  const raw = env.DEMO_PROFILE?.trim().toLowerCase() ?? "";
  if (!raw) return US_PROFILE;
  if (raw in DEMO_PROFILES) {
    return DEMO_PROFILES[raw as DemoProfile["key"]];
  }
  console.warn(
    `demo seed: unknown DEMO_PROFILE="${env.DEMO_PROFILE}" — falling back to "us". Valid values: ${Object.keys(DEMO_PROFILES).join(", ")}.`,
  );
  return US_PROFILE;
}
