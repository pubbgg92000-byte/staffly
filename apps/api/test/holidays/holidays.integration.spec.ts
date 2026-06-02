/**
 * Integration tests for Batch 6 — Holiday Calendar Management.
 * Covers calendars, holidays, location assignment, lookup, bootstrap, /me,
 * tenant isolation, and leave-units integration.
 */
import { beforeAll, afterAll, beforeEach, describe, expect, it } from "vitest";
import {
  PostgreSqlContainer,
  type StartedPostgreSqlContainer,
} from "@testcontainers/postgresql";
import { execSync } from "node:child_process";
import { type INestApplication, Module } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from "@nestjs/core";
import cookieParser from "cookie-parser";
import request from "supertest";

import { PrismaModule } from "../../src/infra/prisma/prisma.module";
import { AuthModule } from "../../src/auth/auth.module";
import { RbacModule } from "../../src/rbac/rbac.module";
import { AuditModule } from "../../src/audit/audit.module";
import { OrgStructureModule } from "../../src/org-structure/org-structure.module";
import { EmployeesModule } from "../../src/employees/employees.module";
import { LeaveModule } from "../../src/leave/leave.module";
import { HolidaysModule } from "../../src/holidays/holidays.module";
import { JwtAuthGuard } from "../../src/auth/guards/jwt-auth.guard";
import { CsrfGuard } from "../../src/auth/guards/csrf.guard";
import { PermissionGuard } from "../../src/rbac/permission.guard";
import { TenantInterceptor } from "../../src/tenant/tenant.interceptor";
import { GlobalExceptionFilter } from "../../src/common/http-exception.filter";
import { resetEnvCacheForTests } from "../../src/infra/config/env";
import { PrismaService } from "../../src/infra/prisma/prisma.service";
import { HolidayLookupService } from "../../src/holidays/holiday-lookup.service";
import { ACCESS_COOKIE, CSRF_COOKIE } from "../../src/auth/cookies";

@Module({
  imports: [
    PrismaModule,
    AuditModule,
    AuthModule,
    RbacModule,
    OrgStructureModule,
    EmployeesModule,
    LeaveModule,
    HolidaysModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: CsrfGuard },
    { provide: APP_GUARD, useClass: PermissionGuard },
    { provide: APP_INTERCEPTOR, useClass: TenantInterceptor },
    { provide: APP_FILTER, useClass: GlobalExceptionFilter },
  ],
})
class TestAppModule {}

let container: StartedPostgreSqlContainer;
let app: INestApplication;
let prisma: PrismaService;
let lookup: HolidayLookupService;
let unique = 0;

interface CookieBag {
  access?: string;
  csrf?: string;
}

function parseCookies(hdr: string | string[] | undefined): CookieBag {
  const arr = Array.isArray(hdr) ? hdr : typeof hdr === "string" ? [hdr] : [];
  const out: CookieBag = {};
  for (const c of arr) {
    const [pair] = c.split(";");
    const [name, ...rest] = pair!.split("=");
    if (name === ACCESS_COOKIE) out.access = rest.join("=");
    else if (name === CSRF_COOKIE) out.csrf = rest.join("=");
  }
  return out;
}
function cookieHeader(c: CookieBag): string {
  const parts: string[] = [];
  if (c.access) parts.push(`${ACCESS_COOKIE}=${c.access}`);
  if (c.csrf) parts.push(`${CSRF_COOKIE}=${c.csrf}`);
  return parts.join("; ");
}

async function signupOrg(): Promise<{
  cookies: CookieBag;
  organizationId: string;
  userId: string;
}> {
  unique += 1;
  const payload = {
    organizationName: `Org ${unique}`,
    slug: `org-${unique}-${Date.now()}`,
    email: `u${unique}-${Date.now()}@test.local`,
    password: "hunter22hunter22",
  };
  const res = await request(app.getHttpServer())
    .post("/auth/signup")
    .send(payload)
    .expect(201);
  return {
    cookies: parseCookies(res.headers["set-cookie"]),
    organizationId: res.body.organization.id,
    userId: res.body.user.id,
  };
}

