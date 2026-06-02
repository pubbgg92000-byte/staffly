/**
 * Unit tests for leave-rules pure helpers — no DB, no Nest.
 */
import { describe, expect, it } from "vitest";
import {
  availableBalance,
  computeUnits,
  rangesOverlap,
} from "../../src/leave/leave-rules";

describe("computeUnits", () => {
  it("single-day full = 1.0", () => {
    expect(
      computeUnits({
        startDate: "2026-06-02",
        endDate: "2026-06-02",
        halfDayStart: false,
        halfDayEnd: false,
      }),
    ).toBe(1);
  });

  it("single-day half (halfDayStart) = 0.5", () => {
    expect(
      computeUnits({
        startDate: "2026-06-02",
        endDate: "2026-06-02",
        halfDayStart: true,
        halfDayEnd: false,
      }),
    ).toBe(0.5);
  });

  it("multi-day full range", () => {
    expect(
      computeUnits({
        startDate: "2026-06-01",
        endDate: "2026-06-05",
        halfDayStart: false,
        halfDayEnd: false,
      }),
    ).toBe(5);
  });

  it("multi-day with half at start", () => {
    expect(
      computeUnits({
        startDate: "2026-06-01",
        endDate: "2026-06-03",
        halfDayStart: true,
        halfDayEnd: false,
      }),
    ).toBe(2.5);
  });

  it("multi-day with half on both ends", () => {
    expect(
      computeUnits({
        startDate: "2026-06-01",
        endDate: "2026-06-04",
        halfDayStart: true,
        halfDayEnd: true,
      }),
    ).toBe(3);
  });

  it("invalid range yields 0", () => {
    expect(
      computeUnits({
        startDate: "2026-06-05",
        endDate: "2026-06-01",
        halfDayStart: false,
        halfDayEnd: false,
      }),
    ).toBe(0);
  });

  describe("holiday exclusion", () => {
    it("subtracts each holiday day in the range", () => {
      expect(
        computeUnits({
          startDate: "2026-06-01",
          endDate: "2026-06-05",
          halfDayStart: false,
          halfDayEnd: false,
          holidayDates: new Set(["2026-06-03"]),
        }),
      ).toBe(4);
    });

    it("subtracts multiple holidays in the range", () => {
      expect(
        computeUnits({
          startDate: "2026-06-01",
          endDate: "2026-06-05",
          halfDayStart: false,
          halfDayEnd: false,
          holidayDates: new Set(["2026-06-02", "2026-06-04"]),
        }),
      ).toBe(3);
    });

    it("ignores holiday dates outside the range", () => {
      expect(
        computeUnits({
          startDate: "2026-06-01",
          endDate: "2026-06-03",
          halfDayStart: false,
          halfDayEnd: false,
          holidayDates: new Set(["2026-05-31", "2026-06-04"]),
        }),
      ).toBe(3);
    });

    it("single-day request on a holiday yields 0", () => {
      expect(
        computeUnits({
          startDate: "2026-06-02",
          endDate: "2026-06-02",
          halfDayStart: false,
          halfDayEnd: false,
          holidayDates: new Set(["2026-06-02"]),
        }),
      ).toBe(0);
    });

    it("single-day half-day request on a holiday yields 0 (not 0.5)", () => {
      expect(
        computeUnits({
          startDate: "2026-06-02",
          endDate: "2026-06-02",
          halfDayStart: true,
          halfDayEnd: false,
          holidayDates: new Set(["2026-06-02"]),
        }),
      ).toBe(0);
    });

    it("half-day boundary on a holiday ignores the half-day flag", () => {
      // 3-day range with halfDayStart=true; start is a holiday.
      // Without holiday: 3 - 0.5 = 2.5.
      // With holiday on start: subtract 1 (holiday) + ignore halfDayStart → 2.
      expect(
        computeUnits({
          startDate: "2026-06-01",
          endDate: "2026-06-03",
          halfDayStart: true,
          halfDayEnd: false,
          holidayDates: new Set(["2026-06-01"]),
        }),
      ).toBe(2);
    });

    it("half-day on a non-holiday boundary still applies", () => {
      // halfDayStart on a non-holiday day; middle day is a holiday.
      // total = 3, holiday = 1, halfDayStart = -0.5 → 1.5.
      expect(
        computeUnits({
          startDate: "2026-06-01",
          endDate: "2026-06-03",
          halfDayStart: true,
          halfDayEnd: false,
          holidayDates: new Set(["2026-06-02"]),
        }),
      ).toBe(1.5);
    });

    it("all-holiday range yields 0", () => {
      expect(
        computeUnits({
          startDate: "2026-06-01",
          endDate: "2026-06-03",
          halfDayStart: false,
          halfDayEnd: false,
          holidayDates: new Set([
            "2026-06-01",
            "2026-06-02",
            "2026-06-03",
          ]),
        }),
      ).toBe(0);
    });
  });
});

describe("rangesOverlap", () => {
  const d = (s: string): Date => new Date(s);
  it("identical ranges overlap", () => {
    expect(
      rangesOverlap(
        { startDate: d("2026-06-01"), endDate: d("2026-06-05") },
        { startDate: d("2026-06-01"), endDate: d("2026-06-05") },
      ),
    ).toBe(true);
  });
  it("touching at one day overlaps", () => {
    expect(
      rangesOverlap(
        { startDate: d("2026-06-01"), endDate: d("2026-06-03") },
        { startDate: d("2026-06-03"), endDate: d("2026-06-05") },
      ),
    ).toBe(true);
  });
  it("disjoint ranges do not overlap", () => {
    expect(
      rangesOverlap(
        { startDate: d("2026-06-01"), endDate: d("2026-06-03") },
        { startDate: d("2026-06-04"), endDate: d("2026-06-05") },
      ),
    ).toBe(false);
  });
});

describe("availableBalance", () => {
  it("computes allocated+carry+adjusted - used - pending", () => {
    expect(
      availableBalance({
        allocated: 12,
        carryForward: 6,
        adjusted: 0,
        used: 4,
        pending: 2,
      }),
    ).toBe(12);
  });

  it("adjusted can be negative", () => {
    expect(
      availableBalance({
        allocated: 10,
        carryForward: 0,
        adjusted: -3,
        used: 1,
        pending: 0,
      }),
    ).toBe(6);
  });
});
