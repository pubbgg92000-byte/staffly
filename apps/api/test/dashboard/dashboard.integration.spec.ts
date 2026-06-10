/**
 * Integration tests for v0.9 — Dashboards.
 * Covers admin + employee dashboard payload shape, aggregation correctness,
 * RBAC enforcement, and tenant isolation.
 */
import "../../src/common/bigint-json";
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
import { AttendanceModule } from "../../src/attendance/attendance.module";
import { LeaveModule } from "../../src/leave/leave.module";
import { HolidaysModule } from "../../src/holidays/holidays.module";
import { AnnouncementsModule } from "../../src/announcements/announcements.module";
import { DocumentsModule } from "../../src/documents/documents.module";
import { DashboardModule } from "../../src/dashboard/dashboard.module";
import { JwtAuthGuard } from "../../src/auth/guards/jwt-auth.guard";
import { CsrfGuard } from "../../src/auth/guards/csrf.guard";
import { PermissionGuard } from "../../src/rbac/permission.guard";
import { TenantInterceptor } from "../../src/tenant/tenant.interceptor";
import { GlobalExceptionFilter } from "../../src/common/http-exception.filter";
import { resetEnvCacheForTests } from "../../src/infra/config/env";
import { PrismaService } from "../../src/infra/prisma/prisma.service";
import { ACCESS_COOKIE, CSRF_COOKIE } from "../../src/auth/cookies";
import {
  STORAGE_CLIENT,
  type StorageClient,
} from "../../src/storage/storage.module";
import { localDateInTimezone } from "../../src/attendance/local-date";

const stubStorage: StorageClient = {
  presignedPutObject: async () => "https://stub.local/put",
  presignedGetObject: async () => "https://stub.local/get",
  removeObject: async () => undefined,
};

@Module({
  imports: [
    PrismaModule,
    AuditModule,
    AuthModule,
    RbacModule,
    OrgStructureModule,
    EmployeesModule,
    AttendanceModule,
    LeaveModule,
    HolidaysModule,
    AnnouncementsModule,
    DocumentsModule,
    DashboardModule,
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
  const res = await request(app.getHttpServer())
    .post("/auth/signup")
    .send({
      organizationName: `Org ${unique}`,
      slug: `org-${unique}-${Date.now()}`,
      email: `u${unique}-${Date.now()}@test.local`,
      password: "hunter22hunter22",
    })
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
      employeeCode: `E-${unique}-${Date.now()}-${Math.floor(Math.random() * 1e6)}`,
      firstName: "Test",
      lastName: "User",
      workEmail: `t-${unique}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@acme.test`,
      ...overrides,
    })
    .expect(201);
  await prisma.db.employee.update({
    where: { id: res.body.id },
    data: { userId },
  });
  return res.body.id;
}

async function createOrphanEmployee(
  cookies: CookieBag,
  overrides: Record<string, unknown> = {},
): Promise<string> {
  const res = await request(app.getHttpServer())
    .post("/employees")
    .set("Cookie", cookieHeader(cookies))
    .set("X-CSRF-Token", cookies.csrf!)
    .send({
      employeeCode: `E-${unique}-${Date.now()}-${Math.floor(Math.random() * 1e6)}`,
      firstName: "Orphan",
      lastName: "Worker",
      workEmail: `o-${unique}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@acme.test`,
      ...overrides,
    })
    .expect(201);
  return res.body.id;
}

async function createDepartment(
  cookies: CookieBag,
  name: string,
): Promise<string> {
  const res = await request(app.getHttpServer())
    .post("/departments")
    .set("Cookie", cookieHeader(cookies))
    .set("X-CSRF-Token", cookies.csrf!)
    .send({ name })
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

function todayUTC(): Date {
  const d = new Date();
  return new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 0, 0, 0, 0),
  );
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
  process.env.S3_BUCKET = "staffly-test";
  process.env.S3_PRESIGN_TTL_SECONDS = "900";
  resetEnvCacheForTests();
  execSync("pnpm prisma migrate deploy", {
    stdio: "inherit",
    env: process.env,
  });
  execSync("pnpm db:seed", { stdio: "inherit", env: process.env });
  const moduleRef = await Test.createTestingModule({
    imports: [TestAppModule],
  })
    .overrideProvider(STORAGE_CLIENT)
    .useValue(stubStorage)
    .compile();
  app = moduleRef.createNestApplication({ bufferLogs: true });
  app.use(cookieParser());
  await app.init();
  prisma = moduleRef.get(PrismaService);
}, 180_000);

