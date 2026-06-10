/**
 * Demo-readiness seed (Phase B2). Provisions a realistic, actively-used-looking
 * HRMS tenant: one organisation, multiple locations/departments/designations,
 * 40 employees with a manager hierarchy, 90 days of attendance, leave
 * balances + requests in every state, announcements, documents, and
 * notifications — enough that every admin/employee page renders real data and
 * dashboard metrics are populated.
 *
 * Deterministic: all selection uses a seeded PRNG and a fixed call order, so
 * IDs and choices are stable across runs. Absolute dates are anchored to the
 * run date ("last 90 days") so the demo always looks current.
 *
 * Idempotent: the demo org is identified by slug and fully deleted (cascade)
 * before re-creation, so re-running converges to the same end state without
 * unique-constraint conflicts. Only the `staffly-demo` org is touched — other
 * tenants (e.g. staffly-dev) are never modified.
 *
 * Credentials: admin/HR/manager passwords come from env (strong, never
 * committed); a strong random fallback is generated and printed if unset.
 * Only the employee demo account uses a published password.
 *
 *   pnpm --filter @staffly/api db:seed:demo
 *
 * NEVER run against production.
 */
import { PrismaClient } from "@prisma/client";
import argon2 from "argon2";
import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  localDateInTimezone,
  localWallTimeToUtc,
} from "../src/attendance/local-date";
import { DEFAULT_DOCUMENT_CATEGORIES } from "../src/documents/default-document-categories";
import { MANAGER_TEAM_PERMISSIONS } from "../src/rbac/system-roles";
import { makePdf, putObject, seedStorageClient } from "./seed-lib/storage";

type Catalog = {
  permissions: {
    key: string;
    resource: string;
    action: string;
    description: string;
  }[];
  roles: {
    key: "super_admin" | "hr_admin" | "manager" | "employee";
    name: string;
    description: string;
    isSystem: boolean;
    permissions: "*" | string[];
  }[];
};

const catalog = JSON.parse(
  readFileSync(
    path.resolve(__dirname, "../src/seeds/role-permissions.json"),
    "utf8",
  ),
) as Catalog;

const prisma = new PrismaClient();

const ORG_SLUG = "staffly-demo";
const ORG_NAME = "Acme Corporation";
// Pinned so the org id (and thus the whole dataset) is stable across re-seeds.
const ORG_ID = "019e0000-0000-7000-8000-000000000001";
// The org's timezone — "today" and day boundaries are anchored here so the
// seeded dataset matches what the (org-tz-anchored) admin dashboard queries.
const ORG_TZ = "America/New_York";

// ─── Deterministic helpers ─────────────────────────────────────────────────

// mulberry32 — small seeded PRNG. Fixed seed → identical sequence every run.
function makeRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rng = makeRng(0x5741_4646); // "STAF"

/** Deterministic v4-shaped UUID derived from the seeded PRNG. */
function uuid(): string {
  const b = new Uint8Array(16);
  for (let i = 0; i < 16; i++) b[i] = Math.floor(rng() * 256);
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = [...b].map((x) => x.toString(16).padStart(2, "0")).join("");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

const randInt = (min: number, max: number): number =>
  min + Math.floor(rng() * (max - min + 1));
const pick = <T>(arr: readonly T[]): T => arr[Math.floor(rng() * arr.length)]!;
const chance = (p: number): boolean => rng() < p;

function dateOnly(d: Date): Date {
  return new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()),
  );
}
function addDays(d: Date, n: number): Date {
  const x = new Date(d);
  x.setUTCDate(x.getUTCDate() + n);
  return x;
}

// "Today" as the org's local calendar date (not UTC) — keeps the seeded
// "today" aligned with the admin dashboard, which anchors on the org tz. The
// returned Date names the calendar day via its UTC Y/M/D (the attendanceDate
// storage convention).
const TODAY = dateOnly(
  new Date(`${localDateInTimezone(new Date(), ORG_TZ)}T00:00:00.000Z`),
);
const CYCLE_YEAR = TODAY.getUTCFullYear();

async function hash(plain: string): Promise<string> {
  return argon2.hash(plain, {
    type: argon2.argon2id,
    memoryCost: 64 * 1024,
    timeCost: 3,
    parallelism: 2,
  });
}

function strongPassword(): string {
  return `Demo!${randomBytes(9).toString("base64url")}`;
}

// ─── Reference data ─────────────────────────────────────────────────────────

const LOCATIONS = [
  {
    name: "San Francisco HQ",
    code: "SFO",
    city: "San Francisco",
    state: "CA",
    country: "US",
    tz: "America/Los_Angeles",
  },
  {
    name: "New York Office",
    code: "NYC",
    city: "New York",
    state: "NY",
    country: "US",
    tz: "America/New_York",
  },
  {
    name: "Austin Office",
    code: "AUS",
    city: "Austin",
    state: "TX",
    country: "US",
    tz: "America/Chicago",
  },
  {
    name: "London Office",
    code: "LON",
    city: "London",
    state: "England",
    country: "GB",
    tz: "Europe/London",
  },
  {
    name: "Bangalore Office",
    code: "BLR",
    city: "Bengaluru",
    state: "KA",
    country: "IN",
    tz: "Asia/Kolkata",
  },
  {
    name: "Remote",
    code: "RMT",
    city: "Remote",
    state: null,
    country: "US",
    tz: "America/New_York",
  },
];

