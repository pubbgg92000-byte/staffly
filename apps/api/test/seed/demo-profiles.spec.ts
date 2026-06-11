import { describe, expect, it, vi } from "vitest";
import {
  DEMO_PROFILES,
  INDIA_PROFILE,
  US_PROFILE,
  loadProfile,
} from "../../prisma/demo-profiles";
import type { DemoProfile } from "../../prisma/demo-profiles";

describe("loadProfile — DEMO_PROFILE resolution", () => {
  it("returns the US profile when DEMO_PROFILE is unset", () => {
    expect(loadProfile({})).toBe(US_PROFILE);
  });

  it("returns the India profile when DEMO_PROFILE=india", () => {
    expect(loadProfile({ DEMO_PROFILE: "india" })).toBe(INDIA_PROFILE);
  });

  it("returns the US profile when DEMO_PROFILE=us", () => {
    expect(loadProfile({ DEMO_PROFILE: "us" })).toBe(US_PROFILE);
  });

  it("is case-insensitive and trims whitespace", () => {
    expect(loadProfile({ DEMO_PROFILE: " INDIA " })).toBe(INDIA_PROFILE);
    expect(loadProfile({ DEMO_PROFILE: "Us" })).toBe(US_PROFILE);
  });

  it("falls back to US and warns on an unknown value", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    try {
      const got = loadProfile({ DEMO_PROFILE: "atlantis" });
      expect(got).toBe(US_PROFILE);
      expect(warn).toHaveBeenCalledOnce();
      const msg = warn.mock.calls[0]?.[0];
      expect(msg).toContain('DEMO_PROFILE="atlantis"');
      expect(msg).toContain("us, india");
    } finally {
      warn.mockRestore();
    }
  });
});

describe("DEMO_PROFILES — shape invariants", () => {
  const profiles: DemoProfile[] = Object.values(DEMO_PROFILES);

  it("registers exactly the us and india profiles", () => {
    expect(Object.keys(DEMO_PROFILES).sort()).toEqual(["india", "us"]);
  });

  it("each profile has the structural pieces the seed reads", () => {
    for (const p of profiles) {
      expect(p.key).toBe(p.key === "us" ? "us" : "india");
      expect(p.org.name).toBeTruthy();
      expect(p.org.domain).toMatch(/^[a-z0-9-]+\.demo$/);
      expect(p.org.timezone).toBeTruthy();
      expect(p.locations).toHaveLength(6);
      expect(p.departments).toHaveLength(8);
      expect(p.designations.length).toBeGreaterThanOrEqual(8);
      expect(p.firstNames.length).toBeGreaterThanOrEqual(40);
      expect(p.lastNames.length).toBeGreaterThanOrEqual(20);
      expect(p.holidays.length).toBeGreaterThanOrEqual(8);
      expect(p.logins).toHaveLength(4);
      expect(p.logins.map((l) => l.role).sort()).toEqual([
        "employee",
        "hr_admin",
        "manager",
        "super_admin",
      ]);
      expect(p.announcementTitles).toHaveLength(8);
      expect(p.orgDocumentTitles).toHaveLength(8);
    }
  });

  it("holidays use MM-DD format that parses against a calendar year", () => {
    for (const p of profiles) {
      for (const h of p.holidays) {
        expect(h.md).toMatch(/^\d{2}-\d{2}$/);
        const d = new Date(`2026-${h.md}T00:00:00.000Z`);
        expect(Number.isNaN(d.getTime())).toBe(false);
      }
    }
  });

  it("the India profile is India-flavored (Asia/Kolkata, INR, IN locations)", () => {
    expect(INDIA_PROFILE.org.timezone).toBe("Asia/Kolkata");
    expect(INDIA_PROFILE.org.currency).toBe("INR");
    expect(INDIA_PROFILE.org.locale).toBe("en-IN");
    expect(INDIA_PROFILE.locations.every((l) => l.country === "IN")).toBe(true);
    expect(
      INDIA_PROFILE.holidays.find((h) => h.name === "Republic Day")?.md,
    ).toBe("01-26");
    expect(
      INDIA_PROFILE.holidays.find((h) => h.name === "Independence Day")?.md,
    ).toBe("08-15");
  });

  it("the US profile is US-flavored (Eastern, USD)", () => {
    expect(US_PROFILE.org.timezone).toBe("America/New_York");
    expect(US_PROFILE.org.currency).toBe("USD");
    expect(US_PROFILE.org.locale).toBe("en-US");
    expect(
      US_PROFILE.holidays.find((h) => h.name === "Independence Day")?.md,
    ).toBe("07-04");
  });
});