async function createEmployeeForUser(
  cookies: CookieBag,
  userId: string,
  overrides: Record<string, unknown> = {},
): Promise<string> {
  const res = await request(app.getHttpServer())
    .post("/employees")
    .set("Cookie", cookieHeader(cookies))
    .set("X-CSRF-Token", cookies.csrf!)
    .send({
      employeeCode: `E-${unique}-${Date.now()}`,
      firstName: "Test",
      lastName: "User",
      workEmail: `t-${unique}-${Date.now()}@acme.test`,
      ...overrides,
    })
    .expect(201);
  await prisma.db.employee.update({
    where: { id: res.body.id },
    data: { userId },
  });
  return res.body.id;
}

async function createLocation(
  cookies: CookieBag,
  name: string,
): Promise<string> {
  const res = await request(app.getHttpServer())
    .post("/locations")
    .set("Cookie", cookieHeader(cookies))
    .set("X-CSRF-Token", cookies.csrf!)
    .send({ name, timezone: "Asia/Kolkata" })
    .expect(201);
  return res.body.id;
}

function dropToEmployeeRole(
  organizationId: string,
  userId: string,
): Promise<unknown> {
  return (async () => {
    await prisma.db.userRole.deleteMany({ where: { userId } });
    const emp = await prisma.db.role.findFirstOrThrow({
      where: { organizationId, key: "employee" },
    });
    await prisma.db.userRole.create({
      data: { organizationId, userId, roleId: emp.id },
    });
  })();
}

beforeAll(async () => {
  container = await new PostgreSqlContainer("postgres:18-alpine")
    .withDatabase("staffly_test")
    .withUsername("staffly")
    .withPassword("test")
    .start();
  process.env.DATABASE_URL = container.getConnectionUri();
  process.env.JWT_SECRET =
    "test-secret-must-be-at-least-32-characters-long-aaa";
  process.env.ACCESS_TOKEN_TTL_SECONDS = "900";
  process.env.REFRESH_TOKEN_TTL_SECONDS = "604800";
  process.env.COOKIE_DOMAIN = "localhost";
  process.env.NODE_ENV = "test";
  resetEnvCacheForTests();
  execSync("pnpm prisma migrate deploy", {
    stdio: "inherit",
    env: process.env,
  });
  execSync("pnpm db:seed", { stdio: "inherit", env: process.env });
  const moduleRef = await Test.createTestingModule({
    imports: [TestAppModule],
  }).compile();
  app = moduleRef.createNestApplication({ bufferLogs: true });
  app.use(cookieParser());
  await app.init();
  prisma = moduleRef.get(PrismaService);
  lookup = moduleRef.get(HolidayLookupService);
}, 180_000);

afterAll(async () => {
  await app?.close();
  await container?.stop();
});

beforeEach(async () => {
  await prisma.db.locationHolidayCalendar.deleteMany();
  await prisma.db.holiday.deleteMany();
  await prisma.db.holidayCalendar.deleteMany();
  await prisma.db.leaveApproval.deleteMany();
  await prisma.db.leaveRequest.deleteMany();
  await prisma.db.leaveBalance.deleteMany();
  await prisma.db.leaveType.deleteMany();
  await prisma.db.auditLog.deleteMany();
  await prisma.db.employee.deleteMany();
  await prisma.db.location.deleteMany();
  await prisma.db.refreshToken.deleteMany();
  await prisma.db.userRole.deleteMany();
  await prisma.db.rolePermission.deleteMany();
  await prisma.db.role.deleteMany();
  await prisma.db.user.deleteMany();
  await prisma.db.organization.deleteMany();
});

// ─── Bootstrap ───────────────────────────────────────────────────────

