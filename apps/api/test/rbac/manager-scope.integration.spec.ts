/**
 * Integration tests for manager team-scoping (v0.23.2 RC).
 *
 * A manager (employee.read/attendance.read/leave.read/leave.approve at
 * PermissionScope.team) must see only their own + direct/indirect reports, and
 * may only approve/cancel their team's leave. hr_admin / super_admin keep
 * org-wide visibility.
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
import { LeaveModule } from "../../src/leave/leave.module";
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
    LeaveModule,
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

/** Signs up a new org. The signup user becomes super_admin. */
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

/** Creates an employee (admin call) and returns its id. */
async function createEmployee(
  cookies: CookieBag,
  overrides: Record<string, unknown> = {},
): Promise<string> {
  unique += 1;
  const res = await request(app.getHttpServer())
    .post("/employees")
    .set("Cookie", cookieHeader(cookies))
    .set("X-CSRF-Token", cookies.csrf!)
    .send({
      employeeCode: `E-${unique}-${Date.now()}`,
      firstName: "Emp",
      lastName: `N${unique}`,
      workEmail: `e-${unique}-${Date.now()}@acme.test`,
      ...overrides,
    })
    .expect(201);
  return res.body.id;
}

/** Make a fresh user that owns `employeeId` and holds only the given role. */
async function makeUserWithRole(
  organizationId: string,
  employeeId: string,
  roleKey: string,
): Promise<CookieBag> {
  unique += 1;
  const email = `role-${unique}-${Date.now()}@acme.test`;
  // Register a user via signup would create a new org; instead create directly.
  const password = "hunter22hunter22";
  const argon2 = (await import("argon2")).default;
  const passwordHash = await argon2.hash(password, { type: argon2.argon2id });
  const user = await prisma.db.user.create({
    data: {
      organizationId,
      email,
      passwordHash,
      status: "active",
      emailVerifiedAt: new Date(),
      defaultPortal: roleKey === "employee" ? "employee" : "admin",
    },
  });
  const role = await prisma.db.role.findFirstOrThrow({
    where: { organizationId, key: roleKey },
  });
  await prisma.db.userRole.create({
    data: { organizationId, userId: user.id, roleId: role.id },
  });
  await prisma.db.employee.update({
    where: { id: employeeId },
    data: { userId: user.id },
  });
  const res = await request(app.getHttpServer())
    .post("/auth/signin")
    .send({ email, password })
    .expect(200);
  return parseCookies(res.headers["set-cookie"]);
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
  await prisma.db.leaveApproval.deleteMany();
  await prisma.db.leaveRequest.deleteMany();
  await prisma.db.leaveBalance.deleteMany();
  await prisma.db.leaveType.deleteMany();
  await prisma.db.attendanceRecord.deleteMany();
  await prisma.db.auditLog.deleteMany();
  await prisma.db.employee.deleteMany();
  await prisma.db.refreshToken.deleteMany();
  await prisma.db.userRole.deleteMany();
  await prisma.db.rolePermission.deleteMany();
  await prisma.db.role.deleteMany();
  await prisma.db.user.deleteMany();
  await prisma.db.organization.deleteMany();
});

