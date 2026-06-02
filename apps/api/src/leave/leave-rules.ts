/**
 * Pure helpers for leave-request math. No I/O. Used by LeaveRequestsService.
 *
 * Holiday exclusion is honored by passing `holidayDates` (a set of ISO
 * YYYY-MM-DD strings) into `computeUnits`. Weekend handling is a separate
 * concern tied to the (not-yet-modeled) per-org working-day policy.
 */

/** Days between two ISO YYYY-MM-DD calendar dates, inclusive. */
function daysInclusive(startIso: string, endIso: string): number {
  const start = Date.parse(`${startIso}T00:00:00Z`);
  const end = Date.parse(`${endIso}T00:00:00Z`);
  if (Number.isNaN(start) || Number.isNaN(end)) return 0;
  return Math.round((end - start) / 86_400_000) + 1;
}

/** Step `startIso` forward by `days` days, returning a new YYYY-MM-DD string. */
function addDaysIso(startIso: string, days: number): string {
  const t = Date.parse(`${startIso}T00:00:00Z`) + days * 86_400_000;
  return new Date(t).toISOString().slice(0, 10);
}

export interface UnitsInput {
  startDate: string;
  endDate: string;
  halfDayStart: boolean;
  halfDayEnd: boolean;
  /** ISO YYYY-MM-DD dates inside `[startDate, endDate]` to subtract. */
  holidayDates?: ReadonlySet<string>;
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
 *
 * Holiday handling: any date in `holidayDates` that falls within
 * `[startDate, endDate]` is excluded. If `startDate` or `endDate` is itself
 * a holiday, that day's half-day flag is ignored (a half-day on a holiday
 * is 0, not 0.5).
 */
export function computeUnits(input: UnitsInput): number {
  const total = daysInclusive(input.startDate, input.endDate);
  if (total <= 0) return 0;
  const holidays = input.holidayDates ?? new Set<string>();
  const startIsHoliday = holidays.has(input.startDate);
  const endIsHoliday = holidays.has(input.endDate);

  if (total === 1) {
    if (startIsHoliday) return 0;
    return input.halfDayStart ? 0.5 : 1;
  }

  let holidayCount = 0;
  if (holidays.size > 0) {
    for (let i = 0; i < total; i++) {
      if (holidays.has(addDaysIso(input.startDate, i))) holidayCount += 1;
    }
  }

  let units = total - holidayCount;
  if (input.halfDayStart && !startIsHoliday) units -= 0.5;
  if (input.halfDayEnd && !endIsHoliday) units -= 0.5;
  return units < 0 ? 0 : units;
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