afterAll(async () => {
  await app?.close();
  await container?.stop();
});

beforeEach(async () => {
  await prisma.db.notification.deleteMany();
  await prisma.db.announcementAcknowledgement.deleteMany();
  await prisma.db.announcementAudience.deleteMany();
  await prisma.db.announcement.deleteMany();
  await prisma.db.documentAcknowledgement.deleteMany();
  await prisma.db.documentAudience.deleteMany();
  await prisma.db.document.updateMany({ data: { currentVersionId: null } });
  await prisma.db.documentVersion.deleteMany();
  await prisma.db.document.deleteMany();
  await prisma.db.documentCategory.deleteMany();
  await prisma.db.locationHolidayCalendar.deleteMany();
  await prisma.db.holiday.deleteMany();
  await prisma.db.holidayCalendar.deleteMany();
  await prisma.db.leaveApproval.deleteMany();
  await prisma.db.leaveRequest.deleteMany();
  await prisma.db.leaveBalance.deleteMany();
  await prisma.db.leaveType.deleteMany();
  await prisma.db.attendanceRegularization.deleteMany();
  await prisma.db.attendanceRecord.deleteMany();
  await prisma.db.attendancePolicy.deleteMany();
  await prisma.db.auditLog.deleteMany();
  await prisma.db.employee.deleteMany();
  await prisma.db.department.deleteMany();
  await prisma.db.designation.deleteMany();
  await prisma.db.location.deleteMany();
  await prisma.db.refreshToken.deleteMany();
  await prisma.db.userRole.deleteMany();
  await prisma.db.rolePermission.deleteMany();
  await prisma.db.role.deleteMany();
  await prisma.db.user.deleteMany();
  await prisma.db.organization.deleteMany();
});

// ─── Admin dashboard ─────────────────────────────────────────────────

