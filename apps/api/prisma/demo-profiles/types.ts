/**
 * Profile contract for the demo seed (`seed-demo.ts`).
 *
 * Two locked invariants across every profile:
 *   - `staffly-demo` slug and the pinned org id `019e0000-0000-7000-8000-...001`
 *     are the same on every profile. Profiles never change tenant identity;
 *     they only swap descriptive/locale data so the same pinned org can be
 *     re-seeded as a US tenant or an India tenant.
 *   - The structural seed (40 employees, 90 days of attendance, manager
 *     hierarchy, leave-state mix, announcement/document/notification counts)
 *     is identical across profiles. Counts must stay stable.
 */

export interface DemoProfileOrg {
  name: string;
  legalName: string;
  /** Drives every seeded user/employee email — `superadmin@<domain>`, etc. */
  domain: string;
  primaryColor: string;
  timezone: string;
  locale: string;
  currency: string;
  weekStart: number;
  billingEmail: string;
}

export interface DemoProfileLocation {
  name: string;
  code: string;
  city: string;
  state: string | null;
  country: string;
  tz: string;
}

export interface DemoProfileDesignation {
  name: string;
  level: number;
}

/** `md` is `MM-DD`, combined with the seed's CYCLE_YEAR at insert time. */
export interface DemoProfileHoliday {
  md: string;
  name: string;
}

export interface DemoProfileLogin {
  role: "super_admin" | "hr_admin" | "manager" | "employee";
  emailLocal: string;
  first: string;
  last: string;
  portal: "admin" | "employee";
  dept: string;
  desig: string;
}

export interface DemoProfile {
  key: "us" | "india";
  org: DemoProfileOrg;
  locations: DemoProfileLocation[];
  departments: string[];
  designations: DemoProfileDesignation[];
  firstNames: string[];
  lastNames: string[];
  holidayCalendar: { name: string; code: string };
  holidays: DemoProfileHoliday[];
  logins: DemoProfileLogin[];
  announcementTitles: string[];
  orgDocumentTitles: string[];
}
