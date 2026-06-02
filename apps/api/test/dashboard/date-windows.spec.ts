/**
 * Unit tests for the pure date-window helpers. No DB.
 */
import { describe, expect, it } from "vitest";
import {
  addDaysUTC,
  daysAgoWindow,
  denseDailySeries,
  isoDayKey,
  startOfDayUTC,
  startOfMonthUTC,
} from "../../src/dashboard/date-windows";

describe("date-windows", () => {
  it("startOfDayUTC truncates to midnight", () => {
    const d = new Date("2026-06-15T14:32:11.123Z");
    expect(startOfDayUTC(d).toISOString()).toBe("2026-06-15T00:00:00.000Z");
  });

  it("startOfMonthUTC returns day 1 at midnight", () => {
    const d = new Date("2026-06-15T14:32:11.123Z");
    expect(startOfMonthUTC(d).toISOString()).toBe("2026-06-01T00:00:00.000Z");
  });

  it("daysAgoWindow(7) is inclusive on both ends — 7 day-keys", () => {
    const now = new Date("2026-06-15T10:00:00.000Z");
    const w = daysAgoWindow(7, now);
    expect(w.to.toISOString()).toBe("2026-06-15T00:00:00.000Z");
    expect(w.from.toISOString()).toBe("2026-06-09T00:00:00.000Z");
  });

  it("daysAgoWindow(1) collapses to today only", () => {
    const now = new Date("2026-06-15T10:00:00.000Z");
    const w = daysAgoWindow(1, now);
    expect(w.from.toISOString()).toBe(w.to.toISOString());
  });

  it("daysAgoWindow rejects non-positive values", () => {
    expect(() => daysAgoWindow(0)).toThrow();
  });

  it("addDaysUTC handles month rollover", () => {
    const d = new Date("2026-01-30T00:00:00.000Z");
    expect(addDaysUTC(d, 5).toISOString()).toBe("2026-02-04T00:00:00.000Z");
  });

  it("denseDailySeries fills gaps with zero", () => {
    const now = new Date("2026-06-15T10:00:00.000Z");
    const w = daysAgoWindow(3, now); // 2026-06-13, 14, 15
    const rows = [{ date: new Date("2026-06-14T00:00:00.000Z"), value: 5 }];
    const series = denseDailySeries(rows, w, 0);
    expect(series.map((s) => s.date)).toEqual([
      "2026-06-13",
      "2026-06-14",
      "2026-06-15",
    ]);
    expect(series.map((s) => s.value)).toEqual([0, 5, 0]);
  });

  it("isoDayKey is YYYY-MM-DD regardless of time-of-day", () => {
    expect(isoDayKey(new Date("2026-06-15T23:59:59.999Z"))).toBe("2026-06-15");
  });
});
