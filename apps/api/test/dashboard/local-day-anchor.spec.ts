/**
 * Frozen-clock tests for the dashboard day-anchoring rule.
 *
 * Attendance rows are dated by the EMPLOYEE's local calendar day at
 * check-in (AttendanceService.checkIn → localDateInTimezone). Dashboards
 * must therefore anchor "today" and trend windows on a LOCAL calendar
 * date (org tz for admin, employee tz for the employee dashboard) — a
 * UTC anchor goes blind around every local midnight:
 *
 *   America/Los_Angeles  17:00–24:00 local  (UTC is already tomorrow)
 *   America/New_York     20:00–24:00 local
 *   Europe/London        23:00–24:00 local  (BST)
 *   Asia/Kolkata         00:00–05:30 local  (UTC is still yesterday)
 *
 * These tests freeze the clock at boundary instants and assert that the
 * local-date anchor (what the dashboards now use) matches the date a
 * check-in at that instant would be stored under, while the old UTC
 * anchor does not. No DB needed — both helpers are pure.
 */
import { describe, expect, it } from "vitest";
import { localDateInTimezone } from "../../src/attendance/local-date";
import { daysAgoWindow, startOfDayUTC } from "../../src/dashboard/date-windows";

/** The anchor the dashboards use: midnight-UTC Date of the local calendar day. */
function localAnchor(now: Date, tz: string): Date {
  return new Date(localDateInTimezone(now, tz));
}

interface BoundaryCase {
  tz: string;
  /** Frozen instant inside the tz's UTC-divergence window. */
  instant: string;
  /** Calendar date a check-in at `instant` is stored under (employee-local). */
  storedDate: string;
  /** UTC calendar date at `instant` — differs from storedDate by design. */
  utcDate: string;
}

// June 2026: US zones on DST (PDT −7, EDT −4), London on BST (+1), Kolkata +5:30.
const BOUNDARY_CASES: BoundaryCase[] = [
  // 18:30 PDT June 10 = 01:30 UTC June 11 — UTC is a day ahead.
  {
    tz: "America/Los_Angeles",
    instant: "2026-06-11T01:30:00.000Z",
    storedDate: "2026-06-10",
    utcDate: "2026-06-11",
  },
  // 21:00 EDT June 10 = 01:00 UTC June 11.
  {
    tz: "America/New_York",
    instant: "2026-06-11T01:00:00.000Z",
    storedDate: "2026-06-10",
    utcDate: "2026-06-11",
  },
  // 23:30 BST June 10 = 22:30 UTC June 10 — same date, but 00:30 BST
  // June 11 = 23:30 UTC June 10 is the divergent window.
  {
    tz: "Europe/London",
    instant: "2026-06-10T23:30:00.000Z",
    storedDate: "2026-06-11",
    utcDate: "2026-06-10",
  },
  // 00:30 IST June 11 = 19:00 UTC June 10 — local is a day ahead.
  {
    tz: "Asia/Kolkata",
    instant: "2026-06-10T19:00:00.000Z",
    storedDate: "2026-06-11",
    utcDate: "2026-06-10",
  },
];

describe("dashboard local-day anchoring at timezone boundaries", () => {
  for (const c of BOUNDARY_CASES) {
    describe(c.tz, () => {
      const now = new Date(c.instant);

      it("check-in date and dashboard anchor agree on the local calendar day", () => {
        // What AttendanceService.checkIn would store at this instant.
        expect(localDateInTimezone(now, c.tz)).toBe(c.storedDate);
        // What the dashboards now anchor "today" on.
        expect(localAnchor(now, c.tz).toISOString().slice(0, 10)).toBe(
          c.storedDate,
        );
      });

      it("the old UTC anchor diverges here (regression guard)", () => {
        expect(startOfDayUTC(now).toISOString().slice(0, 10)).toBe(c.utcDate);
        expect(c.utcDate).not.toBe(c.storedDate);
      });

      it("trend window anchored on the local day includes the stored row's key", () => {
        const anchor = localAnchor(now, c.tz);
        const w7 = daysAgoWindow(7, anchor);
        const rowKey = new Date(c.storedDate);
        expect(rowKey.getTime()).toBeGreaterThanOrEqual(w7.from.getTime());
        expect(rowKey.getTime()).toBeLessThanOrEqual(w7.to.getTime());
        // The old UTC-anchored window drops east-of-UTC "tomorrow" rows.
        const wUtc = daysAgoWindow(7, startOfDayUTC(now));
        const droppedByUtc = rowKey.getTime() > wUtc.to.getTime();
        if (c.storedDate > c.utcDate) expect(droppedByUtc).toBe(true);
      });
    });
  }

  it("away from midnight, local and UTC anchors agree (no overcorrection)", () => {
    // 12:00 UTC June 10: noon-ish everywhere in the demo org's zones.
    const noon = new Date("2026-06-10T12:00:00.000Z");
    for (const tz of [
      "America/Los_Angeles",
      "America/New_York",
      "Europe/London",
      "Asia/Kolkata",
    ]) {
      expect(localAnchor(noon, tz).toISOString().slice(0, 10)).toBe(
        "2026-06-10",
      );
    }
  });

  it("daysAgoWindow with a date-only anchor keeps both bounds at 00:00 UTC", () => {
    const anchor = localAnchor(
      new Date("2026-06-10T19:00:00.000Z"),
      "Asia/Kolkata",
    );
    const w = daysAgoWindow(7, anchor);
    expect(w.to.toISOString()).toBe("2026-06-11T00:00:00.000Z");
    expect(w.from.toISOString()).toBe("2026-06-05T00:00:00.000Z");
  });
});