const DEPARTMENTS = [
  "Engineering",
  "Product",
  "Design",
  "Sales",
  "Marketing",
  "Human Resources",
  "Finance",
  "Customer Success",
];

const DESIGNATIONS = [
  { name: "Intern", level: 1 },
  { name: "Associate", level: 2 },
  { name: "Software Engineer", level: 3 },
  { name: "Senior Software Engineer", level: 4 },
  { name: "Staff Engineer", level: 5 },
  { name: "Team Lead", level: 5 },
  { name: "Engineering Manager", level: 6 },
  { name: "Senior Manager", level: 6 },
  { name: "Analyst", level: 3 },
  { name: "Senior Analyst", level: 4 },
  { name: "Coordinator", level: 2 },
  { name: "Director", level: 7 },
  { name: "Vice President", level: 8 },
];

const FIRST_NAMES = [
  "Olivia",
  "Liam",
  "Emma",
  "Noah",
  "Ava",
  "Ethan",
  "Sophia",
  "Mason",
  "Isabella",
  "Lucas",
  "Mia",
  "Aiden",
  "Amelia",
  "Kai",
  "Harper",
  "Arjun",
  "Priya",
  "Wei",
  "Mei",
  "Diego",
  "Sofia",
  "Omar",
  "Layla",
  "Tariq",
  "Nina",
  "Hugo",
  "Zara",
  "Mateo",
  "Yuki",
  "Ravi",
  "Elena",
  "Marcus",
  "Aisha",
  "Felix",
  "Lena",
  "Carlos",
  "Ingrid",
  "Sanjay",
  "Chloe",
  "Theo",
];
const LAST_NAMES = [
  "Smith",
  "Johnson",
  "Williams",
  "Brown",
  "Jones",
  "Garcia",
  "Miller",
  "Davis",
  "Rodriguez",
  "Martinez",
  "Hernandez",
  "Lopez",
  "Gonzalez",
  "Wilson",
  "Anderson",
  "Patel",
  "Nguyen",
  "Kim",
  "Chen",
  "Singh",
  "Kumar",
  "Ali",
  "Khan",
  "Okafor",
  "Mwangi",
  "Schmidt",
  "Rossi",
  "Yamamoto",
  "Tanaka",
  "Andersson",
];

const LEAVE_TYPES = [
  {
    name: "Casual Leave",
    code: "CL",
    color: "#3B82F6",
    accrual: 12,
    paid: true,
  },
  { name: "Sick Leave", code: "SL", color: "#EF4444", accrual: 10, paid: true },
  {
    name: "Earned Leave",
    code: "EL",
    color: "#10B981",
    accrual: 18,
    paid: true,
  },
  {
    name: "Work From Home",
    code: "WFH",
    color: "#8B5CF6",
    accrual: 24,
    paid: true,
  },
  {
    name: "Unpaid Leave",
    code: "LWP",
    color: "#94A3B8",
    accrual: 0,
    paid: false,
  },
];

const HOLIDAYS = [
  { md: "01-01", name: "New Year's Day" },
  { md: "01-15", name: "Martin Luther King Jr. Day" },
  { md: "02-19", name: "Presidents' Day" },
  { md: "05-27", name: "Memorial Day" },
  { md: "06-19", name: "Juneteenth" },
  { md: "07-04", name: "Independence Day" },
  { md: "09-02", name: "Labor Day" },
  { md: "11-11", name: "Veterans Day" },
  { md: "11-28", name: "Thanksgiving" },
  { md: "11-29", name: "Day after Thanksgiving" },
  { md: "12-24", name: "Christmas Eve" },
  { md: "12-25", name: "Christmas Day" },
];

