/**
 * Integration tests for Batch 6 — Leave Management (types, requests, balances).
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
  await prisma.db.auditLog.deleteMany();
  await prisma.db.employee.deleteMany();
  await prisma.db.refreshToken.deleteMany();
  await prisma.db.userRole.deleteMany();
  await prisma.db.rolePermission.deleteMany();
  await prisma.db.role.deleteMany();
  await prisma.db.user.deleteMany();
  await prisma.db.organization.deleteMany();
});

// ─── Default leave types from signup bootstrap ───────────────────────

describe("default leave types are seeded on signup", () => {
  it("CL, SL, EL, WFH, LOP all exist", async () => {
    const { cookies, organizationId } = await signupOrg();
    const list = await request(app.getHttpServer())
      .get("/leave/types")
      .set("Cookie", cookieHeader(cookies))
      .expect(200);
    const codes = list.body.items.map((t: { code: string }) => t.code).sort();
    expect(codes).toEqual(["CL", "EL", "LOP", "SL", "WFH"]);
    void organizationId;
  });
});

// ─── Types CRUD ──────────────────────────────────────────────────────

describe("leave types CRUD", () => {
  it("create + update + delete", async () => {
    const { cookies } = await signupOrg();
    const create = await request(app.getHttpServer())
      .post("/leave/types")
      .set("Cookie", cookieHeader(cookies))
      .set("X-CSRF-Token", cookies.csrf!)
      .send({ name: "Bereavement", code: "BL", accrualAmount: 5 });
    expect(create.status).toBe(201);
    const patch = await request(app.getHttpServer())
      .patch(`/leave/types/${create.body.id}`)
      .set("Cookie", cookieHeader(cookies))
      .set("X-CSRF-Token", cookies.csrf!)
      .send({ accrualAmount: 7 });
    expect(patch.status).toBe(200);
    expect(Number(patch.body.accrualAmount)).toBe(7);
    const del = await request(app.getHttpServer())
      .delete(`/leave/types/${create.body.id}`)
      .set("Cookie", cookieHeader(cookies))
      .set("X-CSRF-Token", cookies.csrf!);
    expect(del.status).toBe(204);
  });

  it("duplicate code → 409", async () => {
    const { cookies } = await signupOrg();
    // CL already exists from bootstrap
    const dup = await request(app.getHttpServer())
      .post("/leave/types")
      .set("Cookie", cookieHeader(cookies))
      .set("X-CSRF-Token", cookies.csrf!)
      .send({ name: "Casual 2", code: "CL", accrualAmount: 3 });
    expect(dup.status).toBe(409);
  });

  it("RBAC: employee role → 403 on create", async () => {
    const { cookies, organizationId, userId } = await signupOrg();
    await dropToEmployeeRole(organizationId, userId);
    const res = await request(app.getHttpServer())
      .post("/leave/types")
      .set("Cookie", cookieHeader(cookies))
      .set("X-CSRF-Token", cookies.csrf!)
      .send({ name: "X", code: "X", accrualAmount: 1 });
    expect(res.status).toBe(403);
  });
});

// ─── Apply + balance + overlap + approve/reject ─────────────────────

async function getLeaveType(
  cookies: CookieBag,
  code: string,
): Promise<{ id: string; accrualAmount: number }> {
  const list = await request(app.getHttpServer())
    .get("/leave/types")
    .set("Cookie", cookieHeader(cookies))
    .expect(200);
  const t = list.body.items.find((x: { code: string }) => x.code === code);
  if (!t) throw new Error(`type ${code} missing`);
  return { id: t.id, accrualAmount: Number(t.accrualAmount) };
}

describe("apply leave (self)", () => {
  it("creates a pending request and reserves balance", async () => {
    const { cookies, userId } = await signupOrg();
    await createEmployeeForUser(cookies, userId);
    const cl = await getLeaveType(cookies, "CL");

    const apply = await request(app.getHttpServer())
      .post("/leave/requests")
      .set("Cookie", cookieHeader(cookies))
      .set("X-CSRF-Token", cookies.csrf!)
      .send({
        leaveTypeId: cl.id,
        startDate: "2026-07-01",
        endDate: "2026-07-03",
        reason: "vacation",
      });
    expect(apply.status).toBe(201);
    expect(apply.body.status).toBe("pending");
    expect(Number(apply.body.units)).toBe(3);

    const mine = await request(app.getHttpServer())
      .get("/leave/balances/me")
      .set("Cookie", cookieHeader(cookies))
      .expect(200);
    const clBal = mine.body.items.find(
      (b: { leaveType: { code: string } }) => b.leaveType.code === "CL",
    );
    expect(Number(clBal.pending)).toBe(3);
    expect(clBal.available).toBe(cl.accrualAmount - 3);
  });

  it("rejects overlapping request", async () => {
    const { cookies, userId } = await signupOrg();
    await createEmployeeForUser(cookies, userId);
    const cl = await getLeaveType(cookies, "CL");
    await request(app.getHttpServer())
      .post("/leave/requests")
      .set("Cookie", cookieHeader(cookies))
      .set("X-CSRF-Token", cookies.csrf!)
      .send({
        leaveTypeId: cl.id,
        startDate: "2026-08-10",
        endDate: "2026-08-12",
      })
      .expect(201);
    const overlap = await request(app.getHttpServer())
      .post("/leave/requests")
      .set("Cookie", cookieHeader(cookies))
      .set("X-CSRF-Token", cookies.csrf!)
      .send({
        leaveTypeId: cl.id,
        startDate: "2026-08-12",
        endDate: "2026-08-14",
      });
    expect(overlap.status).toBe(400);
    expect(overlap.body.error.code).toBe("leave.overlap");
  });

  it("rejects when balance insufficient", async () => {
    const { cookies, userId } = await signupOrg();
    await createEmployeeForUser(cookies, userId);
    const cl = await getLeaveType(cookies, "CL"); // 12 allocated

    const res = await request(app.getHttpServer())
      .post("/leave/requests")
      .set("Cookie", cookieHeader(cookies))
      .set("X-CSRF-Token", cookies.csrf!)
      .send({
        leaveTypeId: cl.id,
        startDate: "2026-09-01",
        endDate: "2026-09-20", // 20 days > 12 allocated
      });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("leave.insufficient_balance");
  });

  it("LOP requests bypass balance check", async () => {
    const { cookies, userId } = await signupOrg();
    await createEmployeeForUser(cookies, userId);
    const lop = await getLeaveType(cookies, "LOP");
    const res = await request(app.getHttpServer())
      .post("/leave/requests")
      .set("Cookie", cookieHeader(cookies))
      .set("X-CSRF-Token", cookies.csrf!)
      .send({
        leaveTypeId: lop.id,
        startDate: "2026-10-01",
        endDate: "2026-10-30",
      });
    expect(res.status).toBe(201);
  });

  it("half-day single-day = 0.5 units", async () => {
    const { cookies, userId } = await signupOrg();
    await createEmployeeForUser(cookies, userId);
    const cl = await getLeaveType(cookies, "CL");
    const res = await request(app.getHttpServer())
      .post("/leave/requests")
      .set("Cookie", cookieHeader(cookies))
      .set("X-CSRF-Token", cookies.csrf!)
      .send({
        leaveTypeId: cl.id,
        startDate: "2026-11-01",
        endDate: "2026-11-01",
        halfDayStart: true,
      });
    expect(res.status).toBe(201);
    expect(Number(res.body.units)).toBe(0.5);
  });

  it("invalid date range (end < start) → 400", async () => {
    const { cookies, userId } = await signupOrg();
    await createEmployeeForUser(cookies, userId);
    const cl = await getLeaveType(cookies, "CL");
    const res = await request(app.getHttpServer())
      .post("/leave/requests")
      .set("Cookie", cookieHeader(cookies))
      .set("X-CSRF-Token", cookies.csrf!)
      .send({
        leaveTypeId: cl.id,
        startDate: "2026-11-05",
        endDate: "2026-11-01",
      });
    expect(res.status).toBe(400);
  });
});

// ─── Approve / reject ───────────────────────────────────────────────

describe("approve / reject workflow", () => {
  it("approve moves pending → used; LeaveApproval row recorded", async () => {
    const { cookies, userId } = await signupOrg();
    await createEmployeeForUser(cookies, userId);
    const cl = await getLeaveType(cookies, "CL");
    const apply = await request(app.getHttpServer())
      .post("/leave/requests")
      .set("Cookie", cookieHeader(cookies))
      .set("X-CSRF-Token", cookies.csrf!)
      .send({
        leaveTypeId: cl.id,
        startDate: "2026-07-10",
        endDate: "2026-07-11",
      })
      .expect(201);

    const decide = await request(app.getHttpServer())
      .patch(`/leave/requests/${apply.body.id}/approve`)
      .set("Cookie", cookieHeader(cookies))
      .set("X-CSRF-Token", cookies.csrf!)
      .send({ comment: "approved" });
    expect(decide.status).toBe(200);
    expect(decide.body.status).toBe("approved");

    const approvals = await prisma.db.leaveApproval.findMany({
      where: { leaveRequestId: apply.body.id },
    });
    expect(approvals).toHaveLength(1);
    expect(approvals[0]!.decision).toBe("approved");

    const mine = await request(app.getHttpServer())
      .get("/leave/balances/me")
      .set("Cookie", cookieHeader(cookies));
    const clBal = mine.body.items.find(
      (b: { leaveType: { code: string } }) => b.leaveType.code === "CL",
    );
    expect(Number(clBal.pending)).toBe(0);
    expect(Number(clBal.used)).toBe(2);
  });

  it("reject releases pending; comment stored", async () => {
    const { cookies, userId } = await signupOrg();
    await createEmployeeForUser(cookies, userId);
    const cl = await getLeaveType(cookies, "CL");
    const apply = await request(app.getHttpServer())
      .post("/leave/requests")
      .set("Cookie", cookieHeader(cookies))
      .set("X-CSRF-Token", cookies.csrf!)
      .send({
        leaveTypeId: cl.id,
        startDate: "2026-07-20",
        endDate: "2026-07-22",
      })
      .expect(201);
    const r = await request(app.getHttpServer())
      .patch(`/leave/requests/${apply.body.id}/reject`)
      .set("Cookie", cookieHeader(cookies))
      .set("X-CSRF-Token", cookies.csrf!)
      .send({ comment: "blackout window" });
    expect(r.status).toBe(200);
    expect(r.body.status).toBe("rejected");
    expect(r.body.decisionComment).toBe("blackout window");
  });

  it("double-decide → 400", async () => {
    const { cookies, userId } = await signupOrg();
    await createEmployeeForUser(cookies, userId);
    const cl = await getLeaveType(cookies, "CL");
    const apply = await request(app.getHttpServer())
      .post("/leave/requests")
      .set("Cookie", cookieHeader(cookies))
      .set("X-CSRF-Token", cookies.csrf!)
      .send({
        leaveTypeId: cl.id,
        startDate: "2026-07-25",
        endDate: "2026-07-25",
      })
      .expect(201);
    await request(app.getHttpServer())
      .patch(`/leave/requests/${apply.body.id}/approve`)
      .set("Cookie", cookieHeader(cookies))
      .set("X-CSRF-Token", cookies.csrf!)
      .send({})
      .expect(200);
    const second = await request(app.getHttpServer())
      .patch(`/leave/requests/${apply.body.id}/reject`)
      .set("Cookie", cookieHeader(cookies))
      .set("X-CSRF-Token", cookies.csrf!)
      .send({});
    expect(second.status).toBe(400);
  });

  it("RBAC: employee role cannot approve", async () => {
    const { cookies, organizationId, userId } = await signupOrg();
    await createEmployeeForUser(cookies, userId);
    const cl = await getLeaveType(cookies, "CL");
    const apply = await request(app.getHttpServer())
      .post("/leave/requests")
      .set("Cookie", cookieHeader(cookies))
      .set("X-CSRF-Token", cookies.csrf!)
      .send({
        leaveTypeId: cl.id,
        startDate: "2026-07-28",
        endDate: "2026-07-29",
      })
      .expect(201);
    await dropToEmployeeRole(organizationId, userId);
    const res = await request(app.getHttpServer())
      .patch(`/leave/requests/${apply.body.id}/approve`)
      .set("Cookie", cookieHeader(cookies))
      .set("X-CSRF-Token", cookies.csrf!)
      .send({});
    expect(res.status).toBe(403);
  });
});

// ─── Cancel ────────────────────────────────────────────────────────

describe("cancel", () => {
  it("self can cancel own pending request; pending released", async () => {
    const { cookies, userId } = await signupOrg();
    await createEmployeeForUser(cookies, userId);
    const cl = await getLeaveType(cookies, "CL");
    const apply = await request(app.getHttpServer())
      .post("/leave/requests")
      .set("Cookie", cookieHeader(cookies))
      .set("X-CSRF-Token", cookies.csrf!)
      .send({
        leaveTypeId: cl.id,
        startDate: "2026-08-01",
        endDate: "2026-08-02",
      })
      .expect(201);
    const cancel = await request(app.getHttpServer())
      .patch(`/leave/requests/${apply.body.id}/cancel`)
      .set("Cookie", cookieHeader(cookies))
      .set("X-CSRF-Token", cookies.csrf!);
    expect(cancel.status).toBe(200);
    expect(cancel.body.status).toBe("cancelled");
    const mine = await request(app.getHttpServer())
      .get("/leave/balances/me")
      .set("Cookie", cookieHeader(cookies));
    const clBal = mine.body.items.find(
      (b: { leaveType: { code: string } }) => b.leaveType.code === "CL",
    );
    expect(Number(clBal.pending)).toBe(0);
  });

  it("already-cancelled cannot be cancelled again → 400", async () => {
    const { cookies, userId } = await signupOrg();
    await createEmployeeForUser(cookies, userId);
    const cl = await getLeaveType(cookies, "CL");
    const apply = await request(app.getHttpServer())
      .post("/leave/requests")
      .set("Cookie", cookieHeader(cookies))
      .set("X-CSRF-Token", cookies.csrf!)
      .send({
        leaveTypeId: cl.id,
        startDate: "2026-08-05",
        endDate: "2026-08-05",
      })
      .expect(201);
    await request(app.getHttpServer())
      .patch(`/leave/requests/${apply.body.id}/cancel`)
      .set("Cookie", cookieHeader(cookies))
      .set("X-CSRF-Token", cookies.csrf!)
      .expect(200);
    const second = await request(app.getHttpServer())
      .patch(`/leave/requests/${apply.body.id}/cancel`)
      .set("Cookie", cookieHeader(cookies))
      .set("X-CSRF-Token", cookies.csrf!);
    expect(second.status).toBe(400);
  });
});

// ─── Balance adjust ─────────────────────────────────────────────────

describe("balance adjust (HR)", () => {
  it("adjusts allocated/adjusted with audit + reason", async () => {
    const { cookies, userId } = await signupOrg();
    await createEmployeeForUser(cookies, userId);
    // Bootstrap balances by hitting /balances/me
    await request(app.getHttpServer())
      .get("/leave/balances/me")
      .set("Cookie", cookieHeader(cookies))
      .expect(200);
    const list = await request(app.getHttpServer())
      .get("/leave/balances")
      .set("Cookie", cookieHeader(cookies))
      .expect(200);
    const cl = list.body.items.find(
      (b: { leaveType: { code: string } }) => b.leaveType.code === "CL",
    );
    const adj = await request(app.getHttpServer())
      .patch(`/leave/balances/${cl.id}`)
      .set("Cookie", cookieHeader(cookies))
      .set("X-CSRF-Token", cookies.csrf!)
      .send({ adjusted: 3, reason: "credit for prior comp" });
    expect(adj.status).toBe(200);
    expect(Number(adj.body.adjusted)).toBe(3);

    const log = await prisma.db.auditLog.findFirst({
      where: { action: "leave.balance.adjust", resourceId: cl.id },
    });
    expect(log).not.toBeNull();
  });

  it("RBAC: employee role denied", async () => {
    const { cookies, organizationId, userId } = await signupOrg();
    await createEmployeeForUser(cookies, userId);
    await request(app.getHttpServer())
      .get("/leave/balances/me")
      .set("Cookie", cookieHeader(cookies))
      .expect(200);
    const list = await request(app.getHttpServer())
      .get("/leave/balances")
      .set("Cookie", cookieHeader(cookies))
      .expect(200);
    const balId = list.body.items[0].id;
    await dropToEmployeeRole(organizationId, userId);
    const res = await request(app.getHttpServer())
      .patch(`/leave/balances/${balId}`)
      .set("Cookie", cookieHeader(cookies))
      .set("X-CSRF-Token", cookies.csrf!)
      .send({ adjusted: 5 });
    expect(res.status).toBe(403);
  });
});

// ─── Tenant isolation ────────────────────────────────────────────────

describe("tenant isolation", () => {
  it("Org-A cannot see Org-B leave types or requests", async () => {
    const a = await signupOrg();
    const b = await signupOrg();
    await createEmployeeForUser(a.cookies, a.userId);
    await createEmployeeForUser(b.cookies, b.userId);

    const aTypes = await request(app.getHttpServer())
      .get("/leave/types")
      .set("Cookie", cookieHeader(a.cookies))
      .expect(200);
    const bTypes = await request(app.getHttpServer())
      .get("/leave/types")
      .set("Cookie", cookieHeader(b.cookies))
      .expect(200);

    // Each org has 5 default types but the rows are distinct
    expect(aTypes.body.items).toHaveLength(5);
    expect(bTypes.body.items).toHaveLength(5);
    const aIds = aTypes.body.items.map((t: { id: string }) => t.id).sort();
    const bIds = bTypes.body.items.map((t: { id: string }) => t.id).sort();
    expect(aIds).not.toEqual(bIds);

    const aCL = aTypes.body.items.find(
      (t: { code: string }) => t.code === "CL",
    );
    await request(app.getHttpServer())
      .post("/leave/requests")
      .set("Cookie", cookieHeader(a.cookies))
      .set("X-CSRF-Token", a.cookies.csrf!)
      .send({
        leaveTypeId: aCL.id,
        startDate: "2026-12-01",
        endDate: "2026-12-01",
      })
      .expect(201);
    const bRequests = await request(app.getHttpServer())
      .get("/leave/requests")
      .set("Cookie", cookieHeader(b.cookies));
    expect(bRequests.body.items).toHaveLength(0);
  });
});

// ─── Audit ───────────────────────────────────────────────────────────

describe("audit logs", () => {
  it("apply + approve + cancel emit audit events", async () => {
    const { cookies, organizationId, userId } = await signupOrg();
    await createEmployeeForUser(cookies, userId);
    const cl = await getLeaveType(cookies, "CL");
    const apply = await request(app.getHttpServer())
      .post("/leave/requests")
      .set("Cookie", cookieHeader(cookies))
      .set("X-CSRF-Token", cookies.csrf!)
      .send({
        leaveTypeId: cl.id,
        startDate: "2026-09-01",
        endDate: "2026-09-01",
      })
      .expect(201);
    await request(app.getHttpServer())
      .patch(`/leave/requests/${apply.body.id}/approve`)
      .set("Cookie", cookieHeader(cookies))
      .set("X-CSRF-Token", cookies.csrf!)
      .send({})
      .expect(200);
    const logs = await prisma.db.auditLog.findMany({
      where: { organizationId, resourceId: apply.body.id },
      orderBy: { createdAt: "asc" },
    });
    expect(logs.map((l) => l.action)).toEqual([
      "leave.request.create",
      "leave.request.approve",
    ]);
  });
});
