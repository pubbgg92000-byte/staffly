/**
 * Integration tests for Batch 5 — Attendance (policies, records, regularization).
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
import { AttendanceModule } from "../../src/attendance/attendance.module";
import { JwtAuthGuard } from "../../src/auth/guards/jwt-auth.guard";
import { CsrfGuard } from "../../src/auth/guards/csrf.guard";
import { PermissionGuard } from "../../src/rbac/permission.guard";
import { TenantInterceptor } from "../../src/tenant/tenant.interceptor";
import { GlobalExceptionFilter } from "../../src/common/http-exception.filter";
import { resetEnvCacheForTests } from "../../src/infra/config/env";
import { PrismaService } from "../../src/infra/prisma/prisma.service";
import { ACCESS_COOKIE, CSRF_COOKIE } from "../../src/auth/cookies";

@Module({
  imports: [
    PrismaModule,
    AuditModule,
    AuthModule,
    RbacModule,
    OrgStructureModule,
    EmployeesModule,
    AttendanceModule,
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
  email: string;
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
    email: payload.email,
  };
}

/** Create an employee tied to the signup user. Required for self check-in. */
async function createEmployeeForUser(
  cookies: CookieBag,
  organizationId: string,
  userId: string,
  overrides: Record<string, unknown> = {},
): Promise<string> {
  const res = await request(app.getHttpServer())
    .post("/employees")
    .set("Cookie", cookieHeader(cookies))
    .set("X-CSRF-Token", cookies.csrf!)
    .send({
      employeeCode: `E-${unique}`,
      firstName: "Test",
      lastName: "Self",
      workEmail: `tself-${unique}-${Date.now()}@acme.test`,
      ...overrides,
    })
    .expect(201);
  // Link to user via direct DB (no endpoint yet for linking).
  await prisma.db.employee.update({
    where: { id: res.body.id },
    data: { userId },
  });
  void organizationId;
  return res.body.id;
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
}, 180_000);

afterAll(async () => {
  await app?.close();
  await container?.stop();
});

beforeEach(async () => {
  await prisma.db.attendanceRecord.deleteMany();
  await prisma.db.attendanceRegularization.deleteMany();
  await prisma.db.attendancePolicy.deleteMany();
  await prisma.db.auditLog.deleteMany();
  await prisma.db.employee.deleteMany();
  await prisma.db.refreshToken.deleteMany();
  await prisma.db.userRole.deleteMany();
  await prisma.db.rolePermission.deleteMany();
  await prisma.db.role.deleteMany();
  await prisma.db.user.deleteMany();
  await prisma.db.organization.deleteMany();
});

// ─── Policies ─────────────────────────────────────────────────────────────

describe("attendance policies CRUD", () => {
  it("create + list + get + update + only-one-default", async () => {
    const { cookies } = await signupOrg();

    const a = await request(app.getHttpServer())
      .post("/attendance-policies")
      .set("Cookie", cookieHeader(cookies))
      .set("X-CSRF-Token", cookies.csrf!)
      .send({ name: "Standard", isDefault: true })
      .expect(201);
    expect(a.body.isDefault).toBe(true);

    const b = await request(app.getHttpServer())
      .post("/attendance-policies")
      .set("Cookie", cookieHeader(cookies))
      .set("X-CSRF-Token", cookies.csrf!)
      .send({ name: "Flex", isDefault: true })
      .expect(201);
    expect(b.body.isDefault).toBe(true);

    const list = await request(app.getHttpServer())
      .get("/attendance-policies")
      .set("Cookie", cookieHeader(cookies))
      .expect(200);
    expect(list.body.items).toHaveLength(2);
    const defaults = list.body.items.filter(
      (p: { isDefault: boolean }) => p.isDefault,
    );
    expect(defaults).toHaveLength(1);
    expect(defaults[0].name).toBe("Flex");
  });

  it("duplicate name → 409", async () => {
    const { cookies } = await signupOrg();
    await request(app.getHttpServer())
      .post("/attendance-policies")
      .set("Cookie", cookieHeader(cookies))
      .set("X-CSRF-Token", cookies.csrf!)
      .send({ name: "Default" })
      .expect(201);
    const dup = await request(app.getHttpServer())
      .post("/attendance-policies")
      .set("Cookie", cookieHeader(cookies))
      .set("X-CSRF-Token", cookies.csrf!)
      .send({ name: "Default" });
    expect(dup.status).toBe(409);
  });

  it("RBAC: employee role denied", async () => {
    const { cookies, organizationId, userId } = await signupOrg();
    await prisma.db.userRole.deleteMany({ where: { userId } });
    const emp = await prisma.db.role.findFirstOrThrow({
      where: { organizationId, key: "employee" },
    });
    await prisma.db.userRole.create({
      data: { organizationId, userId, roleId: emp.id },
    });
    const res = await request(app.getHttpServer())
      .post("/attendance-policies")
      .set("Cookie", cookieHeader(cookies))
      .set("X-CSRF-Token", cookies.csrf!)
      .send({ name: "X" });
    expect(res.status).toBe(403);
  });
});