// ─── Main ───────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  // 1. Permission catalog (global, idempotent).
  await prisma.$transaction(
    catalog.permissions.map((p) =>
      prisma.permission.upsert({
        where: { key: p.key },
        create: p,
        update: {
          resource: p.resource,
          action: p.action,
          description: p.description,
        },
      }),
    ),
  );

  // 2. Wipe any prior demo org. Most children cascade on org delete, but a
  //    few relations use onDelete: Restrict (User→Organization,
  //    Leave{Balance,Request}→LeaveType, Document→DocumentCategory), which
  //    would block the delete. So we clear the org's rows in dependency order
  //    first, then delete the org. Scoped to the demo org only — never touches
  //    other tenants. (Idempotent: no-ops cleanly when the org doesn't exist.)
  const prior = await prisma.organization.findUnique({
    where: { slug: ORG_SLUG },
    select: { id: true },
  });
  if (prior) {
    const oid = prior.id;
    const where = { organizationId: oid };
    // Leaf/dependent rows first.
    await prisma.leaveApproval.deleteMany({ where });
    await prisma.leaveRequest.deleteMany({ where });
    await prisma.leaveBalance.deleteMany({ where });
    await prisma.leaveType.deleteMany({ where });
    await prisma.attendanceRecord.deleteMany({ where });
    await prisma.attendanceRegularization.deleteMany({ where });
    await prisma.documentAcknowledgement.deleteMany({ where });
    await prisma.documentAudience.deleteMany({ where });
    // Break the Document ⇄ DocumentVersion current-version cycle before delete.
    await prisma.document.updateMany({
      where,
      data: { currentVersionId: null },
    });
    await prisma.documentVersion.deleteMany({ where });
    await prisma.document.deleteMany({ where });
    await prisma.documentCategory.deleteMany({ where });
    await prisma.announcementAcknowledgement.deleteMany({ where });
    await prisma.announcementAudience.deleteMany({ where });
    await prisma.announcement.deleteMany({ where });
    await prisma.notification.deleteMany({ where });
    await prisma.locationHolidayCalendar.deleteMany({ where });
    await prisma.holiday.deleteMany({ where });
    await prisma.holidayCalendar.deleteMany({ where });
    await prisma.attendancePolicy.deleteMany({ where });
    await prisma.employee.deleteMany({ where });
    await prisma.department.deleteMany({ where });
    await prisma.designation.deleteMany({ where });
    await prisma.location.deleteMany({ where });
    await prisma.userRole.deleteMany({ where });
    await prisma.rolePermission.deleteMany({ where });
    await prisma.role.deleteMany({ where });
    await prisma.refreshToken.deleteMany({ where });
    await prisma.user.deleteMany({ where }); // Restrict on org — must precede org delete
    await prisma.orgSetting.deleteMany({ where });
    await prisma.organization.delete({ where: { id: oid } });
  }

  // 3. Organisation with branding.
  const org = await prisma.organization.create({
    data: {
      id: ORG_ID,
      slug: ORG_SLUG,
      name: ORG_NAME,
      legalName: "Acme Corporation, Inc.",
      domain: "acme.demo",
      primaryColor: "#4F46E5",
      timezone: "America/New_York",
      locale: "en-US",
      currency: "USD",
      weekStart: 1,
      billingEmail: "billing@acme.demo",
      plan: "growth",
      status: "active",
    },
  });

  // 4. Roles + role-permission edges.
  const allKeys = catalog.permissions.map((p) => p.key);
  const roleIds: Record<string, string> = {};
  for (const role of catalog.roles) {
    const created = await prisma.role.create({
      data: {
        organizationId: org.id,
        key: role.key,
        name: role.name,
        description: role.description,
        isSystem: role.isSystem,
      },
    });
    roleIds[role.key] = created.id;
    const permKeys = role.permissions === "*" ? allKeys : role.permissions;
    if (permKeys.length > 0) {
      await prisma.rolePermission.createMany({
        data: permKeys.map((permissionKey) => ({
          organizationId: org.id,
          roleId: created.id,
          permissionKey,
          scope:
            role.key === "manager" &&
            MANAGER_TEAM_PERMISSIONS.has(permissionKey)
              ? ("team" as const)
              : undefined,
        })),
        skipDuplicates: true,
      });
    }
  }

  // 5. Document categories (org-scoped).
  await prisma.documentCategory.createMany({
    data: DEFAULT_DOCUMENT_CATEGORIES.map((c) => ({
      id: uuid(),
      organizationId: org.id,
      name: c.name,
      code: c.code,
      color: c.color,
      isPersonal: c.isPersonal,
      isActive: true,
      isSystem: true,
    })),
  });
  const categories = await prisma.documentCategory.findMany({
    where: { organizationId: org.id },
  });

  // 6. Locations.
  const locationRows = LOCATIONS.map((l) => ({
    id: uuid(),
    organizationId: org.id,
    name: l.name,
    code: l.code,
    city: l.city,
    state: l.state,
    country: l.country,
    timezone: l.tz,
  }));
  await prisma.location.createMany({ data: locationRows });

  // 7. Departments + designations.
  const deptRows = DEPARTMENTS.map((name, i) => ({
    id: uuid(),
    organizationId: org.id,
    name,
    code: name.slice(0, 3).toUpperCase() + (i + 1),
  }));
  await prisma.department.createMany({ data: deptRows });

  const desigRows = DESIGNATIONS.map((d) => ({
    id: uuid(),
    organizationId: org.id,
    name: d.name,
    level: d.level,
  }));
  await prisma.designation.createMany({ data: desigRows });

  // 8. Holiday calendar + holidays + assign to all locations.
  const calendarId = uuid();
  await prisma.holidayCalendar.create({
    data: {
      id: calendarId,
      organizationId: org.id,
      name: "US Public Holidays",
      code: "US-PUB",
      isDefault: true,
    },
  });
  await prisma.holiday.createMany({
    data: HOLIDAYS.map((h) => ({
      id: uuid(),
      organizationId: org.id,
      calendarId,
      date: new Date(`${CYCLE_YEAR}-${h.md}T00:00:00.000Z`),
      name: h.name,
      type: "public" as const,
    })),
  });
  await prisma.locationHolidayCalendar.createMany({
    data: locationRows.map((l) => ({
      locationId: l.id,
      organizationId: org.id,
      calendarId,
    })),
  });

  // 9. Default attendance policy.
  await prisma.attendancePolicy.create({
    data: {
      organizationId: org.id,
      name: "Standard 9-6",
      isDefault: true,
      workDays: [1, 2, 3, 4, 5],
      expectedHoursPerDay: 8,
      dayStartTime: "09:00",
      dayEndTime: "18:00",
    },
  });

  // 10. Login accounts (4) — passwords from env, strong fallback if unset.
  // Track the resolved source per role so the summary reports it accurately.
  const pwSource: Record<string, "env" | "public demo" | "generated"> = {};
  function pwFor(role: string, envKey: string, publicDefault?: string): string {
    const fromEnv = process.env[envKey];
    if (fromEnv && fromEnv.length >= 8) {
      pwSource[role] = "env";
      return fromEnv;
    }
    if (publicDefault) {
      pwSource[role] = "public demo";
      return publicDefault;
    }
    pwSource[role] = "generated";
    return strongPassword();
  }
  const LOGINS = [
    {
      role: "super_admin",
      email: "superadmin@acme.demo",
      first: "Sasha",
      last: "Admin",
      pw: pwFor("super_admin", "DEMO_SUPERADMIN_PASSWORD"),
      portal: "admin" as const,
      dept: "Engineering",
      desig: "Director",
    },
    {
      role: "hr_admin",
      email: "hr@acme.demo",
      first: "Hana",
      last: "Reyes",
      pw: pwFor("hr_admin", "DEMO_HR_PASSWORD"),
      portal: "admin" as const,
      dept: "Human Resources",
      desig: "Senior Manager",
    },
    {
      role: "manager",
      email: "manager@acme.demo",
      first: "Marcus",
      last: "Lee",
      pw: pwFor("manager", "DEMO_MANAGER_PASSWORD"),
      portal: "admin" as const,
      dept: "Engineering",
      desig: "Engineering Manager",
    },
    {
      role: "employee",
      email: "employee@acme.demo",
      first: "Alex",
      last: "Doe",
      pw: pwFor("employee", "DEMO_EMPLOYEE_PASSWORD", "Employee@123"),
      portal: "employee" as const,
      dept: "Engineering",
      desig: "Software Engineer",
    },
  ];

  // 11. Employees. First 4 are the login accounts (with user rows); the rest
  //     are records only. Build everything in memory first so manager wiring
  //     and email/code uniqueness are deterministic.
  const TOTAL = 40;
  const empSpecs: {
    id: string;
    code: string;
    first: string;
    last: string;
    workEmail: string;
    deptId: string;
    desigId: string;
    locId: string;
    tz: string;
    employmentType: string;
    workMode: string;
    status: string;
    joinedOn: Date;
    userId: string | null;
    isManager: boolean;
  }[] = [];

  const tzByLocId = new Map(locationRows.map((l) => [l.id, l.timezone]));

  const deptByName = (n: string) => deptRows.find((d) => d.name === n)!.id;
  const desigByName = (n: string) => desigRows.find((d) => d.name === n)!.id;
  const usedEmails = new Set<string>();
  const mkEmail = (f: string, l: string, i: number): string => {
    let e = `${f}.${l}`.toLowerCase().replace(/[^a-z.]/g, "");
    if (usedEmails.has(`${e}@acme.demo`)) e = `${e}${i}`;
    const full = `${e}@acme.demo`;
    usedEmails.add(full);
    return full;
  };

  const employmentTypes = [
    "full_time",
    "full_time",
    "full_time",
    "part_time",
    "contractor",
    "intern",
  ];
  const workModes = ["onsite", "hybrid", "remote"];

  for (let i = 0; i < TOTAL; i++) {
    const id = uuid();
    const code = `EMP-${String(i + 1).padStart(3, "0")}`;
    let first: string, last: string, deptId: string, desigId: string;
    let userId: string | null = null;
    let employmentType = pick(employmentTypes);
    const login = LOGINS[i];
    if (login) {
      first = login.first;
      last = login.last;
      deptId = deptByName(login.dept);
      desigId = desigByName(login.desig);
      userId = uuid();
      employmentType = "full_time";
    } else {
      first = pick(FIRST_NAMES);
      last = pick(LAST_NAMES);
      deptId = pick(deptRows).id;
      desigId = pick(desigRows).id;
    }
    const workEmail = login ? login.email : mkEmail(first, last, i);
    usedEmails.add(workEmail);
    // ~1 in 7 designated as a manager (plus the explicit manager login).
    // The last 3 non-login employees are recent hires (joined this month), so
    // the dashboard "New joins this month" metric is non-zero. New hires are
    // not managers.
    const isRecentJoin = !login && i >= TOTAL - 3;
    const isManager =
      login?.role === "manager" || (!login && !isRecentJoin && chance(0.14));
    const status =
      !login && !isRecentJoin && chance(0.08) ? "on_leave" : "active";
    let joinedOn: Date;
    if (isRecentJoin) {
      const monthStart = new Date(
        Date.UTC(TODAY.getUTCFullYear(), TODAY.getUTCMonth(), 1),
      );
      const candidate = addDays(TODAY, -(2 + (i - (TOTAL - 3)) * 3));
      joinedOn = candidate < monthStart ? monthStart : candidate;
    } else {
      joinedOn = addDays(TODAY, -randInt(180, 1500));
    }
    const locId = pick(locationRows).id;
    empSpecs.push({
      id,
      code,
      first,
      last,
      workEmail,
      deptId,
      desigId,
      locId,
      tz: tzByLocId.get(locId) ?? ORG_TZ,
      employmentType,
      workMode: pick(workModes),
      status,
      joinedOn,
      userId,
      isManager,
    });
  }

  // Manager assignment: each non-manager reports to a random manager in the
  // same department when one exists, else any manager.
  const managers = empSpecs.filter((e) => e.isManager);
  const managersByDept = new Map<string, string[]>();
  for (const m of managers) {
    const arr = managersByDept.get(m.deptId) ?? [];
    arr.push(m.id);
    managersByDept.set(m.deptId, arr);
  }
  const allManagerIds = managers.map((m) => m.id);

  // 11a. Create user rows for the 4 logins.
  for (let i = 0; i < LOGINS.length; i++) {
    const login = LOGINS[i]!;
    const spec = empSpecs[i]!;
    await prisma.user.create({
      data: {
        id: spec.userId!,
        organizationId: org.id,
        email: login.email,
        passwordHash: await hash(login.pw),
        status: "active",
        emailVerifiedAt: new Date(),
        defaultPortal: login.portal,
      },
    });
    await prisma.userRole.create({
      data: {
        organizationId: org.id,
        userId: spec.userId!,
        roleId: roleIds[login.role]!,
      },
    });
  }

  // 11b. Create all employees (managerId resolved).
  await prisma.employee.createMany({
    data: empSpecs.map((e) => {
      let managerId: string | null = null;
      if (!e.isManager) {
        const inDept = (managersByDept.get(e.deptId) ?? []).filter(
          (m) => m !== e.id,
        );
        const poolFrom = inDept.length > 0 ? inDept : allManagerIds;
        managerId =
          poolFrom.length > 0
            ? poolFrom[randInt(0, poolFrom.length - 1)]!
            : null;
      }
      return {
        id: e.id,
        organizationId: org.id,
        userId: e.userId,
        employeeCode: e.code,
        firstName: e.first,
        lastName: e.last,
        displayName: `${e.first} ${e.last}`,
        workEmail: e.workEmail,
        personalEmail: null,
        status: e.status as "active",
        employmentType: e.employmentType as "full_time",
        workMode: e.workMode as "onsite",
        departmentId: e.deptId,
        designationId: e.desigId,
        locationId: e.locId,
        managerId,
        joinedOn: e.joinedOn,
      };
    }),
  });

  // 11c. Department heads = a manager in that department.
  for (const [deptId, mgrs] of managersByDept) {
    if (mgrs.length > 0) {
      await prisma.department.update({
        where: { id: deptId },
        data: { headEmployeeId: mgrs[0]! },
      });
    }
  }

  // 12. Leave types — created BEFORE attendance so approved leave can drive
  // each employee's attendance status (no "present" while on approved leave).
  const leaveTypeRows = LEAVE_TYPES.map((t) => ({
    id: uuid(),
    organizationId: org.id,
    name: t.name,
    code: t.code,
    color: t.color,
    accrualType: "annual" as const,
    accrualAmount: t.accrual,
    isPaid: t.paid,
    requiresApproval: true,
  }));
  await prisma.leaveType.createMany({ data: leaveTypeRows });

  // 12a. Leave requests (in memory). Generated before attendance and kept
  // non-overlapping per employee so the real API's overlap rule is respected
  // and balances reconcile. Each request's [start,end] is recorded.
  const reqSpecs: {
    id: string;
    employeeId: string;
    leaveTypeId: string;
    start: Date;
    end: Date;
    units: number;
    status: string;
    reason: string;
    decidedBy: string | null;
  }[] = [];
  const reasons = [
    "Family vacation",
    "Medical appointment",
    "Personal errand",
    "Wedding to attend",
    "Feeling unwell",
    "Childcare",
    "Relocation",
  ];
  const hrUserId = empSpecs[1]!.userId!; // hr_admin user as approver
  const dayKey = (d: Date): string =>
    `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
  // Per-employee set of dates already occupied by a non-terminal (pending/
  // approved) leave request, to prevent overlaps.
  const occupiedByEmp = new Map<string, Set<string>>();
  // Per-employee set of APPROVED leave dates — attendance reads this so a day
  // on approved leave is recorded as on_leave (never present/half_day).
  const approvedLeaveByEmp = new Map<string, Set<string>>();
  const rangeDates = (start: Date, end: Date): Date[] => {
    const out: Date[] = [];
    for (let d = new Date(start); d <= end; d = addDays(d, 1))
      out.push(new Date(d));
    return out;
  };
  for (const e of empSpecs) {
    const n = randInt(0, 3);
    const occupied = occupiedByEmp.get(e.id) ?? new Set<string>();
    occupiedByEmp.set(e.id, occupied);
    for (let k = 0; k < n; k++) {
      const lt = pick(leaveTypeRows);
      const offset = randInt(-60, 40);
      const len = randInt(1, 4);
      const start = addDays(TODAY, offset);
      const end = addDays(start, len - 1);
      const dates = rangeDates(start, end);
      const statusRoll = rng();
      const status =
        statusRoll < 0.45
          ? "approved"
          : statusRoll < 0.7
            ? "pending"
            : statusRoll < 0.85
              ? "rejected"
              : "cancelled";
      // For pending/approved (the statuses the real API blocks overlaps on),
      // skip if this range collides with an existing one for the employee.
      const blocks = status === "approved" || status === "pending";
      if (blocks && dates.some((d) => occupied.has(dayKey(d)))) continue;
      if (blocks) for (const d of dates) occupied.add(dayKey(d));
      if (status === "approved") {
        const set = approvedLeaveByEmp.get(e.id) ?? new Set<string>();
        for (const d of dates) set.add(dayKey(d));
        approvedLeaveByEmp.set(e.id, set);
      }
      reqSpecs.push({
        id: uuid(),
        employeeId: e.id,
        leaveTypeId: lt.id,
        start,
        end,
        units: len,
        status,
        reason: pick(reasons),
        decidedBy:
          status === "approved" || status === "rejected" ? hrUserId : null,
      });
    }
  }

  // 13. Attendance — last 90 days, weekdays only, skipping holidays. Check-in
  // times are anchored to each employee's LOCAL timezone (~09:00 local), and a
  // day that falls on the employee's approved leave is recorded as on_leave.
  const holidaySet = new Set(HOLIDAYS.map((h) => `${CYCLE_YEAR}-${h.md}`));
  const isHoliday = (d: Date): boolean =>
    holidaySet.has(
      `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`,
    );

  const attendance: {
    id: string;
    organizationId: string;
    employeeId: string;
    attendanceDate: Date;
    checkInAt: Date | null;
    checkOutAt: Date | null;
    workedMinutes: number | null;
    status: string;
    isLate: boolean;
  }[] = [];

  // Last 90 days through TODAY (back === 0). Today is left "in progress":
  // most employees are checked in with no check-out yet, so the admin
  // "Today's attendance" widget and live trend point are populated.
  for (let back = 90; back >= 0; back--) {
    const day = addDays(TODAY, -back);
    const dow = day.getUTCDay();
    if (dow === 0 || dow === 6) continue; // weekend
    if (isHoliday(day)) continue;
    const isToday = back === 0;
    for (const e of empSpecs) {
      if (e.joinedOn > day) continue;
      // An approved leave on this day always yields an on_leave record — never
      // present/half_day — so attendance and leave never contradict.
      if (approvedLeaveByEmp.get(e.id)?.has(dayKey(day))) {
        attendance.push({
          id: uuid(),
          organizationId: org.id,
          employeeId: e.id,
          attendanceDate: day,
          checkInAt: null,
          checkOutAt: null,
          workedMinutes: null,
          status: "on_leave",
          isLate: false,
        });
        continue;
      }
      // ~09:00 LOCAL time for this employee, with a small lateness jitter.
      const checkInAtLocal = (lateMin: number): Date =>
        localWallTimeToUtc(e.tz, day, 9, Math.max(0, lateMin));
      const roll = rng();
      let status: string,
        checkIn: Date | null = null,
        checkOut: Date | null = null,
        worked: number | null = null,
        late = false;
      if (isToday) {
        // In-progress day: checked-in but not yet checked out (no worked
        // minutes), a few not checked in yet (no row).
        if (roll < 0.88) {
          status = "present";
          const lateMin = chance(0.15) ? randInt(16, 75) : randInt(-10, 14);
          late = lateMin > 15;
          checkIn = checkInAtLocal(lateMin);
        } else {
          continue; // not checked in yet → no record for today
        }
      } else if (roll < 0.9) {
        status = "present";
        const lateMin = chance(0.15) ? randInt(16, 75) : randInt(-10, 14);
        late = lateMin > 15;
        checkIn = checkInAtLocal(lateMin);
        const dur = randInt(450, 540);
        checkOut = new Date(checkIn.getTime() + dur * 60_000);
        worked = dur;
      } else if (roll < 0.96) {
        status = "half_day";
        checkIn = checkInAtLocal(randInt(0, 20));
        worked = randInt(180, 240);
        checkOut = new Date(checkIn.getTime() + worked * 60_000);
      } else {
        status = "absent";
      }
      attendance.push({
        id: uuid(),
        organizationId: org.id,
        employeeId: e.id,
        attendanceDate: day,
        checkInAt: checkIn,
        checkOutAt: checkOut,
        workedMinutes: worked,
        status,
        isLate: late,
      });
    }
  }
  // Insert in chunks to keep the statement size sane.
  for (let i = 0; i < attendance.length; i += 1000) {
    await prisma.attendanceRecord.createMany({
      data: attendance.slice(i, i + 1000) as never,
    });
  }

  // 13b. A few pending attendance regularizations (anchored to local office
  // hours of the target employee).
  const regs = empSpecs.slice(4, 10).map((e) => ({
    id: uuid(),
    organizationId: org.id,
    employeeId: e.id,
    attendanceDate: addDays(TODAY, -randInt(3, 20)),
    requestedCheckInAt: localWallTimeToUtc(e.tz, addDays(TODAY, -10), 9, 0),
    requestedCheckOutAt: localWallTimeToUtc(e.tz, addDays(TODAY, -10), 18, 0),
    reason: pick([
      "Forgot to check in — was on a client call.",
      "System was down during check-out.",
      "Worked offsite, badge not registered.",
      "Travel day, checked in late.",
    ]),
    status: "pending" as const,
  }));
  await prisma.attendanceRegularization.createMany({ data: regs });

  // 13b. Leave balances: allocated per type; used = approved, pending = pending.
  const balances: Record<string, { used: number; pending: number }> = {};
  for (const r of reqSpecs) {
    const key = `${r.employeeId}:${r.leaveTypeId}`;
    balances[key] ??= { used: 0, pending: 0 };
    if (r.status === "approved") balances[key]!.used += r.units;
    else if (r.status === "pending") balances[key]!.pending += r.units;
  }
  const balanceRows: unknown[] = [];
  for (const e of empSpecs) {
    for (const lt of leaveTypeRows) {
      const acc = LEAVE_TYPES.find((t) => t.code === lt.code)!.accrual;
      if (acc === 0) continue; // unpaid leave has no balance
      const b = balances[`${e.id}:${lt.id}`] ?? { used: 0, pending: 0 };
      balanceRows.push({
        id: uuid(),
        organizationId: org.id,
        employeeId: e.id,
        leaveTypeId: lt.id,
        cycleYear: CYCLE_YEAR,
        allocated: acc,
        used: b.used,
        pending: b.pending,
      });
    }
  }
  await prisma.leaveBalance.createMany({ data: balanceRows as never });

  // 13c. Create leave requests + approvals for decided ones.
  await prisma.leaveRequest.createMany({
    data: reqSpecs.map((r) => ({
      id: r.id,
      organizationId: org.id,
      employeeId: r.employeeId,
      leaveTypeId: r.leaveTypeId,
      startDate: r.start,
      endDate: r.end,
      units: r.units,
      reason: r.reason,
      status: r.status as "pending",
      decidedAt: r.decidedBy ? addDays(r.start, -2) : null,
      decidedBy: r.decidedBy,
      cancelledAt: r.status === "cancelled" ? addDays(r.start, -1) : null,
    })) as never,
  });
  await prisma.leaveApproval.createMany({
    data: reqSpecs
      .filter((r) => r.decidedBy)
      .map((r) => ({
        id: uuid(),
        organizationId: org.id,
        leaveRequestId: r.id,
        approverUserId: r.decidedBy!,
        decision: (r.status === "approved"
          ? "approved"
          : "rejected") as "approved",
        comment:
          r.status === "approved"
            ? "Approved."
            : "Cannot approve at this time.",
      })) as never,
  });

  // 14. Announcements (varied state) + audiences + some acks.
  const annSpecs = [
    {
      title: "Welcome to the new Staffly portal!",
      priority: "normal",
      status: "published",
      pinned: true,
      ack: false,
    },
    {
      title: "Q3 All-Hands — Thursday 4pm",
      priority: "high",
      status: "published",
      pinned: true,
      ack: true,
    },
    {
      title: "Updated remote-work policy (please acknowledge)",
      priority: "high",
      status: "published",
      pinned: false,
      ack: true,
    },
    {
      title: "Office closed for Thanksgiving week",
      priority: "normal",
      status: "published",
      pinned: false,
      ack: false,
    },
    {
      title: "Annual benefits enrollment opens Monday",
      priority: "normal",
      status: "scheduled",
      pinned: false,
      ack: false,
    },
    {
      title: "Draft: Holiday party planning",
      priority: "low",
      status: "draft",
      pinned: false,
      ack: false,
    },
  ];
  const empIds = empSpecs.map((e) => e.id);
  for (let i = 0; i < annSpecs.length; i++) {
    const a = annSpecs[i]!;
    const annId = uuid();
    const published = a.status === "published";
    await prisma.announcement.create({
      data: {
        id: annId,
        organizationId: org.id,
        title: a.title,
        bodyHtml: `<p>${a.title}</p><p>This is a demo announcement with details about the topic above.</p>`,
        pinned: a.pinned,
        requiresAcknowledgment: a.ack,
        priority: a.priority as "normal",
        status: a.status as "published",
        publishedAt: published ? addDays(TODAY, -randInt(1, 30)) : null,
        scheduledFor: a.status === "scheduled" ? addDays(TODAY, 3) : null,
      },
    });
    await prisma.announcementAudience.create({
      data: {
        id: uuid(),
        organizationId: org.id,
        announcementId: annId,
        audienceType: "all_employees",
      },
    });
    if (published && a.ack) {
      // ~60% of employees have acknowledged.
      const ackers = empIds.filter(() => chance(0.6));
      if (ackers.length > 0) {
        await prisma.announcementAcknowledgement.createMany({
          data: ackers.map((eid) => ({
            id: uuid(),
            organizationId: org.id,
            announcementId: annId,
            employeeId: eid,
            acknowledgedAt: addDays(TODAY, -randInt(0, 10)),
          })),
        });
      }
    }
  }

  // 15. Documents — org-wide (with versions + audiences) and a few personal.
  // Each version's binary is uploaded to object storage so the seeded rows
  // point at real, downloadable PDFs (not just dangling storage keys).
  const storage = seedStorageClient();
  if (!storage) {
    throw new Error(
      "demo seed: object storage is not configured (S3_ENDPOINT / S3_ACCESS_KEY_ID / S3_SECRET_ACCESS_KEY). " +
        "Start the dev stack (MinIO) or set R2 credentials before seeding documents.",
    );
  }
  const orgCat = categories.find((c) => !c.isPersonal) ?? categories[0]!;
  const personalCat = categories.find((c) => c.isPersonal) ?? categories[0]!;
  const orgDocs = [
    "Employee Handbook 2026",
    "Code of Conduct",
    "Information Security Policy",
    "Remote Work Policy",
    "Expense Reimbursement Guide",
    "Leave Policy",
    "Health & Safety Guidelines",
    "Benefits Overview",
  ];
  for (let i = 0; i < orgDocs.length; i++) {
    const docId = uuid();
    const verId = uuid();
    const orgKey = `uploads/${org.id}/documents/${docId}/v1.pdf`;
    const orgPdf = makePdf(orgDocs[i]!, randInt(80_000, 600_000));
    await putObject(storage, orgKey, orgPdf, "application/pdf");
    await prisma.document.create({
      data: {
        id: docId,
        organizationId: org.id,
        categoryId: orgCat.id,
        title: orgDocs[i]!,
        description: `${orgDocs[i]} — current revision.`,
        isRequired: i < 3,
        isPersonal: false,
        publishedAt: addDays(TODAY, -randInt(5, 60)),
      },
    });
    await prisma.documentVersion.create({
      data: {
        id: verId,
        organizationId: org.id,
        documentId: docId,
        versionNo: 1,
        storageKey: orgKey,
        fileName: `${orgDocs[i]!.replace(/[^A-Za-z0-9]+/g, "_")}.pdf`,
        mimeType: "application/pdf",
        sizeBytes: BigInt(orgPdf.length),
      },
    });
    await prisma.document.update({
      where: { id: docId },
      data: { currentVersionId: verId },
    });
    await prisma.documentAudience.create({
      data: {
        id: uuid(),
        organizationId: org.id,
        documentId: docId,
        audienceType: "all_employees",
      },
    });
  }

  // 15a. Personal documents for ~12 employees.
  for (const e of empSpecs.filter(() => chance(0.3))) {
    const kind = pick([
      "Resume",
      "PAN Card",
      "Passport",
      "Offer Letter",
      "Experience Letter",
    ]);
    const docId = uuid();
    const verId = uuid();
    const persKey = `uploads/${org.id}/personal/${e.id}/${docId}.pdf`;
    const persPdf = makePdf(
      `${kind} — ${e.first} ${e.last}`,
      randInt(50_000, 300_000),
    );
    await putObject(storage, persKey, persPdf, "application/pdf");
    await prisma.document.create({
      data: {
        id: docId,
        organizationId: org.id,
        categoryId: personalCat.id,
        title: `${kind} — ${e.first} ${e.last}`,
        isPersonal: true,
        subjectEmployeeId: e.id,
        publishedAt: addDays(TODAY, -randInt(5, 200)),
      },
    });
    await prisma.documentVersion.create({
      data: {
        id: verId,
        organizationId: org.id,
        documentId: docId,
        versionNo: 1,
        storageKey: persKey,
        fileName: `${kind.replace(/\s+/g, "_")}.pdf`,
        mimeType: "application/pdf",
        sizeBytes: BigInt(persPdf.length),
      },
    });
    await prisma.document.update({
      where: { id: docId },
      data: { currentVersionId: verId },
    });
  }

  // 16. Notifications for the 4 login users (mix of read/unread).
  const templates = [
    { t: "leave.approved", p: "normal", link: "/leave" },
    { t: "leave.requested", p: "normal", link: "/leave" },
    { t: "announcement.published", p: "high", link: "/announcements" },
    { t: "document.assigned", p: "normal", link: "/documents" },
    {
      t: "attendance.regularization.pending",
      p: "normal",
      link: "/attendance",
    },
  ];
  const notif: unknown[] = [];
  for (const spec of empSpecs.slice(0, 4)) {
    for (let k = 0; k < 6; k++) {
      const tpl = pick(templates);
      notif.push({
        id: uuid(),
        organizationId: org.id,
        userId: spec.userId!,
        templateId: tpl.t,
        payload: { demo: true, index: k },
        linkTo: tpl.link,
        priority: tpl.p,
        readAt: chance(0.4) ? addDays(TODAY, -randInt(0, 5)) : null,
        createdAt: addDays(TODAY, -randInt(0, 20)),
      });
    }
  }
  await prisma.notification.createMany({ data: notif as never });

  // ─── Summary ───────────────────────────────────────────────────────────
  console.warn(`\ndemo seed: "${ORG_NAME}" (${ORG_SLUG}) — id ${org.id}`);
  console.warn(
    `  locations ${locationRows.length} · departments ${deptRows.length} · designations ${desigRows.length} · employees ${empSpecs.length}`,
  );
  console.warn(
    `  attendance ${attendance.length} · leaveRequests ${reqSpecs.length} · leaveBalances ${balanceRows.length}`,
  );
  console.warn(
    `  announcements ${annSpecs.length} · documents ${orgDocs.length}+personal · notifications ${notif.length}`,
  );
  console.warn(`\n  Demo login accounts:`);
  for (const l of LOGINS) {
    const src = pwSource[l.role];
    const label =
      src === "env"
        ? "(env)"
        : src === "public demo"
          ? "(public demo)"
          : "(generated — set DEMO_*_PASSWORD to control)";
    console.warn(
      `   ${l.role.padEnd(12)} ${l.email.padEnd(22)} ${l.pw}  ${label}`,
    );
  }
  console.warn("");
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
