/**
 * Local-date math helpers for attendance. We use Intl's `formatToParts` with
 * IANA timezone identifiers (e.g. "Asia/Kolkata") to compute the employee's
 * local calendar date without pulling in a tz library.
 */

/** Return the YYYY-MM-DD calendar date that `at` falls on in `tz`. */
export function localDateInTimezone(at: Date, tz: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(at);
  const y = parts.find((p) => p.type === "year")?.value ?? "1970";
  const m = parts.find((p) => p.type === "month")?.value ?? "01";
  const d = parts.find((p) => p.type === "day")?.value ?? "01";
  return `${y}-${m}-${d}`;
}

/** Parse "HH:MM" into total minutes since midnight. */
export function hhmmToMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map((s) => Number.parseInt(s, 10));
  return (h ?? 0) * 60 + (m ?? 0);
}

/** Local time-of-day (minutes from midnight) for `at` in `tz`. */
export function localMinutesInTimezone(at: Date, tz: string): number {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: tz,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(at);
  const h = Number.parseInt(
    parts.find((p) => p.type === "hour")?.value ?? "0",
    10,
  );
  const m = Number.parseInt(
    parts.find((p) => p.type === "minute")?.value ?? "0",
    10,
  );
  return h * 60 + m;
}