describe("org signup seeds a default calendar", () => {
  it("creates exactly one Standard default calendar", async () => {
    const { cookies, organizationId } = await signupOrg();
    const list = await request(app.getHttpServer())
      .get("/holiday-calendars")
      .set("Cookie", cookieHeader(cookies))
      .expect(200);
    expect(list.body.items).toHaveLength(1);
    expect(list.body.items[0].name).toBe("Standard");
    expect(list.body.items[0].isDefault).toBe(true);
    expect(list.body.items[0].organizationId).toBe(organizationId);
  });
});

// ─── Calendar CRUD ───────────────────────────────────────────────────

describe("holiday calendars CRUD", () => {
  it("create, update, set-default, delete", async () => {
    const { cookies } = await signupOrg();
    const create = await request(app.getHttpServer())
      .post("/holiday-calendars")
      .set("Cookie", cookieHeader(cookies))
      .set("X-CSRF-Token", cookies.csrf!)
      .send({ name: "India 2026", code: "IN26" })
      .expect(201);
    expect(create.body.isDefault).toBe(false);

    const patch = await request(app.getHttpServer())
      .patch(`/holiday-calendars/${create.body.id}`)
      .set("Cookie", cookieHeader(cookies))
      .set("X-CSRF-Token", cookies.csrf!)
      .send({ description: "Indian public holidays" })
      .expect(200);
    expect(patch.body.description).toBe("Indian public holidays");

    // Promote to default — Standard should be demoted.
    const promote = await request(app.getHttpServer())
      .post(`/holiday-calendars/${create.body.id}/set-default`)
      .set("Cookie", cookieHeader(cookies))
      .set("X-CSRF-Token", cookies.csrf!)
      .expect(201);
    expect(promote.body.isDefault).toBe(true);

    const list = await request(app.getHttpServer())
      .get("/holiday-calendars")
      .set("Cookie", cookieHeader(cookies))
      .expect(200);
    const defaults = list.body.items.filter(
      (c: { isDefault: boolean }) => c.isDefault,
    );
    expect(defaults).toHaveLength(1);
    expect(defaults[0].id).toBe(create.body.id);

    // Standard is no longer default — it can now be deleted.
    const standard = list.body.items.find(
      (c: { name: string }) => c.name === "Standard",
    );
    const del = await request(app.getHttpServer())
      .delete(`/holiday-calendars/${standard.id}`)
      .set("Cookie", cookieHeader(cookies))
      .set("X-CSRF-Token", cookies.csrf!);
    expect(del.status).toBe(204);
  });

  it("refuses to delete the default calendar", async () => {
    const { cookies } = await signupOrg();
    const list = await request(app.getHttpServer())
      .get("/holiday-calendars")
      .set("Cookie", cookieHeader(cookies))
      .expect(200);
    const def = list.body.items[0];
    expect(def.isDefault).toBe(true);
    const res = await request(app.getHttpServer())
      .delete(`/holiday-calendars/${def.id}`)
      .set("Cookie", cookieHeader(cookies))
      .set("X-CSRF-Token", cookies.csrf!);
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("holiday.calendar.default_undeletable");
  });

  it("duplicate name → 409", async () => {
    const { cookies } = await signupOrg();
    const res = await request(app.getHttpServer())
      .post("/holiday-calendars")
      .set("Cookie", cookieHeader(cookies))
      .set("X-CSRF-Token", cookies.csrf!)
      .send({ name: "Standard" });
    expect(res.status).toBe(409);
  });

  it("RBAC: employee role → 403 on create", async () => {
    const { cookies, organizationId, userId } = await signupOrg();
    await dropToEmployeeRole(organizationId, userId);
    const res = await request(app.getHttpServer())
      .post("/holiday-calendars")
      .set("Cookie", cookieHeader(cookies))
      .set("X-CSRF-Token", cookies.csrf!)
      .send({ name: "X" });
    expect(res.status).toBe(403);
  });
});

// ─── Holiday CRUD + bulk ─────────────────────────────────────────────

async function defaultCalendarId(cookies: CookieBag): Promise<string> {
  const list = await request(app.getHttpServer())
    .get("/holiday-calendars")
    .set("Cookie", cookieHeader(cookies))
    .expect(200);
  return list.body.items.find((c: { isDefault: boolean }) => c.isDefault).id;
}