describe("GET /dashboard/admin", () => {
  it("returns the expected top-level shape on a brand-new org", async () => {
    const { cookies } = await signupOrg();
    const res = await request(app.getHttpServer())
      .get("/dashboard/admin")
      .set("Cookie", cookieHeader(cookies))
      .expect(200);

    expect(res.body).toHaveProperty("metrics");
    expect(res.body).toHaveProperty("upcomingHolidays");
    expect(res.body).toHaveProperty("analytics");
    expect(res.body).toHaveProperty("recentActivity");

    expect(res.body.metrics).toMatchObject({
      totalEmployees: expect.any(Number),
      activeEmployees: expect.any(Number),
      onLeaveToday: 0,
      newJoinsThisMonth: 0,
      publishedAnnouncements: 0,
      pendingApprovals: {
        leave: 0,
        regularization: 0,
        documentAcknowledgements: 0,
      },
    });
    expect(res.body.metrics.attendanceToday).toMatchObject({
      present: 0,
      absent: 0,
      on_leave: 0,
    });
  });

  it("counts employees, new joins, and dept-headcount correctly", async () => {
    const { cookies, organizationId } = await signupOrg();
    const eng = await createDepartment(cookies, "Eng");
    const sales = await createDepartment(cookies, "Sales");
    const today = todayUTC();
    const joinedThisMonth = new Date(today);
    joinedThisMonth.setUTCDate(1);

    await createOrphanEmployee(cookies, {
      departmentId: eng,
      joinedOn: joinedThisMonth.toISOString().slice(0, 10),
    });
    await createOrphanEmployee(cookies, {
      departmentId: eng,
      joinedOn: joinedThisMonth.toISOString().slice(0, 10),
    });
    await createOrphanEmployee(cookies, {
      departmentId: sales,
    });

    // Set one to active so we can verify the active count.
    await prisma.db.employee.updateMany({
      where: { organizationId, departmentId: eng },
      data: { status: "active" },
    });

    const res = await request(app.getHttpServer())
      .get("/dashboard/admin")
      .set("Cookie", cookieHeader(cookies))
      .expect(200);

    expect(res.body.metrics.totalEmployees).toBe(3);
    expect(res.body.metrics.activeEmployees).toBe(2);
    expect(res.body.metrics.newJoinsThisMonth).toBe(2);

    const byDept = res.body.analytics.headcountByDepartment as {
      departmentName: string;
      count: number;
    }[];
    const eng_row = byDept.find((r) => r.departmentName === "Eng");
    const sales_row = byDept.find((r) => r.departmentName === "Sales");
    expect(eng_row?.count).toBe(2);
    expect(sales_row?.count).toBe(1);
  });

  it("attendance + leave + holiday signals roll up into the metrics block", async () => {
    const { cookies, userId } = await signupOrg();
    await createEmployeeForUser(cookies, userId);
    const other = await createOrphanEmployee(cookies);

    // Pending leave request for `other` (today inclusive). OrgBootstrap
    // seeds default leave types on signup — pick the first one rather
    // than re-creating "EL" and tripping the (org, code) unique index.
    const today = todayUTC();
    const lt = await prisma.db.leaveType.findFirstOrThrow();
    await prisma.db.leaveRequest.create({
      data: {
        organizationId: lt.organizationId,
        employeeId: other,
        leaveTypeId: lt.id,
        startDate: today,
        endDate: today,
        units: 1,
        status: "pending",
      },
    });
    // Approved leave covering today → counts toward onLeaveToday.
    await prisma.db.leaveRequest.create({
      data: {
        organizationId: lt.organizationId,
        employeeId: other,
        leaveTypeId: lt.id,
        startDate: today,
        endDate: today,
        units: 1,
        status: "approved",
        decidedAt: new Date(),
      },
    });

    // Upcoming holiday.
    const calId = (await prisma.db.holidayCalendar.findFirstOrThrow()).id;
    const future = new Date(today);
    future.setUTCDate(future.getUTCDate() + 3);
    await prisma.db.holiday.create({
      data: {
        organizationId: lt.organizationId,
        calendarId: calId,
        date: future,
        name: "Future Day",
      },
    });

    const res = await request(app.getHttpServer())
      .get("/dashboard/admin")
      .set("Cookie", cookieHeader(cookies))
      .expect(200);

    expect(res.body.metrics.onLeaveToday).toBe(1);
    expect(res.body.metrics.pendingApprovals.leave).toBe(1);
    expect(res.body.upcomingHolidays).toHaveLength(1);
    expect(res.body.upcomingHolidays[0].name).toBe("Future Day");
    expect(res.body.upcomingHolidays[0].date).toBe(
      future.toISOString().slice(0, 10),
    );
  });

  it("attendance trend has dense 7-day series with default-zero buckets", async () => {
    const { cookies } = await signupOrg();
    const res = await request(app.getHttpServer())
      .get("/dashboard/admin")
      .set("Cookie", cookieHeader(cookies))
      .expect(200);
    expect(res.body.analytics.attendanceTrend7d).toHaveLength(7);
    expect(res.body.analytics.attendanceTrend30d).toHaveLength(30);
    for (const point of res.body.analytics.attendanceTrend7d) {
      expect(point.counts).toMatchObject({
        present: 0,
        absent: 0,
        on_leave: 0,
      });
    }
  });

  it("RBAC: employee role gets 403", async () => {
    const { cookies, organizationId, userId } = await signupOrg();
    await dropToEmployeeRole(organizationId, userId);
    const res = await request(app.getHttpServer())
      .get("/dashboard/admin")
      .set("Cookie", cookieHeader(cookies));
    expect(res.status).toBe(403);
  });

  it("tenant isolation: counts only the caller's org", async () => {
    const a = await signupOrg();
    const b = await signupOrg();
    await createOrphanEmployee(b.cookies);
    await createOrphanEmployee(b.cookies);
    const res = await request(app.getHttpServer())
      .get("/dashboard/admin")
      .set("Cookie", cookieHeader(a.cookies))
      .expect(200);
    expect(res.body.metrics.totalEmployees).toBe(0);
  });

  // Regression (admin-side sibling of the v0.23.1 employee fix): the admin
  // headline used to bucket attendanceToday by startOfDayUTC(now), while
  // check-ins are stored under the employee-LOCAL calendar date. In any org
  // whose local date differs from the UTC date, a live check-in was invisible
  // to "Present today" until the UTC day caught up. The dashboard now anchors
  // on the ORG timezone's calendar day. To exercise the divergence window
  // deterministically at any wall-clock time, pick a timezone whose local
  // date differs from the UTC date right now — between UTC+14 and UTC-11 at
  // least one always does.
  it("counts a live check-in in attendanceToday when org-local date ≠ UTC date", async () => {
    const nowUtcDate = new Date().toISOString().slice(0, 10);
    const divergentTz = [
      "Pacific/Kiritimati", // UTC+14 — local date ahead of UTC from 10:00Z
      "Pacific/Pago_Pago", // UTC-11 — local date behind UTC until 11:00Z
    ].find((tz) => localDateInTimezone(new Date(), tz) !== nowUtcDate);
    expect(divergentTz).toBeDefined();

    const { cookies, organizationId, userId } = await signupOrg();
    await prisma.db.organization.update({
      where: { id: organizationId },
      data: { timezone: divergentTz! },
    });
    await createEmployeeForUser(cookies, userId);

    const ci = await request(app.getHttpServer())
      .post("/attendance/check-in")
      .set("Cookie", cookieHeader(cookies))
      .set("X-CSRF-Token", cookies.csrf!)
      .send({})
      .expect(201);

    // Stored under the org/employee-local date, which differs from UTC today.
    const localDate = localDateInTimezone(
      new Date(ci.body.checkInAt),
      divergentTz!,
    );
    expect(localDate).not.toBe(nowUtcDate);

    const res = await request(app.getHttpServer())
      .get("/dashboard/admin")
      .set("Cookie", cookieHeader(cookies))
      .expect(200);
    expect(res.body.metrics.attendanceToday.present).toBe(1);

    // The live local day must also be the last bucket of the 7-day trend.
    const trend = res.body.analytics.attendanceTrend7d as {
      date: string;
      counts: Record<string, number>;
    }[];
    expect(trend.at(-1)?.date).toBe(localDate);
    expect(trend.at(-1)?.counts.present).toBe(1);
  });
});

