/**
 * Performance-benchmark seed (certification Phase: Performance).
 *
 * Provisions a SCRATCH tenant `staffly-bench-<N>` with N employees plus
 * proportional attendance (90 days), leave, documents, announcements and
 * notifications, so API endpoints can be benchmarked at 50 / 500 / 5000
 * employee scale. Mirrors seed-demo.ts conventions:
 *
 *   - Deterministic: seeded PRNG (seed varies by N) + fixed call order.
 *   - Idempotent: the bench org is wiped (dependency order) before creation.
 *   - Tenant-scoped: ONLY the `staffly-bench-<N>` org is touched. The demo
 *     tenant (`staffly-demo`) and any other org are never modified.
 *
 * Documents are seeded as DB rows with org-prefixed storage keys but WITHOUT
 * uploading binaries — the benchmarked endpoints (list/feed/dashboard) never
 * fetch objects, and skipping uploads keeps MinIO free of bench garbage.
 *
 * Usage:
 *   pnpm --filter @staffly/api exec tsx prisma/seed-bench.ts 500     # seed
 *   pnpm --filter @staffly/api exec tsx prisma/seed-bench.ts --delete # drop all bench orgs
 *
 * NEVER run against production.
 */
import { PrismaClient } from "@prisma/client";
import argon2 from "argon2";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  localDateInTimezone,
  localWallTimeToUtc,
} from "../src/attendance/local-date";
import { DEFAULT_DOCUMENT_CATEGORIES } from "../src/documents/default-document-categories";
import { MANAGER_TEAM_PERMISSIONS } from "../src/rbac/system-roles";

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

const ORG_TZ = "America/New_York";
/** Known bench admin password — scratch org, local only, deleted after. */
const BENCH_ADMIN_PASSWORD = "Bench!Passw0rd";

// ─── Deterministic helpers (mulberry32, as in seed-demo.ts) ────────────────
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
let rng = makeRng(0x42454e43); // "BENC" — re-seeded per size in main()

function uuid(): string {
  const b = new Uint8Array(16);
  for (let i = 0; i < 16; i++) b[i] = Math.floor(rng() * 256);
  b[6] = (b[6]! & 0x0f) | 0x40;
  b[8] = (b[8]! & 0x3f) | 0x80;
  const h = [...b].map((x) => x.toString(16).padStart(2, "0")).join("");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

const randInt = (min: number, max: number): number =>
  Math.floor(rng() * (max - min + 1)) + min;
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

const TODAY = dateOnly(
  new Date(`${localDateInTimezone(new Date(), ORG_TZ)}T00:00:00.000Z`),
);
const CYCLE_YEAR = TODAY.getUTCFullYear();

// ─── Reference data (subset of seed-demo's) ────────────────────────────────
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
  { md: "05-27", name: "Memorial Day" },
  { md: "07-04", name: "Independence Day" },
  { md: "09-02", name: "Labor Day" },
  { md: "11-28", name: "Thanksgiving" },
  { md: "12-25", name: "Christmas Day" },
];

// ─── Wipe helper (dependency order, mirrors seed-demo.ts step 2) ───────────
async function wipeOrgBySlug(slug: string): Promise<boolean> {
  const prior = await prisma.organization.findUnique({
    where: { slug },
    select: { id: true },
  });
  if (!prior) return false;
  const where = { organizationId: prior.id };
  await prisma.leaveApproval.deleteMany({ where });
  await prisma.leaveRequest.deleteMany({ where });
  await prisma.leaveBalance.deleteMany({ where });
  await prisma.leaveType.deleteMany({ where });
  await prisma.attendanceRecord.deleteMany({ where });
  await prisma.attendanceRegularization.deleteMany({ where });
  await prisma.documentAcknowledgement.deleteMany({ where });
  await prisma.documentAudience.deleteMany({ where });
  await prisma.document.updateMany({ where, data: { currentVersionId: null } });
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
  await prisma.user.deleteMany({ where });
  await prisma.orgSetting.deleteMany({ where });
  await prisma.organization.delete({ where: { id: prior.id } });
  return true;
}