// ─── Records: check-in / check-out / me ────────────────────────────────

describe("attendance check-in / out", () => {
  it("self check-in creates today's record, second call rejects", async () => {
    const { cookies, organizationId, userId } = await signupOrg();
    await createEmployeeForUser(cookies, organizationId, userId);

    const ci = await request(app.getHttpServer())
      .post("/attendance/check-in")
      .set("Cookie", cookieHeader(cookies))
      .set("X-CSRF-Token", cookies.csrf!)
      .send({});
    expect(ci.status).toBe(201);
    expect(ci.body.checkInAt).toBeTruthy();
    expect(ci.body.status).toBe("present");

    const dup = await request(app.getHttpServer())
      .post("/attendance/check-in")
      .set("Cookie", cookieHeader(cookies))
      .set("X-CSRF-Token", cookies.csrf!)
      .send({});
    expect(dup.status).toBe(400);
    expect(dup.body.error.code).toBe("attendance.already_checked_in");
  });

  it("check-out computes workedMinutes and marks half_day if short", async () => {
    const { cookies, organizationId, userId } = await signupOrg();
    await createEmployeeForUser(cookies, organizationId, userId);

    await request(app.getHttpServer())
      .post("/attendance-policies")
      .set("Cookie", cookieHeader(cookies))
      .set("X-CSRF-Token", cookies.csrf!)
      .send({ name: "Std", isDefault: true, halfDayThresholdHours: 4 })
      .expect(201);

    const ci = await request(app.getHttpServer())
      .post("/attendance/check-in")
      .set("Cookie", cookieHeader(cookies))
      .set("X-CSRF-Token", cookies.csrf!)
      .send({})
      .expect(201);

    // Rewind check-in by 30 minutes so check-out yields a definite < threshold worked time.
    await prisma.db.attendanceRecord.update({
      where: { id: ci.body.id },
      data: { checkInAt: new Date(Date.now() - 30 * 60 * 1000) },
    });

    const co = await request(app.getHttpServer())
      .post("/attendance/check-out")
      .set("Cookie", cookieHeader(cookies))
      .set("X-CSRF-Token", cookies.csrf!)
      .send({});
    expect(co.status).toBe(201);
    expect(co.body.workedMinutes).toBeGreaterThanOrEqual(29);
    expect(co.body.status).toBe("half_day");
  });

  it("check-out without check-in → 400", async () => {
    const { cookies, organizationId, userId } = await signupOrg();
    await createEmployeeForUser(cookies, organizationId, userId);
    const res = await request(app.getHttpServer())
      .post("/attendance/check-out")
      .set("Cookie", cookieHeader(cookies))
      .set("X-CSRF-Token", cookies.csrf!)
      .send({});
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("attendance.not_checked_in");
  });

  it("attendance/me returns today's record and timezone", async () => {
    const { cookies, organizationId, userId } = await signupOrg();
    await createEmployeeForUser(cookies, organizationId, userId);
    await request(app.getHttpServer())
      .post("/attendance/check-in")
      .set("Cookie", cookieHeader(cookies))
      .set("X-CSRF-Token", cookies.csrf!)
      .send({})
      .expect(201);
    const me = await request(app.getHttpServer())
      .get("/attendance/me")
      .set("Cookie", cookieHeader(cookies));
    expect(me.status).toBe(200);
    expect(me.body.timezone).toBe("Etc/UTC");
    expect(me.body.record).not.toBeNull();
  });

  it("admin can check in another employee with attendance.write", async () => {
    const { cookies, organizationId, userId } = await signupOrg();
    await createEmployeeForUser(cookies, organizationId, userId);
    // Create a second employee (no userId link)
    const second = await request(app.getHttpServer())
      .post("/employees")
      .set("Cookie", cookieHeader(cookies))
      .set("X-CSRF-Token", cookies.csrf!)
      .send({
        employeeCode: "E-OTHER",
        firstName: "Other",
        lastName: "Person",
        workEmail: "other@acme.test",
      })
      .expect(201);
    const res = await request(app.getHttpServer())
      .post("/attendance/check-in")
      .set("Cookie", cookieHeader(cookies))
      .set("X-CSRF-Token", cookies.csrf!)
      .send({ employeeId: second.body.id });
    expect(res.status).toBe(201);
    expect(res.body.employeeId).toBe(second.body.id);
  });

  it("non-admin punching another employee → 403", async () => {
    const { cookies, organizationId, userId } = await signupOrg();
    await createEmployeeForUser(cookies, organizationId, userId);
    const second = await request(app.getHttpServer())
      .post("/employees")
      .set("Cookie", cookieHeader(cookies))
      .set("X-CSRF-Token", cookies.csrf!)
      .send({
        employeeCode: "E-X",
        firstName: "X",
        lastName: "Y",
        workEmail: "xy@acme.test",
      })
      .expect(201);

    // Downgrade caller to employee role (no attendance.write).
    await prisma.db.userRole.deleteMany({ where: { userId } });
    const emp = await prisma.db.role.findFirstOrThrow({
      where: { organizationId, key: "employee" },
    });
    await prisma.db.userRole.create({
      data: { organizationId, userId, roleId: emp.id },
    });

    const res = await request(app.getHttpServer())
      .post("/attendance/check-in")
      .set("Cookie", cookieHeader(cookies))
      .set("X-CSRF-Token", cookies.csrf!)
      .send({ employeeId: second.body.id });
    expect(res.status).toBe(403);
  });
});