describe("holidays CRUD + bulk upsert", () => {
  it("create + update + delete a single holiday", async () => {
    const { cookies } = await signupOrg();
    const calId = await defaultCalendarId(cookies);
    const create = await request(app.getHttpServer())
      .post(`/holiday-calendars/${calId}/holidays`)
      .set("Cookie", cookieHeader(cookies))
      .set("X-CSRF-Token", cookies.csrf!)
      .send({ date: "2026-08-15", name: "Independence Day" })
      .expect(201);
    expect(create.body.type).toBe("public");

    const patch = await request(app.getHttpServer())
      .patch(`/holidays/${create.body.id}`)
      .set("Cookie", cookieHeader(cookies))
      .set("X-CSRF-Token", cookies.csrf!)
      .send({ type: "company", isOptional: true })
      .expect(200);
    expect(patch.body.type).toBe("company");
    expect(patch.body.isOptional).toBe(true);

    const del = await request(app.getHttpServer())
      .delete(`/holidays/${create.body.id}`)
      .set("Cookie", cookieHeader(cookies))
      .set("X-CSRF-Token", cookies.csrf!);
    expect(del.status).toBe(204);
  });

  it("(calendarId, date) is unique → second create → 409", async () => {
    const { cookies } = await signupOrg();
    const calId = await defaultCalendarId(cookies);
    await request(app.getHttpServer())
      .post(`/holiday-calendars/${calId}/holidays`)
      .set("Cookie", cookieHeader(cookies))
      .set("X-CSRF-Token", cookies.csrf!)
      .send({ date: "2026-12-25", name: "Christmas" })
      .expect(201);
    const dup = await request(app.getHttpServer())
      .post(`/holiday-calendars/${calId}/holidays`)
      .set("Cookie", cookieHeader(cookies))
      .set("X-CSRF-Token", cookies.csrf!)
      .send({ date: "2026-12-25", name: "Christmas Day" });
    expect(dup.status).toBe(409);
  });

  it("bulk upsert merges by date and is idempotent", async () => {
    const { cookies } = await signupOrg();
    const calId = await defaultCalendarId(cookies);
    const first = await request(app.getHttpServer())
      .post(`/holiday-calendars/${calId}/holidays/bulk`)
      .set("Cookie", cookieHeader(cookies))
      .set("X-CSRF-Token", cookies.csrf!)
      .send({
        items: [
          { date: "2026-01-01", name: "New Year" },
          { date: "2026-12-25", name: "Christmas" },
        ],
      })
      .expect(201);
    expect(first.body.upserted).toBe(2);

    // Re-run with renamed entry — no new row, same date updated in place.
    const second = await request(app.getHttpServer())
      .post(`/holiday-calendars/${calId}/holidays/bulk`)
      .set("Cookie", cookieHeader(cookies))
      .set("X-CSRF-Token", cookies.csrf!)
      .send({
        items: [{ date: "2026-12-25", name: "Christmas Day" }],
      })
      .expect(201);
    expect(second.body.upserted).toBe(1);

    const list = await request(app.getHttpServer())
      .get(`/holiday-calendars/${calId}/holidays`)
      .set("Cookie", cookieHeader(cookies))
      .expect(200);
    expect(list.body.items).toHaveLength(2);
    const xmas = list.body.items.find(
      (h: { date: string }) => h.date.slice(0, 10) === "2026-12-25",
    );
    expect(xmas.name).toBe("Christmas Day");
  });

  it("list filters by from/to inclusive", async () => {
    const { cookies } = await signupOrg();
    const calId = await defaultCalendarId(cookies);
    await request(app.getHttpServer())
      .post(`/holiday-calendars/${calId}/holidays/bulk`)
      .set("Cookie", cookieHeader(cookies))
      .set("X-CSRF-Token", cookies.csrf!)
      .send({
        items: [
          { date: "2026-01-01", name: "New Year" },
          { date: "2026-06-15", name: "Mid Year" },
          { date: "2026-12-25", name: "Christmas" },
        ],
      })
      .expect(201);
    const ranged = await request(app.getHttpServer())
      .get(
        `/holiday-calendars/${calId}/holidays?from=2026-06-01&to=2026-06-30`,
      )
      .set("Cookie", cookieHeader(cookies))
      .expect(200);
    expect(ranged.body.items).toHaveLength(1);
    expect(ranged.body.items[0].name).toBe("Mid Year");
  });
});