describe("manager team-scoping", () => {
  it("manager sees only their team in /employees; super_admin sees all", async () => {
    const admin = await signupOrg();
    // Build a hierarchy: manager → report1 → report2 (indirect); plus an
    // unrelated outsider under nobody.
    const managerEmp = await createEmployee(admin.cookies);
    const report1 = await createEmployee(admin.cookies, {
      managerId: managerEmp,
    });
    const report2 = await createEmployee(admin.cookies, {
      managerId: report1,
    });
    const outsider = await createEmployee(admin.cookies);

    // super_admin (the signup user) sees everyone (4 + their own seeded? none)
    const adminList = await request(app.getHttpServer())
      .get("/employees?pageSize=100")
      .set("Cookie", cookieHeader(admin.cookies))
      .expect(200);
    const adminIds = new Set(
      adminList.body.items.map((e: { id: string }) => e.id),
    );
    expect(adminIds.has(outsider)).toBe(true);
    expect(adminIds.has(report2)).toBe(true);

    // manager sees only self + report1 + report2, NOT the outsider
    const mgr = await makeUserWithRole(
      admin.organizationId,
      managerEmp,
      "manager",
    );
    const mgrList = await request(app.getHttpServer())
      .get("/employees?pageSize=100")
      .set("Cookie", cookieHeader(mgr))
      .expect(200);
    const mgrIds = new Set(mgrList.body.items.map((e: { id: string }) => e.id));
    expect(mgrIds.has(managerEmp)).toBe(true);
    expect(mgrIds.has(report1)).toBe(true);
    expect(mgrIds.has(report2)).toBe(true);
    expect(mgrIds.has(outsider)).toBe(false);
    expect(mgrIds.size).toBe(3);
  });

  // Detail/by-id endpoints must apply the SAME team scope as the list endpoints
  // (regression for the Phase 3 broken-access-control finding: a manager could
  // read an outside-team employee/attendance/balance directly by id even though
  // the list views were scoped).
  it("manager GET /employees/:id is 404 for an outsider, 200 for a team member", async () => {
    const admin = await signupOrg();
    const managerEmp = await createEmployee(admin.cookies);
    const report = await createEmployee(admin.cookies, {
      managerId: managerEmp,
    });
    const outsider = await createEmployee(admin.cookies);
    const mgr = await makeUserWithRole(
      admin.organizationId,
      managerEmp,
      "manager",
    );

    await request(app.getHttpServer())
      .get(`/employees/${report}`)
      .set("Cookie", cookieHeader(mgr))
      .expect(200);
    await request(app.getHttpServer())
      .get(`/employees/${outsider}`)
      .set("Cookie", cookieHeader(mgr))
      .expect(404);
    // super_admin (global scope) is unaffected.
    await request(app.getHttpServer())
      .get(`/employees/${outsider}`)
      .set("Cookie", cookieHeader(admin.cookies))
      .expect(200);
  });

  it("manager GET /attendance/:id is 404 for an outsider's record", async () => {
    const admin = await signupOrg();
    const managerEmp = await createEmployee(admin.cookies);
    const report = await createEmployee(admin.cookies, {
      managerId: managerEmp,
    });
    const outsider = await createEmployee(admin.cookies);
    const mkRec = (employeeId: string) =>
      prisma.db.attendanceRecord.create({
        data: {
          organizationId: admin.organizationId,
          employeeId,
          attendanceDate: new Date("2026-07-01"),
          status: "present",
        },
      });
    const teamRec = await mkRec(report);
    const outsiderRec = await mkRec(outsider);
    const mgr = await makeUserWithRole(
      admin.organizationId,
      managerEmp,
      "manager",
    );

    await request(app.getHttpServer())
      .get(`/attendance/${teamRec.id}`)
      .set("Cookie", cookieHeader(mgr))
      .expect(200);
    await request(app.getHttpServer())
      .get(`/attendance/${outsiderRec.id}`)
      .set("Cookie", cookieHeader(mgr))
      .expect(404);
  });

  it("manager GET /leave/balances excludes outsiders even when targeted by employeeId", async () => {
    const admin = await signupOrg();
    const managerEmp = await createEmployee(admin.cookies);
    const report = await createEmployee(admin.cookies, {
      managerId: managerEmp,
    });
    const outsider = await createEmployee(admin.cookies);
    const lt = await prisma.db.leaveType.findFirstOrThrow({
      where: { organizationId: admin.organizationId },
    });
    const mkBal = (employeeId: string) =>
      prisma.db.leaveBalance.create({
        data: {
          organizationId: admin.organizationId,
          employeeId,
          leaveTypeId: lt.id,
          cycleYear: 2026,
          allocated: 12,
        },
      });
    await mkBal(report);
    await mkBal(outsider);
    const mgr = await makeUserWithRole(
      admin.organizationId,
      managerEmp,
      "manager",
    );

    // Targeting the outsider directly returns nothing.
    const targeted = await request(app.getHttpServer())
      .get(`/leave/balances?employeeId=${outsider}`)
      .set("Cookie", cookieHeader(mgr))
      .expect(200);
    expect(targeted.body.items).toHaveLength(0);

    // Unfiltered, the manager sees only their team's balances.
    const all = await request(app.getHttpServer())
      .get("/leave/balances?pageSize=100")
      .set("Cookie", cookieHeader(mgr))
      .expect(200);
    const empIds = new Set(
      all.body.items.map((b: { employeeId: string }) => b.employeeId),
    );
    expect(empIds.has(report)).toBe(true);
    expect(empIds.has(outsider)).toBe(false);
  });

  it("manager can approve a team member's leave but NOT an outsider's", async () => {
    const admin = await signupOrg();
    const managerEmp = await createEmployee(admin.cookies);
    const report = await createEmployee(admin.cookies, {
      managerId: managerEmp,
    });
    const outsider = await createEmployee(admin.cookies);

    // Use a leave type seeded by org bootstrap on signup.
    const lt = await prisma.db.leaveType.findFirstOrThrow({
      where: { organizationId: admin.organizationId },
    });
    const mkReq = (employeeId: string) =>
      prisma.db.leaveRequest.create({
        data: {
          organizationId: admin.organizationId,
          employeeId,
          leaveTypeId: lt.id,
          startDate: new Date("2026-07-01"),
          endDate: new Date("2026-07-01"),
          units: 1,
          status: "pending",
        },
      });
    const teamReq = await mkReq(report);
    const outsiderReq = await mkReq(outsider);

    const mgr = await makeUserWithRole(
      admin.organizationId,
      managerEmp,
      "manager",
    );
    const csrf = mgr.csrf!;

    // team member's request → approve OK
    await request(app.getHttpServer())
      .patch(`/leave/requests/${teamReq.id}/approve`)
      .set("Cookie", cookieHeader(mgr))
      .set("X-CSRF-Token", csrf)
      .send({})
      .expect(200);

    // outsider's request → 403 (not in team)
    await request(app.getHttpServer())
      .patch(`/leave/requests/${outsiderReq.id}/approve`)
      .set("Cookie", cookieHeader(mgr))
      .set("X-CSRF-Token", csrf)
      .send({})
      .expect(403);
  });

  it("manager can reject a team member's leave but NOT an outsider's", async () => {
    const admin = await signupOrg();
    const managerEmp = await createEmployee(admin.cookies);
    const report = await createEmployee(admin.cookies, {
      managerId: managerEmp,
    });
    const outsider = await createEmployee(admin.cookies);

    const lt = await prisma.db.leaveType.findFirstOrThrow({
      where: { organizationId: admin.organizationId },
    });
    const mkReq = (employeeId: string) =>
      prisma.db.leaveRequest.create({
        data: {
          organizationId: admin.organizationId,
          employeeId,
          leaveTypeId: lt.id,
          startDate: new Date("2026-08-01"),
          endDate: new Date("2026-08-01"),
          units: 1,
          status: "pending",
        },
      });
    const teamReq = await mkReq(report);
    const outsiderReq = await mkReq(outsider);

    const mgr = await makeUserWithRole(
      admin.organizationId,
      managerEmp,
      "manager",
    );
    const csrf = mgr.csrf!;

    // team member's request → reject OK, status persisted
    await request(app.getHttpServer())
      .patch(`/leave/requests/${teamReq.id}/reject`)
      .set("Cookie", cookieHeader(mgr))
      .set("X-CSRF-Token", csrf)
      .send({ comment: "not this week" })
      .expect(200);
    const rejected = await prisma.db.leaveRequest.findUniqueOrThrow({
      where: { id: teamReq.id },
    });
    expect(rejected.status).toBe("rejected");

    // outsider's request → 403 (not in team)
    await request(app.getHttpServer())
      .patch(`/leave/requests/${outsiderReq.id}/reject`)
      .set("Cookie", cookieHeader(mgr))
      .set("X-CSRF-Token", csrf)
      .send({})
      .expect(403);
  });

  it("manager's /leave/requests list excludes outsiders", async () => {
    const admin = await signupOrg();
    const managerEmp = await createEmployee(admin.cookies);
    const report = await createEmployee(admin.cookies, {
      managerId: managerEmp,
    });
    const outsider = await createEmployee(admin.cookies);
    const lt = await prisma.db.leaveType.findFirstOrThrow({
      where: { organizationId: admin.organizationId },
    });
    for (const eid of [report, outsider]) {
      await prisma.db.leaveRequest.create({
        data: {
          organizationId: admin.organizationId,
          employeeId: eid,
          leaveTypeId: lt.id,
          startDate: new Date("2026-07-01"),
          endDate: new Date("2026-07-01"),
          units: 1,
          status: "pending",
        },
      });
    }
    const mgr = await makeUserWithRole(
      admin.organizationId,
      managerEmp,
      "manager",
    );
    const res = await request(app.getHttpServer())
      .get("/leave/requests?pageSize=100")
      .set("Cookie", cookieHeader(mgr))
      .expect(200);
    const empIds = res.body.items.map(
      (r: { employeeId: string }) => r.employeeId,
    );
    expect(empIds).toContain(report);
    expect(empIds).not.toContain(outsider);
  });
});