// ─── Records listing ───────────────────────────────────────────────────

describe("attendance records listing", () => {
  it("filter by date range and pagination", async () => {
    const { cookies, organizationId, userId } = await signupOrg();
    const empId = await createEmployeeForUser(cookies, organizationId, userId);
    // Seed 3 records on different dates directly.
    const dates = ["2026-05-01", "2026-05-02", "2026-05-03"];
    for (const d of dates) {
      await prisma.db.attendanceRecord.create({
        data: {
          organizationId,
          employeeId: empId,
          attendanceDate: new Date(d),
          status: "present",
        },
      });
    }
    const res = await request(app.getHttpServer())
      .get("/attendance?from=2026-05-02&to=2026-05-03&pageSize=1&page=1")
      .set("Cookie", cookieHeader(cookies));
    expect(res.status).toBe(200);
    expect(res.body.meta.total).toBe(2);
    expect(res.body.items).toHaveLength(1);
  });

  it("requires attendance.read", async () => {
    const { cookies, organizationId, userId } = await signupOrg();
    await prisma.db.userRole.deleteMany({ where: { userId } });
    const emp = await prisma.db.role.findFirstOrThrow({
      where: { organizationId, key: "employee" },
    });
    await prisma.db.userRole.create({
      data: { organizationId, userId, roleId: emp.id },
    });
    const res = await request(app.getHttpServer())
      .get("/attendance")
      .set("Cookie", cookieHeader(cookies));
    expect(res.status).toBe(403);
  });
});

// ─── Regularizations ───────────────────────────────────────────────────