// ─── Delete mode ────────────────────────────────────────────────────────────
async function deleteAllBenchOrgs(): Promise<void> {
  const benchOrgs = await prisma.organization.findMany({
    where: { slug: { startsWith: "staffly-bench-" } },
    select: { slug: true },
  });
  if (benchOrgs.length === 0) {
    console.warn(
      "bench seed: no staffly-bench-* orgs found — nothing to delete.",
    );
    return;
  }
  for (const o of benchOrgs) {
    await wipeOrgBySlug(o.slug);
    console.warn(`bench seed: deleted org ${o.slug}`);
  }
}

// ─── Main ───────────────────────────────────────────────────────────────────
async function seed(total: number): Promise<void> {
  rng = makeRng((0x42454e43 ^ total) >>> 0); // deterministic per size

  const ORG_SLUG = `staffly-bench-${total}`;
  const ORG_NAME = `Bench Corp ${total}`;

  if (ORG_SLUG === "staffly-demo")
    throw new Error("bench seed: refusing to touch the demo tenant");

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

  // 2. Wipe any prior bench org of this size.
  await wipeOrgBySlug(ORG_SLUG);

  // 3. Organisation.
  const org = await prisma.organization.create({
    data: {
      slug: ORG_SLUG,
      name: ORG_NAME,
      legalName: `Bench Corp ${total}, Inc.`,
      domain: `bench${total}.test`,
      primaryColor: "#0EA5E9",
      timezone: ORG_TZ,
      locale: "en-US",
      currency: "USD",
      weekStart: 1,
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

  // 5. Document categories.
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

  // 6. Locations, departments, designations.
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

  // 7. Holiday calendar.
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

  // 8. Attendance policy.
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

  // 9. Single super_admin login for benchmarking + N employees.
  const adminUserId = uuid();
  await prisma.user.create({
    data: {
      id: adminUserId,
      organizationId: org.id,
      email: `admin@bench${total}.test`,
      passwordHash: await argon2.hash(BENCH_ADMIN_PASSWORD, {
        type: argon2.argon2id,
        memoryCost: 64 * 1024,
        timeCost: 3,
        parallelism: 2,
      }),
      status: "active",
      emailVerifiedAt: new Date(),
      defaultPortal: "admin",
    },
  });
  await prisma.userRole.create({
    data: {
      organizationId: org.id,
      userId: adminUserId,
      roleId: roleIds["super_admin"]!,
    },
  });

  const tzByLocId = new Map(locationRows.map((l) => [l.id, l.timezone]));
  const employmentTypes = [
    "full_time",
    "full_time",
    "full_time",
    "part_time",
    "contractor",
    "intern",
  ];
  const workModes = ["onsite", "hybrid", "remote"];
  const usedEmails = new Set<string>();

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

  for (let i = 0; i < total; i++) {
    const id = uuid();
    const first = pick(FIRST_NAMES);
    const last = pick(LAST_NAMES);
    let email = `${first}.${last}`.toLowerCase().replace(/[^a-z.]/g, "");
    if (usedEmails.has(`${email}@bench${total}.test`)) email = `${email}${i}`;
    const workEmail = `${email}@bench${total}.test`;
    usedEmails.add(workEmail);
    const locId = pick(locationRows).id;
    const isAdmin = i === 0; // employee #0 carries the admin user
    empSpecs.push({
      id,
      code: `BEN-${String(i + 1).padStart(5, "0")}`,
      first,
      last,
      workEmail,
      deptId: pick(deptRows).id,
      desigId: pick(desigRows).id,
      locId,
      tz: tzByLocId.get(locId) ?? ORG_TZ,
      employmentType: isAdmin ? "full_time" : pick(employmentTypes),
      workMode: pick(workModes),
      status: !isAdmin && chance(0.06) ? "on_leave" : "active",
      joinedOn: addDays(TODAY, -randInt(30, 1500)),
      userId: isAdmin ? adminUserId : null,
      isManager: isAdmin || chance(0.12),
    });
  }

  const managers = empSpecs.filter((e) => e.isManager);
  const managersByDept = new Map<string, string[]>();
  for (const m of managers) {
    const arr = managersByDept.get(m.deptId) ?? [];
    arr.push(m.id);
    managersByDept.set(m.deptId, arr);
  }
  const allManagerIds = managers.map((m) => m.id);

  const empRows = empSpecs.map((e) => {
    let managerId: string | null = null;
    if (!e.isManager) {
      const inDept = (managersByDept.get(e.deptId) ?? []).filter(
        (m) => m !== e.id,
      );
      const poolFrom = inDept.length > 0 ? inDept : allManagerIds;
      managerId =
        poolFrom.length > 0 ? poolFrom[randInt(0, poolFrom.length - 1)]! : null;
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
  });
  // Managers first (their managerId is always null), then reports — chunked
  // inserts would otherwise hit the manager_id FK for managers in later chunks.
  const managerRows = empRows.filter((r) => r.managerId === null);
  const reportRows = empRows.filter((r) => r.managerId !== null);
  for (const rows of [managerRows, reportRows]) {
    for (let i = 0; i < rows.length; i += 1000) {
      await prisma.employee.createMany({
        data: rows.slice(i, i + 1000) as never,
      });
    }
  }

  // 10. Leave types, requests (non-overlapping per employee), balances.
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

  const dayKey = (d: Date): string =>
    `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
  const rangeDates = (start: Date, end: Date): Date[] => {
    const out: Date[] = [];
    for (let d = new Date(start); d <= end; d = addDays(d, 1))
      out.push(new Date(d));
    return out;
  };

  const reqSpecs: {
    id: string;
    employeeId: string;
    leaveTypeId: string;
    start: Date;
    end: Date;
    units: number;
    status: string;
    decidedBy: string | null;
  }[] = [];
  const approvedLeaveByEmp = new Map<string, Set<string>>();
  for (const e of empSpecs) {
    const n = randInt(0, 3);
    const occupied = new Set<string>();
    for (let k = 0; k < n; k++) {
      const lt = pick(leaveTypeRows);
      const start = addDays(TODAY, randInt(-60, 40));
      const len = randInt(1, 4);
      const end = addDays(start, len - 1);
      const dates = rangeDates(start, end);
      const roll = rng();
      const status =
        roll < 0.45
          ? "approved"
          : roll < 0.7
            ? "pending"
            : roll < 0.85
              ? "rejected"
              : "cancelled";
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
        decidedBy:
          status === "approved" || status === "rejected" ? adminUserId : null,
      });
    }
  }
  for (let i = 0; i < reqSpecs.length; i += 1000) {
    await prisma.leaveRequest.createMany({
      data: reqSpecs.slice(i, i + 1000).map((r) => ({
        id: r.id,
        organizationId: org.id,
        employeeId: r.employeeId,
        leaveTypeId: r.leaveTypeId,
        startDate: r.start,
        endDate: r.end,
        units: r.units,
        reason: "Bench-generated request",
        status: r.status as "pending",
        decidedAt: r.decidedBy ? addDays(r.start, -2) : null,
        decidedBy: r.decidedBy,
        cancelledAt: r.status === "cancelled" ? addDays(r.start, -1) : null,
      })) as never,
    });
  }
  const approvals = reqSpecs
    .filter((r) => r.decidedBy)
    .map((r) => ({
      id: uuid(),
      organizationId: org.id,
      leaveRequestId: r.id,
      approverUserId: r.decidedBy!,
      decision: (r.status === "approved"
        ? "approved"
        : "rejected") as "approved",
      comment: "Bench decision.",
    }));
  for (let i = 0; i < approvals.length; i += 1000) {
    await prisma.leaveApproval.createMany({
      data: approvals.slice(i, i + 1000) as never,
    });
  }

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
      if (acc === 0) continue;
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
  for (let i = 0; i < balanceRows.length; i += 1000) {
    await prisma.leaveBalance.createMany({
      data: balanceRows.slice(i, i + 1000) as never,
    });
  }

  // 11. Attendance — last 90 days, weekdays, holidays skipped, local-tz
  // check-ins, approved leave → on_leave (consistent with seed-demo).
  const holidaySet = new Set(HOLIDAYS.map((h) => `${CYCLE_YEAR}-${h.md}`));
  const isHoliday = (d: Date): boolean => holidaySet.has(dayKey(d));

  const attendance: unknown[] = [];
  for (let back = 90; back >= 0; back--) {
    const day = addDays(TODAY, -back);
    const dow = day.getUTCDay();
    if (dow === 0 || dow === 6) continue;
    if (isHoliday(day)) continue;
    const isToday = back === 0;
    for (const e of empSpecs) {
      if (e.joinedOn > day) continue;
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
      const checkInAtLocal = (lateMin: number): Date =>
        localWallTimeToUtc(e.tz, day, 9, Math.max(0, lateMin));
      const roll = rng();
      let status: string,
        checkIn: Date | null = null,
        checkOut: Date | null = null,
        worked: number | null = null,
        late = false;
      if (isToday) {
        if (roll < 0.88) {
          status = "present";
          const lateMin = chance(0.15) ? randInt(16, 75) : randInt(-10, 14);
          late = lateMin > 15;
          checkIn = checkInAtLocal(lateMin);
        } else {
          continue;
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
  for (let i = 0; i < attendance.length; i += 1000) {
    await prisma.attendanceRecord.createMany({
      data: attendance.slice(i, i + 1000) as never,
    });
  }

  // 11b. Pending regularizations (~1% of employees, min 5).
  const regCount = Math.max(5, Math.floor(total * 0.01));
  const regs = empSpecs.slice(1, 1 + regCount).map((e) => ({
    id: uuid(),
    organizationId: org.id,
    employeeId: e.id,
    attendanceDate: addDays(TODAY, -randInt(3, 20)),
    requestedCheckInAt: localWallTimeToUtc(e.tz, addDays(TODAY, -10), 9, 0),
    requestedCheckOutAt: localWallTimeToUtc(e.tz, addDays(TODAY, -10), 18, 0),
    reason: "Bench-generated regularization.",
    status: "pending" as const,
  }));
  await prisma.attendanceRegularization.createMany({ data: regs });

  // 12. Announcements (8, mirroring demo statuses) + acks on ack-required.
  const empIds = empSpecs.map((e) => e.id);
  const annSpecs = [
    {
      title: "Welcome to Bench Corp!",
      status: "published",
      ack: false,
      pinned: true,
    },
    {
      title: "All-Hands Thursday",
      status: "published",
      ack: true,
      pinned: true,
    },
    {
      title: "Remote-work policy update",
      status: "published",
      ack: true,
      pinned: false,
    },
    {
      title: "Office closure notice",
      status: "published",
      ack: false,
      pinned: false,
    },
    {
      title: "Benefits enrollment",
      status: "scheduled",
      ack: false,
      pinned: false,
    },
    {
      title: "Draft: party planning",
      status: "draft",
      ack: false,
      pinned: false,
    },
    {
      title: "New hires this month",
      status: "published",
      ack: false,
      pinned: false,
    },
    {
      title: "Security training due",
      status: "published",
      ack: true,
      pinned: false,
    },
  ];
  for (const a of annSpecs) {
    const annId = uuid();
    const published = a.status === "published";
    await prisma.announcement.create({
      data: {
        id: annId,
        organizationId: org.id,
        title: a.title,
        bodyHtml: `<p>${a.title}</p><p>Bench-generated announcement body.</p>`,
        pinned: a.pinned,
        requiresAcknowledgment: a.ack,
        priority: "normal",
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
      const ackers = empIds.filter(() => chance(0.6));
      for (let i = 0; i < ackers.length; i += 1000) {
        await prisma.announcementAcknowledgement.createMany({
          data: ackers.slice(i, i + 1000).map((eid) => ({
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

  // 13. Documents — 8 org docs + personal docs for ~10% of employees (cap
  // 200). Rows only; no binaries uploaded (see file header).
  const orgCat = categories.find((c) => !c.isPersonal) ?? categories[0]!;
  const personalCat = categories.find((c) => c.isPersonal) ?? categories[0]!;
  const orgDocs = [
    "Employee Handbook",
    "Code of Conduct",
    "Security Policy",
    "Remote Work Policy",
    "Expense Guide",
    "Leave Policy",
    "Safety Guidelines",
    "Benefits Overview",
  ];
  for (let i = 0; i < orgDocs.length; i++) {
    const docId = uuid();
    const verId = uuid();
    await prisma.document.create({
      data: {
        id: docId,
        organizationId: org.id,
        categoryId: orgCat.id,
        title: orgDocs[i]!,
        description: `${orgDocs[i]} — bench copy.`,
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
        storageKey: `uploads/${org.id}/documents/${docId}/v1.pdf`,
        fileName: `${orgDocs[i]!.replace(/[^A-Za-z0-9]+/g, "_")}.pdf`,
        mimeType: "application/pdf",
        sizeBytes: BigInt(randInt(80_000, 600_000)),
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
  const personalTargets = empSpecs.filter(() => chance(0.1)).slice(0, 200);
  for (const e of personalTargets) {
    const docId = uuid();
    const verId = uuid();
    await prisma.document.create({
      data: {
        id: docId,
        organizationId: org.id,
        categoryId: personalCat.id,
        title: `Offer Letter — ${e.first} ${e.last}`,
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
        storageKey: `uploads/${org.id}/personal/${e.id}/${docId}.pdf`,
        fileName: "Offer_Letter.pdf",
        mimeType: "application/pdf",
        sizeBytes: BigInt(randInt(50_000, 300_000)),
      },
    });
    await prisma.document.update({
      where: { id: docId },
      data: { currentVersionId: verId },
    });
  }

  // 14. Notifications for the admin user.
  await prisma.notification.createMany({
    data: Array.from({ length: 12 }, (_, k) => ({
      id: uuid(),
      organizationId: org.id,
      userId: adminUserId,
      templateId: pick([
        "leave.approved",
        "leave.requested",
        "announcement.published",
        "document.assigned",
      ]),
      payload: { bench: true, index: k },
      linkTo: "/dashboard",
      priority: "normal",
      readAt: chance(0.4) ? addDays(TODAY, -randInt(0, 5)) : null,
      createdAt: addDays(TODAY, -randInt(0, 20)),
    })) as never,
  });

  console.warn(`\nbench seed: "${ORG_NAME}" (${ORG_SLUG}) — id ${org.id}`);
  console.warn(
    `  employees ${empSpecs.length} · attendance ${attendance.length} · leaveRequests ${reqSpecs.length} · leaveBalances ${balanceRows.length}`,
  );
  console.warn(
    `  documents ${orgDocs.length}+${personalTargets.length} personal · announcements ${annSpecs.length}`,
  );
  console.warn(
    `  admin login: admin@bench${total}.test / ${BENCH_ADMIN_PASSWORD}\n`,
  );
}

async function main(): Promise<void> {
  const arg = process.argv[2];
  if (arg === "--delete") {
    await deleteAllBenchOrgs();
    return;
  }
  const total = Number(arg);
  if (!Number.isInteger(total) || total < 1 || total > 20_000) {
    throw new Error(
      "usage: tsx prisma/seed-bench.ts <employeeCount 1..20000> | --delete",
    );
  }
  await seed(total);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