// ─── Location ↔ calendar assignment ──────────────────────────────────

describe("location ↔ calendar assignment", () => {
  it("assign, replace, unassign — 1:1 per location", async () => {
    const { cookies } = await signupOrg();
    const locationId = await createLocation(cookies, "HQ");
    const calA = await request(app.getHttpServer())
      .post("/holiday-calendars")
      .set("Cookie", cookieHeader(cookies))
      .set("X-CSRF-Token", cookies.csrf!)
      .send({ name: "A" })
      .expect(201);
    const calB = await request(app.getHttpServer())
      .post("/holiday-calendars")
      .set("Cookie", cookieHeader(cookies))
      .set("X-CSRF-Token", cookies.csrf!)
      .send({ name: "B" })
      .expect(201);

    const assign = await request(app.getHttpServer())
      .post(`/locations/${locationId}/holiday-calendar`)
      .set("Cookie", cookieHeader(cookies))
      .set("X-CSRF-Token", cookies.csrf!)
      .send({ calendarId: calA.body.id });
    expect(assign.status).toBe(201);

    // Re-assign to a different calendar should replace, not error.
    const replace = await request(app.getHttpServer())
      .post(`/locations/${locationId}/holiday-calendar`)
      .set("Cookie", cookieHeader(cookies))
      .set("X-CSRF-Token", cookies.csrf!)
      .send({ calendarId: calB.body.id });
    expect(replace.status).toBe(201);

    const get = await request(app.getHttpServer())
      .get(`/locations/${locationId}/holiday-calendar`)
      .set("Cookie", cookieHeader(cookies))
      .expect(200);
    expect(get.body.calendarId).toBe(calB.body.id);

    const unassign = await request(app.getHttpServer())
      .delete(`/locations/${locationId}/holiday-calendar`)
      .set("Cookie", cookieHeader(cookies))
      .set("X-CSRF-Token", cookies.csrf!);
    expect(unassign.status).toBe(204);
  });
});

// ─── HolidayLookupService ────────────────────────────────────────────

describe("HolidayLookupService", () => {
  it("resolves location calendar first, falls back to default", async () => {
    const { cookies, userId } = await signupOrg();
    const locId = await createLocation(cookies, "Bangalore");
    const empId = await createEmployeeForUser(cookies, userId, {
      locationId: locId,
    });

    // No location assignment yet → falls back to default Standard calendar.
    const defaultId = await defaultCalendarId(cookies);
    const fallback = await lookup.resolveCalendarIdForEmployee(empId);
    expect(fallback).toBe(defaultId);

    // Create + assign a location-specific calendar.
    const specific = await request(app.getHttpServer())
      .post("/holiday-calendars")
      .set("Cookie", cookieHeader(cookies))
      .set("X-CSRF-Token", cookies.csrf!)
      .send({ name: "Bangalore Calendar" })
      .expect(201);
    await request(app.getHttpServer())
      .post(`/locations/${locId}/holiday-calendar`)
      .set("Cookie", cookieHeader(cookies))
      .set("X-CSRF-Token", cookies.csrf!)
      .send({ calendarId: specific.body.id })
      .expect(201);

    const resolved = await lookup.resolveCalendarIdForEmployee(empId);
    expect(resolved).toBe(specific.body.id);
  });

  it("holidayDatesInRange respects inclusive boundaries", async () => {
    const { cookies } = await signupOrg();
    const calId = await defaultCalendarId(cookies);
    await request(app.getHttpServer())
      .post(`/holiday-calendars/${calId}/holidays/bulk`)
      .set("Cookie", cookieHeader(cookies))
      .set("X-CSRF-Token", cookies.csrf!)
      .send({
        items: [
          { date: "2026-06-01", name: "Start day" },
          { date: "2026-06-05", name: "End day" },
          { date: "2026-06-15", name: "Outside" },
        ],
      })
      .expect(201);
    const dates = await lookup.holidayDatesInRange(
      calId,
      "2026-06-01",
      "2026-06-05",
    );
    expect(dates.size).toBe(2);
    expect(dates.has("2026-06-01")).toBe(true);
    expect(dates.has("2026-06-05")).toBe(true);
    expect(dates.has("2026-06-15")).toBe(false);
  });

  it("returns null when employee has no location and no default exists", async () => {
    const { cookies, userId } = await signupOrg();
    const empId = await createEmployeeForUser(cookies, userId);
    // Delete the bootstrap default.
    const defId = await defaultCalendarId(cookies);
    await prisma.db.holidayCalendar.update({
      where: { id: defId },
      data: { isDefault: false },
    });
    const resolved = await lookup.resolveCalendarIdForEmployee(empId);
    expect(resolved).toBeNull();
  });
});

