/**
 * Pure helpers for leave-request math. No I/O. Used by LeaveRequestsService.
 *
 * Holiday and weekend exclusion is a future hook — the schema doesn't yet
 * model an org holiday calendar, and `computeUnits` deliberately counts
 * every calendar day in the [start, end] range. When holidays land, we'll
 * pass in a `holidayDates` set to subtract here.
 */

/** Days between two ISO YYYY-MM-DD calendar dates, inclusive. */
function daysInclusive(startIso: string, endIso: string): number {
  const start = Date.parse(`${startIso}T00:00:00Z`);
  const end = Date.parse(`${endIso}T00:00:00Z`);
  if (Number.isNaN(start) || Number.isNaN(end)) return 0;
  return Math.round((end - start) / 86_400_000) + 1;
}

export interface UnitsInput {
  startDate: string;
  endDate: string;
  halfDayStart: boolean;
  halfDayEnd: boolean;
}

/**
 * Compute leave units (in days) for a request.
 *
 * - Single-day full day      → 1.0
 * - Single-day half day      → 0.5  (halfDayStart=true)
 * - Multi-day full           → endDate - startDate + 1
 * - Multi-day, half at start → days - 0.5
 * - Multi-day, half at end   → days - 0.5
 * - Multi-day, half at both  → days - 1.0
 *
 * Half-day on a single-day request requires `halfDayStart` only; setting
 * `halfDayEnd` on a single-day request is treated as a no-op.
 */
export function computeUnits(input: UnitsInput): number {
  const total = daysInclusive(input.startDate, input.endDate);
  if (total <= 0) return 0;
  if (total === 1) {
    return input.halfDayStart ? 0.5 : 1;
  }
  let units = total;
  if (input.halfDayStart) units -= 0.5;
  if (input.halfDayEnd) units -= 0.5;
  return units;
}

export interface DateRange {
  startDate: Date;
  endDate: Date;
}

/** True iff `[aStart,aEnd]` and `[bStart,bEnd]` share at least one day. */
export function rangesOverlap(a: DateRange, b: DateRange): boolean {
  return a.startDate <= b.endDate && b.startDate <= a.endDate;
}

/**
 * Compute the available balance: allocated + carryForward + adjusted - used - pending.
 * `pending` includes the units locked by in-flight (pending) requests.
 */
export function availableBalance(b: {
  allocated: number;
  carryForward: number;
  adjusted: number;
  used: number;
  pending: number;
}): number {
  return b.allocated + b.carryForward + b.adjusted - b.used - b.pending;
}