describe("regularization workflow", () => {
  it("employee submits, admin approves, record materializes", async () => {
    const { cookies, organizationId, userId } = await signupOrg();
    const empId = await createEmployeeForUser(cookies, organizationId, userId);

    const create = await request(app.getHttpServer())
      .post("/attendance/regularizations")
      .set("Cookie", cookieHeader(cookies))
      .set("X-CSRF-Token", cookies.csrf!)
      .send({
        attendanceDate: "2026-04-10",
        requestedCheckInAt: "2026-04-10T09:00:00.000Z",
        requestedCheckOutAt: "2026-04-10T18:00:00.000Z",
        reason: "forgot to punch",
      });
    expect(create.status).toBe(201);
    expect(create.body.status).toBe("pending");

    const list = await request(app.getHttpServer())
      .get("/attendance/regularizations?status=pending")
      .set("Cookie", cookieHeader(cookies));
    expect(list.body.items).toHaveLength(1);

    const decide = await request(app.getHttpServer())
      .post(`/attendance/regularizations/${create.body.id}/decide`)
      .set("Cookie", cookieHeader(cookies))
      .set("X-CSRF-Token", cookies.csrf!)
      .send({ decision: "approved", comment: "ok" });
    expect(decide.status).toBe(201);
    expect(decide.body.status).toBe("approved");

    const record = await prisma.db.attendanceRecord.findUnique({
      where: {
        employeeId_attendanceDate: {
          employeeId: empId,
          attendanceDate: new Date("2026-04-10"),
        },
      },
    });
    expect(record).not.toBeNull();
    expect(record!.isRegularized).toBe(true);
  });

  it("reject does not create record", async () => {
    const { cookies, organizationId, userId } = await signupOrg();
    const empId = await createEmployeeForUser(cookies, organizationId, userId);
    const create = await request(app.getHttpServer())
      .post("/attendance/regularizations")
      .set("Cookie", cookieHeader(cookies))
      .set("X-CSRF-Token", cookies.csrf!)
      .send({
        attendanceDate: "2026-04-11",
        requestedCheckInAt: "2026-04-11T09:00:00.000Z",
        reason: "missed punch",
      })
      .expect(201);
    await request(app.getHttpServer())
      .post(`/attendance/regularizations/${create.body.id}/decide`)
      .set("Cookie", cookieHeader(cookies))
      .set("X-CSRF-Token", cookies.csrf!)
      .send({ decision: "rejected" })
      .expect(201);
    const r = await prisma.db.attendanceRecord.findUnique({
      where: {
        employeeId_attendanceDate: {
          employeeId: empId,
          attendanceDate: new Date("2026-04-11"),
        },
      },
    });
    expect(r).toBeNull();
  });

  it("double-decide → 400", async () => {
    const { cookies, organizationId, userId } = await signupOrg();
    await createEmployeeForUser(cookies, organizationId, userId);
    const c = await request(app.getHttpServer())
      .post("/attendance/regularizations")
      .set("Cookie", cookieHeader(cookies))
      .set("X-CSRF-Token", cookies.csrf!)
      .send({
        attendanceDate: "2026-04-12",
        requestedCheckInAt: "2026-04-12T09:00:00.000Z",
        reason: "missed punch",
      })
      .expect(201);
    await request(app.getHttpServer())
      .post(`/attendance/regularizations/${c.body.id}/decide`)
      .set("Cookie", cookieHeader(cookies))
      .set("X-CSRF-Token", cookies.csrf!)
      .send({ decision: "approved" })
      .expect(201);
    const second = await request(app.getHttpServer())
      .post(`/attendance/regularizations/${c.body.id}/decide`)
      .set("Cookie", cookieHeader(cookies))
      .set("X-CSRF-Token", cookies.csrf!)
      .send({ decision: "rejected" });
    expect(second.status).toBe(400);
  });
});

// ─── Tenant isolation ────────────────────────────────────────────────────

describe("tenant isolation", () => {
  it("Org-A cannot see Org-B records", async () => {
    const a = await signupOrg();
    const b = await signupOrg();
    await createEmployeeForUser(a.cookies, a.organizationId, a.userId);
    await createEmployeeForUser(b.cookies, b.organizationId, b.userId);
    await request(app.getHttpServer())
      .post("/attendance/check-in")
      .set("Cookie", cookieHeader(a.cookies))
      .set("X-CSRF-Token", a.cookies.csrf!)
      .send({})
      .expect(201);
    await request(app.getHttpServer())
      .post("/attendance/check-in")
      .set("Cookie", cookieHeader(b.cookies))
      .set("X-CSRF-Token", b.cookies.csrf!)
      .send({})
      .expect(201);
    const listA = await request(app.getHttpServer())
      .get("/attendance")
      .set("Cookie", cookieHeader(a.cookies));
    expect(listA.body.items).toHaveLength(1);
    expect(listA.body.items[0].organizationId).toBe(a.organizationId);
  });
});

// ─── Audit ───────────────────────────────────────────────────────────────

describe("attendance audit logs", () => {
  it("check-in + check-out logged", async () => {
    const { cookies, organizationId, userId } = await signupOrg();
    await createEmployeeForUser(cookies, organizationId, userId);
    await request(app.getHttpServer())
      .post("/attendance/check-in")
      .set("Cookie", cookieHeader(cookies))
      .set("X-CSRF-Token", cookies.csrf!)
      .send({})
      .expect(201);
    await request(app.getHttpServer())
      .post("/attendance/check-out")
      .set("Cookie", cookieHeader(cookies))
      .set("X-CSRF-Token", cookies.csrf!)
      .send({})
      .expect(201);
    const logs = await prisma.db.auditLog.findMany({
      where: { organizationId, resourceType: "attendance_record" },
      orderBy: { createdAt: "asc" },
    });
    expect(logs.map((l) => l.action)).toEqual([
      "attendance.check_in",
      "attendance.check_out",
    ]);
  });
});
