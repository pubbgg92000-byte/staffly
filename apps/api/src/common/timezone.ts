/**
 * Shared employee-timezone resolver.
 *
 * Fallback order (per docs/02 § 2.2.1 + § 2.3.3):
 *   1. `employee.timezoneOverride`  (per-employee override)
 *   2. `employee.location.timezone`  (location default)
 *   3. `employee.organization.timezone`  (org default)
 *   4. `"Etc/UTC"` (last-resort default; only hit if the org row is missing
 *       a timezone, which the schema's `@default("Etc/UTC")` prevents)
 *
 * Pass a partially-loaded employee — only the three fields below are read.
 * Use this anywhere that converts between server time and the employee's
 * local time (attendance day boundaries, leave dates, etc).
 */

export interface TimezoneEmployee {
  timezoneOverride: string | null;
  location: { timezone: string } | null;
  organization: { timezone: string } | null;
}

export function resolveEmployeeTimezone(employee: TimezoneEmployee): string {
  return (
    employee.timezoneOverride ??
    employee.location?.timezone ??
    employee.organization?.timezone ??
    "Etc/UTC"
  );
}
