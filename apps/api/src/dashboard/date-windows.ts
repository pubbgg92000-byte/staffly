/**
 * Date-window helpers used by the dashboard aggregations.
 *
 * All functions are pure and return UTC `Date` objects. Tenant-local
 * timezones are handled by callers when displaying — these helpers stay
 * timezone-agnostic so they can be unit-tested without timezone leakage.
 */

/** Truncate to midnight UTC of the same calendar day. */
export function startOfDayUTC(d: Date): Date {
  return new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 0, 0, 0, 0),
  );
}

/** First instant (midnight UTC) of the calendar month containing `d`. */
export function startOfMonthUTC(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1, 0, 0, 0, 0));
}

/**
 * Inclusive window `[from, to]` covering the last `days` calendar days,
 * ending on the day `now` falls on (UTC). `daysAgoWindow(7, now)` → 7
 * entries: that day and the 6 prior days, both bounds at 00:00 UTC.
 *
 * To anchor the window at a tenant-local "today" instead of the UTC date,
 * pass a date-only Date (midnight UTC of the local calendar day, e.g.
 * `new Date(localDateInTimezone(now, tz))`) — truncation is a no-op then.
 */
export function daysAgoWindow(
  days: number,
  now: Date = new Date(),
): { from: Date; to: Date } {
  if (days < 1) throw new RangeError("days must be >= 1");
  const to = startOfDayUTC(now);
  const from = new Date(to);
  from.setUTCDate(from.getUTCDate() - (days - 1));
  return { from, to };
}

/** Add N calendar days to a Date and return a new one (UTC-stable). */
export function addDaysUTC(d: Date, days: number): Date {
  const out = new Date(d);
  out.setUTCDate(out.getUTCDate() + days);
  return out;
}

/**
 * Group an array of `{ date }` rows into buckets keyed by `YYYY-MM-DD`,
 * filling missing days with zeros across the window. Used to turn a
 * sparse Prisma `groupBy` result into a dense daily series the frontend
 * can chart without gap handling.
 */
export function denseDailySeries<T>(
  rows: { date: Date; value: T }[],
  window: { from: Date; to: Date },
  zero: T,
): { date: string; value: T }[] {
  const byDay = new Map<string, T>();
  for (const r of rows) byDay.set(isoDayKey(r.date), r.value);
  const out: { date: string; value: T }[] = [];
  for (let d = new Date(window.from); d <= window.to; d = addDaysUTC(d, 1)) {
    const key = isoDayKey(d);
    out.push({ date: key, value: byDay.get(key) ?? zero });
  }
  return out;
}

/** `YYYY-MM-DD` in UTC — stable cache key for daily buckets. */
export function isoDayKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}