// ─── Employee dashboard ──────────────────────────────────────────────

describe("GET /dashboard/employee", () => {
  it("returns the expected top-level shape for a freshly-created employee", async () => {
    const { cookies, userId } = await signupOrg();
    await createEmployeeForUser(cookies, userId);
    const res = await request(app.getHttpServer())
      .get("/dashboard/employee")
      .set("Cookie", cookieHeader(cookies))
      .expect(200);

    expect(res.body).toMatchObject({
      me: { employeeId: expect.any(String) },
      todayStatus: {
        date: expect.any(String),
        attendance: null,
      },
      leaveBalances: [],
      upcomingLeave: null,
      pendingTasks: {
        regularizations: 0,
        documentAcknowledgements: 0,
        announcementAcknowledgements: 0,
      },
      announcements: [],
      upcomingHolidays: [],
      recentDocuments: [],
      expiringDocuments: [],
    });
    expect(res.body.attendanceLast7Days).toHaveLength(7);
  });

  it("surfaces pending acks (docs + announcements) and recent announcements", async () => {
    const { cookies, userId } = await signupOrg();
    await createEmployeeForUser(cookies, userId);

    // Required, in-audience, published doc the user has not acked.
    const catRes = await request(app.getHttpServer())
      .post("/documents/categories")
      .set("Cookie", cookieHeader(cookies))
      .set("X-CSRF-Token", cookies.csrf!)
      .send({ name: "P" })
      .expect(201);
    await request(app.getHttpServer())
      .post("/documents")
      .set("Cookie", cookieHeader(cookies))
      .set("X-CSRF-Token", cookies.csrf!)
      .send({
        categoryId: catRes.body.id,
        title: "Must",
        file: {
          storageKey: "k",
          fileName: "policy.pdf",
          mimeType: "application/pdf",
          sizeBytes: 100,
        },
        audiences: [{ type: "all_employees" }],
        isRequired: true,
        publishNow: true,
      })
      .expect(201);

    // Required announcement, published, not acked.
    const annRes = await request(app.getHttpServer())
      .post("/announcements")
      .set("Cookie", cookieHeader(cookies))
      .set("X-CSRF-Token", cookies.csrf!)
      .send({
        title: "Read me",
        bodyHtml: "<p>...</p>",
        requiresAcknowledgment: true,
        audiences: [{ type: "all_employees" }],
      })
      .expect(201);
    await request(app.getHttpServer())
      .post(`/announcements/${annRes.body.id}/publish`)
      .set("Cookie", cookieHeader(cookies))
      .set("X-CSRF-Token", cookies.csrf!)
      .send({})
      .expect(201);

    const res = await request(app.getHttpServer())
      .get("/dashboard/employee")
      .set("Cookie", cookieHeader(cookies))
      .expect(200);

    expect(res.body.pendingTasks.documentAcknowledgements).toBe(1);
    expect(res.body.pendingTasks.announcementAcknowledgements).toBe(1);
    expect(res.body.announcements).toHaveLength(1);
    expect(res.body.recentDocuments).toHaveLength(1);
  });

  it("authenticated user with no employee record gets 404", async () => {
    const { cookies } = await signupOrg();
    const res = await request(app.getHttpServer())
      .get("/dashboard/employee")
      .set("Cookie", cookieHeader(cookies));
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("employee.not_found");
  });

  it("returns only the calling employee's data — cross-employee isolation", async () => {
    const a = await signupOrg();
    const b = await signupOrg();
    const aEmp = await createEmployeeForUser(a.cookies, a.userId);
    const bEmp = await createEmployeeForUser(b.cookies, b.userId);

    const ares = await request(app.getHttpServer())
      .get("/dashboard/employee")
      .set("Cookie", cookieHeader(a.cookies))
      .expect(200);
    const bres = await request(app.getHttpServer())
      .get("/dashboard/employee")
      .set("Cookie", cookieHeader(b.cookies))
      .expect(200);

    expect(ares.body.me.employeeId).toBe(aEmp);
    expect(bres.body.me.employeeId).toBe(bEmp);
    expect(ares.body.me.employeeId).not.toBe(bres.body.me.employeeId);
  });

  it("employee role can read its own dashboard", async () => {
    const { cookies, organizationId, userId } = await signupOrg();
    await createEmployeeForUser(cookies, userId);
    await dropToEmployeeRole(organizationId, userId);
    const res = await request(app.getHttpServer())
      .get("/dashboard/employee")
      .set("Cookie", cookieHeader(cookies));
    expect(res.status).toBe(200);
  });

  // Regression: the dashboard used to scope today's attendance lookup by
  // startOfDayUTC(now) while the check-in writer stamps attendanceDate from
  // the employee-local calendar date (resolveEmployeeTimezone +
  // localDateInTimezone). For any non-UTC org the two keys diverge during
  // part of every day, leaving the dashboard unable to find the open row the
  // service itself just refused to overwrite ("attendance.already_checked_in"
  // while UI reads "haven't checked in"). See db06f48.
  it("surfaces today's attendance using the employee-local date, not UTC", async () => {
    const TZ = "America/Los_Angeles";
    const { cookies, organizationId, userId } = await signupOrg();
    await prisma.db.organization.update({
      where: { id: organizationId },
      data: { timezone: TZ },
    });
    const empId = await createEmployeeForUser(cookies, userId);

    const ci = await request(app.getHttpServer())
      .post("/attendance/check-in")
      .set("Cookie", cookieHeader(cookies))
      .set("X-CSRF-Token", cookies.csrf!)
      .send({})
      .expect(201);

    const expectedLocalDate = localDateInTimezone(
      new Date(ci.body.checkInAt),
      TZ,
    );
    const utcToday = todayUTC().toISOString().slice(0, 10);

    // Writer side: attendance_date must be the employee-LOCAL calendar date.
    const row = await prisma.db.attendanceRecord.findUniqueOrThrow({
      where: { id: ci.body.id },
    });
    expect(row.employeeId).toBe(empId);
    expect(row.attendanceDate.toISOString().slice(0, 10)).toBe(
      expectedLocalDate,
    );

    // Reader side: dashboard must look up by the same local key and return the row.
    const dash = await request(app.getHttpServer())
      .get("/dashboard/employee")
      .set("Cookie", cookieHeader(cookies))
      .expect(200);
    expect(dash.body.todayStatus.date).toBe(expectedLocalDate);
    expect(dash.body.todayStatus.attendance?.id).toBe(ci.body.id);

    // The 7-day series must be anchored on the same local day: its last
    // bucket is local-today and carries the live check-in. (Previously the
    // window was UTC-anchored, so an east-of-UTC "tomorrow" row vanished
    // from the series even while todayStatus showed it.)
    const series = dash.body.attendanceLast7Days as {
      date: string;
      status: string | null;
    }[];
    expect(series.at(-1)?.date).toBe(expectedLocalDate);
    expect(series.at(-1)?.status).toBe("present");

    // Cross-day witness: when the wall clock places us in the UTC ≠ PDT
    // window (PDT 17:00–23:59 = UTC 00:00–06:59 next day), expectedLocalDate
    // is strictly less than UTC today. The assertions above already cover
    // both sides; this guard makes it explicit that we'd previously have
    // returned `attendance: null` here.
    if (expectedLocalDate !== utcToday) {
      expect(dash.body.todayStatus.date).not.toBe(utcToday);
    }
  });
});
