import { describe, expect, it } from "vitest";
import {
  localDateInTimezone,
  localMinutesInTimezone,
  localWallTimeToUtc,
  tzOffsetMinutes,
} from "../../src/attendance/local-date";

// A "date-only" Date whose UTC Y/M/D name the local calendar day (the seed
// stores attendanceDate this way: midnight UTC of the calendar date).
function dateOnly(iso: string): Date {
  return new Date(`${iso}T00:00:00.000Z`);
}

describe("localWallTimeToUtc — round-trips across the certification timezones", () => {
  const ZONES = [
    "Asia/Kolkata", // +05:30, no DST
    "America/Los_Angeles", // -08/-07 DST
    "America/New_York", // -05/-04 DST
    "Europe/London", // +00/+01 DST
  ];

  // For each zone, picking 09:00 local on a given day must produce an instant
  // that reads back as 09:00 local on that same calendar day.
  for (const tz of ZONES) {
    it(`09:00 local on a summer day round-trips in ${tz}`, () => {
      const day = dateOnly("2026-07-15");
      const at = localWallTimeToUtc(tz, day, 9, 0);
      expect(localDateInTimezone(at, tz)).toBe("2026-07-15");
      expect(localMinutesInTimezone(at, tz)).toBe(9 * 60);
    });

    it(`09:30 local on a winter day round-trips in ${tz}`, () => {
      const day = dateOnly("2026-01-15");
      const at = localWallTimeToUtc(tz, day, 9, 30);
      expect(localDateInTimezone(at, tz)).toBe("2026-01-15");
      expect(localMinutesInTimezone(at, tz)).toBe(9 * 60 + 30);
    });
  }

  it("produces the correct absolute instant for Kolkata 09:00 (+05:30, fixed)", () => {
    // 09:00 IST == 03:30 UTC.
    const at = localWallTimeToUtc("Asia/Kolkata", dateOnly("2026-06-10"), 9, 0);
    expect(at.toISOString()).toBe("2026-06-10T03:30:00.000Z");
  });

  it("produces the correct absolute instant for LA 09:00 PDT (-07:00 summer)", () => {
    // 09:00 PDT == 16:00 UTC.
    const at = localWallTimeToUtc(
      "America/Los_Angeles",
      dateOnly("2026-07-15"),
      9,
      0,
    );
    expect(at.toISOString()).toBe("2026-07-15T16:00:00.000Z");
  });

  it("produces the correct absolute instant for LA 09:00 PST (-08:00 winter)", () => {
    // 09:00 PST == 17:00 UTC.
    const at = localWallTimeToUtc(
      "America/Los_Angeles",
      dateOnly("2026-01-15"),
      9,
      0,
    );
    expect(at.toISOString()).toBe("2026-01-15T17:00:00.000Z");
  });

  it("handles a post-DST-spring-forward morning (US, 2026-03-08)", () => {
    // After 02:00→03:00 on 2026-03-08, NY is -04:00; 09:00 EDT == 13:00 UTC.
    const at = localWallTimeToUtc(
      "America/New_York",
      dateOnly("2026-03-08"),
      9,
      0,
    );
    expect(localMinutesInTimezone(at, "America/New_York")).toBe(9 * 60);
    expect(at.toISOString()).toBe("2026-03-08T13:00:00.000Z");
  });
});

describe("tzOffsetMinutes", () => {
  it("is +330 for Kolkata year-round", () => {
    expect(
      tzOffsetMinutes(new Date("2026-01-15T00:00:00Z"), "Asia/Kolkata"),
    ).toBe(330);
    expect(
      tzOffsetMinutes(new Date("2026-07-15T00:00:00Z"), "Asia/Kolkata"),
    ).toBe(330);
  });

  it("tracks DST for America/Los_Angeles", () => {
    expect(
      tzOffsetMinutes(new Date("2026-01-15T20:00:00Z"), "America/Los_Angeles"),
    ).toBe(-480); // PST
    expect(
      tzOffsetMinutes(new Date("2026-07-15T20:00:00Z"), "America/Los_Angeles"),
    ).toBe(-420); // PDT
  });
});