// ─── /holidays/me ────────────────────────────────────────────────────

describe("GET /holidays/me", () => {
  it("returns resolved holidays for the calling employee", async () => {
    const { cookies, userId } = await signupOrg();
    await createEmployeeForUser(cookies, userId);
    const calId = await defaultCalendarId(cookies);
    await request(app.getHttpServer())
      .post(`/holiday-calendars/${calId}/holidays/bulk`)
      .set("Cookie", cookieHeader(cookies))
      .set("X-CSRF-Token", cookies.csrf!)
      .send({
        items: [
          { date: "2026-07-04", name: "Independence" },
          { date: "2026-07-15", name: "Mid month" },
          { date: "2026-08-01", name: "Outside" },
        ],
      })
      .expect(201);
    const me = await request(app.getHttpServer())
      .get("/holidays/me?from=2026-07-01&to=2026-07-31")
      .set("Cookie", cookieHeader(cookies))
      .expect(200);
    expect(me.body.calendarId).toBe(calId);
    expect(me.body.holidays).toHaveLength(2);
  });

  it("404 when caller has no employee record", async () => {
    const { cookies } = await signupOrg();
    const res = await request(app.getHttpServer())
      .get("/holidays/me?from=2026-01-01&to=2026-12-31")
      .set("Cookie", cookieHeader(cookies));
    expect(res.status).toBe(404);
  });
});

// ─── Leave integration ──────────────────────────────────────────────

async function leaveTypeId(cookies: CookieBag, code: string): Promise<string> {
  const list = await request(app.getHttpServer())
    .get("/leave/types")
    .set("Cookie", cookieHeader(cookies))
    .expect(200);
  return list.body.items.find((t: { code: string }) => t.code === code).id;
}

