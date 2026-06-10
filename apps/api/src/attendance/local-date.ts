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

/**
 * The UTC offset of `tz` at instant `at`, in minutes (e.g. -420 for
 * America/Los_Angeles in summer, +330 for Asia/Kolkata). Derived by formatting
 * the same instant as a wall-clock time in `tz` and comparing to UTC — no tz
 * database dependency.
 */
export function tzOffsetMinutes(at: Date, tz: string): number {
  // "en-CA" + the explicit fields give a stable, parseable local wall time.
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(at);
  const get = (t: string): number =>
    Number.parseInt(parts.find((p) => p.type === t)?.value ?? "0", 10);
  // Reconstruct the wall-clock as if it were UTC, then diff against the real
  // instant: that difference is the zone's offset at `at`.
  const asUtc = Date.UTC(
    get("year"),
    get("month") - 1,
    get("day"),
    get("hour") === 24 ? 0 : get("hour"),
    get("minute"),
    get("second"),
  );
  return Math.round((asUtc - at.getTime()) / 60_000);
}

/**
 * The UTC `Date` corresponding to a wall-clock time (hh:mm) on calendar date
 * `dateOnlyUtc` *as observed in `tz`*. Inverse of {@link localDateInTimezone} /
 * {@link localMinutesInTimezone}: for any returned instant `r`,
 * `localDateInTimezone(r, tz)` equals the date of `dateOnlyUtc` and
 * `localMinutesInTimezone(r, tz)` equals `hh*60+mm`.
 *
 * `dateOnlyUtc` is a Date whose UTC Y/M/D name the local calendar day (the seed
 * stores attendanceDate that way). We seed the guess at that wall time, then
 * correct by the zone offset (two passes handle the offset changing across the
 * guess, e.g. near a DST transition).
 */
export function localWallTimeToUtc(
  tz: string,
  dateOnlyUtc: Date,
  hh: number,
  mm = 0,
): Date {
  const baseUtcMs = Date.UTC(
    dateOnlyUtc.getUTCFullYear(),
    dateOnlyUtc.getUTCMonth(),
    dateOnlyUtc.getUTCDate(),
    hh,
    mm,
    0,
    0,
  );
  // First correction using the offset at the naive guess…
  let guess = new Date(
    baseUtcMs - tzOffsetMinutes(new Date(baseUtcMs), tz) * 60_000,
  );
  // …then re-evaluate the offset at the corrected instant and fix any residual
  // (matters only when the first guess landed on the wrong side of a DST jump).
  const off2 = tzOffsetMinutes(guess, tz);
  guess = new Date(baseUtcMs - off2 * 60_000);
  return guess;
}