describe("leave integration — holidays subtract from units", () => {
  it("multi-day request spanning a holiday loses 1 unit", async () => {
    const { cookies, userId } = await signupOrg();
    await createEmployeeForUser(cookies, userId);
    const calId = await defaultCalendarId(cookies);
    await request(app.getHttpServer())
      .post(`/holiday-calendars/${calId}/holidays`)
      .set("Cookie", cookieHeader(cookies))
      .set("X-CSRF-Token", cookies.csrf!)
      .send({ date: "2026-07-04", name: "Holiday" })
      .expect(201);
    const cl = await leaveTypeId(cookies, "CL");
    const res = await request(app.getHttpServer())
      .post("/leave/requests")
      .set("Cookie", cookieHeader(cookies))
      .set("X-CSRF-Token", cookies.csrf!)
      .send({
        leaveTypeId: cl,
        startDate: "2026-07-03",
        endDate: "2026-07-05",
      })
      .expect(201);
    // 3 calendar days - 1 holiday = 2 units.
    expect(Number(res.body.units)).toBe(2);
  });

  it("single-day request on a holiday → 400 leave.units.invalid", async () => {
    const { cookies, userId } = await signupOrg();
    await createEmployeeForUser(cookies, userId);
    const calId = await defaultCalendarId(cookies);
    await request(app.getHttpServer())
      .post(`/holiday-calendars/${calId}/holidays`)
      .set("Cookie", cookieHeader(cookies))
      .set("X-CSRF-Token", cookies.csrf!)
      .send({ date: "2026-09-15", name: "Holiday" })
      .expect(201);
    const cl = await leaveTypeId(cookies, "CL");
    const res = await request(app.getHttpServer())
      .post("/leave/requests")
      .set("Cookie", cookieHeader(cookies))
      .set("X-CSRF-Token", cookies.csrf!)
      .send({
        leaveTypeId: cl,
        startDate: "2026-09-15",
        endDate: "2026-09-15",
      });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("leave.units.invalid");
  });

  it("employee with a location-bound calendar uses location holidays", async () => {
    const { cookies, userId } = await signupOrg();
    const locId = await createLocation(cookies, "Mumbai");
    await createEmployeeForUser(cookies, userId, { locationId: locId });
    // Default calendar gets a holiday — should be IGNORED for this employee.
    const defId = await defaultCalendarId(cookies);
    await request(app.getHttpServer())
      .post(`/holiday-calendars/${defId}/holidays`)
      .set("Cookie", cookieHeader(cookies))
      .set("X-CSRF-Token", cookies.csrf!)
      .send({ date: "2026-10-02", name: "Default-only" })
      .expect(201);
    // Location-specific calendar with a different date.
    const locCal = await request(app.getHttpServer())
      .post("/holiday-calendars")
      .set("Cookie", cookieHeader(cookies))
      .set("X-CSRF-Token", cookies.csrf!)
      .send({ name: "Mumbai" })
      .expect(201);
    await request(app.getHttpServer())
      .post(`/holiday-calendars/${locCal.body.id}/holidays`)
      .set("Cookie", cookieHeader(cookies))
      .set("X-CSRF-Token", cookies.csrf!)
      .send({ date: "2026-10-04", name: "Mumbai-only" })
      .expect(201);
    await request(app.getHttpServer())
      .post(`/locations/${locId}/holiday-calendar`)
      .set("Cookie", cookieHeader(cookies))
      .set("X-CSRF-Token", cookies.csrf!)
      .send({ calendarId: locCal.body.id })
      .expect(201);
    const cl = await leaveTypeId(cookies, "CL");
    const res = await request(app.getHttpServer())
      .post("/leave/requests")
      .set("Cookie", cookieHeader(cookies))
      .set("X-CSRF-Token", cookies.csrf!)
      .send({
        leaveTypeId: cl,
        startDate: "2026-10-01",
        endDate: "2026-10-05",
      })
      .expect(201);
    // 5 days - 1 Mumbai holiday (Oct 4) = 4. Oct 2 holiday on default is ignored.
    expect(Number(res.body.units)).toBe(4);
  });
});

// ─── Tenant isolation ────────────────────────────────────────────────

describe("tenant isolation", () => {
  it("Org-A cannot read or mutate Org-B calendars", async () => {
    const a = await signupOrg();
    const b = await signupOrg();
    const bCalId = await defaultCalendarId(b.cookies);
    const get = await request(app.getHttpServer())
      .get(`/holiday-calendars/${bCalId}`)
      .set("Cookie", cookieHeader(a.cookies));
    expect(get.status).toBe(404);
    const patch = await request(app.getHttpServer())
      .patch(`/holiday-calendars/${bCalId}`)
      .set("Cookie", cookieHeader(a.cookies))
      .set("X-CSRF-Token", a.cookies.csrf!)
      .send({ description: "hijack" });
    expect(patch.status).toBe(404);
  });
});
