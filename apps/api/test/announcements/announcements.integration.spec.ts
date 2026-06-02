/**
 * Integration tests for Batch 7 — Announcements.
 * Covers: CRUD, audience resolution (all 6 types), publish, schedule + cron
 * promotion, archive, acknowledgement idempotency + membership check,
 * employee feed, audience preview, RBAC, tenant isolation.
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
import { AnnouncementsModule } from "../../src/announcements/announcements.module";
import { JwtAuthGuard } from "../../src/auth/guards/jwt-auth.guard";
import { CsrfGuard } from "../../src/auth/guards/csrf.guard";
import { PermissionGuard } from "../../src/rbac/permission.guard";
import { TenantInterceptor } from "../../src/tenant/tenant.interceptor";
import { GlobalExceptionFilter } from "../../src/common/http-exception.filter";
import { resetEnvCacheForTests } from "../../src/infra/config/env";
import { PrismaService } from "../../src/infra/prisma/prisma.service";
import { AnnouncementsService } from "../../src/announcements/announcements.service";
import { ACCESS_COOKIE, CSRF_COOKIE } from "../../src/auth/cookies";

@Module({
  imports: [
    PrismaModule,
    AuditModule,
    AuthModule,
    RbacModule,
    OrgStructureModule,
    EmployeesModule,
    AnnouncementsModule,
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
let svc: AnnouncementsService;
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

async function createDesignation(
  cookies: CookieBag,
  name: string,
): Promise<string> {
  const res = await request(app.getHttpServer())
    .post("/designations")
    .set("Cookie", cookieHeader(cookies))
    .set("X-CSRF-Token", cookies.csrf!)
    .send({ name })
    .expect(201);
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
  svc = moduleRef.get(AnnouncementsService);
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

const ALL_AUDIENCE = [{ type: "all_employees" as const }];

// ─── CRUD + draft state ──────────────────────────────────────────────

describe("announcements CRUD", () => {
  it("creates a draft with audiences and reads it back", async () => {
    const { cookies, organizationId } = await signupOrg();
    const dept = await createDepartment(cookies, "Engineering");

    const create = await request(app.getHttpServer())
      .post("/announcements")
      .set("Cookie", cookieHeader(cookies))
      .set("X-CSRF-Token", cookies.csrf!)
      .send({
        title: "Welcome",
        bodyHtml: "<p>Welcome aboard!</p>",
        priority: "high",
        requiresAcknowledgment: true,
        audiences: [{ type: "department", departmentId: dept }],
      })
      .expect(201);

    expect(create.body.status).toBe("draft");
    expect(create.body.publishedAt).toBeNull();
    expect(create.body.audiences).toHaveLength(1);
    expect(create.body.audiences[0].audienceType).toBe("department");
    expect(create.body.organizationId).toBe(organizationId);

    const got = await request(app.getHttpServer())
      .get(`/announcements/${create.body.id}`)
      .set("Cookie", cookieHeader(cookies))
      .expect(200);
    expect(got.body.title).toBe("Welcome");
  });

  it("validates audience selectors per type", async () => {
    const { cookies } = await signupOrg();
    const bad = await request(app.getHttpServer())
      .post("/announcements")
      .set("Cookie", cookieHeader(cookies))
      .set("X-CSRF-Token", cookies.csrf!)
      .send({
        title: "X",
        bodyHtml: "<p>X</p>",
        // type=department but no departmentId
        audiences: [{ type: "department" }],
      });
    expect(bad.status).toBe(400);
  });

  it("update replaces audiences atomically", async () => {
    const { cookies } = await signupOrg();
    const deptA = await createDepartment(cookies, "Eng");
    const deptB = await createDepartment(cookies, "Sales");
    const create = await request(app.getHttpServer())
      .post("/announcements")
      .set("Cookie", cookieHeader(cookies))
      .set("X-CSRF-Token", cookies.csrf!)
      .send({
        title: "A",
        bodyHtml: "<p>A</p>",
        audiences: [{ type: "department", departmentId: deptA }],
      })
      .expect(201);

    const patch = await request(app.getHttpServer())
      .patch(`/announcements/${create.body.id}`)
      .set("Cookie", cookieHeader(cookies))
      .set("X-CSRF-Token", cookies.csrf!)
      .send({
        audiences: [
          { type: "department", departmentId: deptA },
          { type: "department", departmentId: deptB },
        ],
      })
      .expect(200);
    expect(patch.body.audiences).toHaveLength(2);
  });

  it("invalid scheduling window → 400", async () => {
    const { cookies } = await signupOrg();
    const res = await request(app.getHttpServer())
      .post("/announcements")
      .set("Cookie", cookieHeader(cookies))
      .set("X-CSRF-Token", cookies.csrf!)
      .send({
        title: "X",
        bodyHtml: "<p>X</p>",
        scheduledFor: "2026-12-31T10:00:00.000Z",
        expiresAt: "2026-01-01T10:00:00.000Z",
        audiences: ALL_AUDIENCE,
      });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("announcement.invalid_schedule");
  });
});

// ─── Audience resolution (all 6 types) ───────────────────────────────

describe("audience resolution", () => {
  it("all_employees → every active employee in the org", async () => {
    const { cookies, organizationId } = await signupOrg();
    const e1 = await createOrphanEmployee(cookies);
    const e2 = await createOrphanEmployee(cookies);
    const preview = await request(app.getHttpServer())
      .post("/announcements/audience/preview")
      .set("Cookie", cookieHeader(cookies))
      .set("X-CSRF-Token", cookies.csrf!)
      .send({ audiences: ALL_AUDIENCE })
      .expect(200);
    expect(preview.body.count).toBe(2);
    const ids = preview.body.sample.map((s: { id: string }) => s.id).sort();
    expect(ids).toEqual([e1, e2].sort());
    expect(organizationId).toBeTruthy(); // sanity
  });

  it("department / designation / location filters", async () => {
    const { cookies } = await signupOrg();
    const eng = await createDepartment(cookies, "Eng");
    const sales = await createDepartment(cookies, "Sales");
    const ic = await createDesignation(cookies, "IC");
    const hq = await createLocation(cookies, "HQ");

    await createOrphanEmployee(cookies, {
      departmentId: eng,
      designationId: ic,
      locationId: hq,
    });
    await createOrphanEmployee(cookies, { departmentId: sales });
    await createOrphanEmployee(cookies, {
      departmentId: eng,
      locationId: hq,
    });

    const byDept = await request(app.getHttpServer())
      .post("/announcements/audience/preview")
      .set("Cookie", cookieHeader(cookies))
      .set("X-CSRF-Token", cookies.csrf!)
      .send({ audiences: [{ type: "department", departmentId: eng }] })
      .expect(200);
    expect(byDept.body.count).toBe(2);

    const byDes = await request(app.getHttpServer())
      .post("/announcements/audience/preview")
      .set("Cookie", cookieHeader(cookies))
      .set("X-CSRF-Token", cookies.csrf!)
      .send({ audiences: [{ type: "designation", designationId: ic }] })
      .expect(200);
    expect(byDes.body.count).toBe(1);

    const byLoc = await request(app.getHttpServer())
      .post("/announcements/audience/preview")
      .set("Cookie", cookieHeader(cookies))
      .set("X-CSRF-Token", cookies.csrf!)
      .send({ audiences: [{ type: "location", locationId: hq }] })
      .expect(200);
    expect(byLoc.body.count).toBe(2);
  });

  it("employment_type + specific_employees + dedup via union", async () => {
    const { cookies } = await signupOrg();
    const eng = await createDepartment(cookies, "Eng");
    const e1 = await createOrphanEmployee(cookies, {
      employmentType: "intern",
    });
    const e2 = await createOrphanEmployee(cookies, {
      employmentType: "full_time",
      departmentId: eng,
    });
    const e3 = await createOrphanEmployee(cookies, {
      employmentType: "full_time",
    });

    // Union of department=Eng and specific=e1: e1 + e2.
    const union = await request(app.getHttpServer())
      .post("/announcements/audience/preview")
      .set("Cookie", cookieHeader(cookies))
      .set("X-CSRF-Token", cookies.csrf!)
      .send({
        audiences: [
          { type: "department", departmentId: eng },
          { type: "specific_employees", employeeId: e1 },
        ],
      })
      .expect(200);
    expect(union.body.count).toBe(2);

    // employment_type=intern → only e1
    const byET = await request(app.getHttpServer())
      .post("/announcements/audience/preview")
      .set("Cookie", cookieHeader(cookies))
      .set("X-CSRF-Token", cookies.csrf!)
      .send({
        audiences: [{ type: "employment_type", employmentType: "intern" }],
      })
      .expect(200);
    expect(byET.body.count).toBe(1);

    // Dedup: department=Eng twice should not double-count e2.
    const dedup = await request(app.getHttpServer())
      .post("/announcements/audience/preview")
      .set("Cookie", cookieHeader(cookies))
      .set("X-CSRF-Token", cookies.csrf!)
      .send({
        audiences: [
          { type: "department", departmentId: eng },
          { type: "specific_employees", employeeId: e2 },
        ],
      })
      .expect(200);
    expect(dedup.body.count).toBe(1);
    expect(e3).toBeTruthy();
  });

  it("offboarded and soft-deleted employees are excluded", async () => {
    const { cookies } = await signupOrg();
    const e1 = await createOrphanEmployee(cookies);
    const e2 = await createOrphanEmployee(cookies);
    await prisma.db.employee.update({
      where: { id: e1 },
      data: { status: "offboarded" },
    });
    await prisma.db.employee.update({
      where: { id: e2 },
      data: { deletedAt: new Date() },
    });
    const preview = await request(app.getHttpServer())
      .post("/announcements/audience/preview")
      .set("Cookie", cookieHeader(cookies))
      .set("X-CSRF-Token", cookies.csrf!)
      .send({ audiences: ALL_AUDIENCE })
      .expect(200);
    expect(preview.body.count).toBe(0);
  });
});

// ─── Publish + notification fan-out ──────────────────────────────────

describe("publish + notification fan-out", () => {
  it("publish flips status, sets publishedAt, fans out notifications", async () => {
    const { cookies, organizationId, userId } = await signupOrg();
    // Founder-as-employee — has a userId, so should get a notification.
    await createEmployeeForUser(cookies, userId);
    // Another employee with their own user.
    const otherUser = await prisma.db.user.create({
      data: {
        organizationId,
        email: `other-${unique}@test.local`,
        status: "active",
      },
    });
    const otherEmp = await createOrphanEmployee(cookies);
    await prisma.db.employee.update({
      where: { id: otherEmp },
      data: { userId: otherUser.id },
    });
    // A third employee without a user — won't receive a notification but
    // still counts in the audience.
    await createOrphanEmployee(cookies);

    const create = await request(app.getHttpServer())
      .post("/announcements")
      .set("Cookie", cookieHeader(cookies))
      .set("X-CSRF-Token", cookies.csrf!)
      .send({
        title: "Q3 plan",
        bodyHtml: "<p>...</p>",
        audiences: ALL_AUDIENCE,
        priority: "high",
      })
      .expect(201);

    const pub = await request(app.getHttpServer())
      .post(`/announcements/${create.body.id}/publish`)
      .set("Cookie", cookieHeader(cookies))
      .set("X-CSRF-Token", cookies.csrf!)
      .send({})
      .expect(201);
    expect(pub.body.status).toBe("published");
    expect(pub.body.publishedAt).toBeTruthy();

    const notifs = await prisma.db.notification.findMany({
      where: { templateId: "announcement.published" },
    });
    expect(notifs).toHaveLength(2); // only users-with-account get notified
    expect(notifs.every((n) => n.priority === "high")).toBe(true);
    expect(
      notifs.every((n) => n.linkTo === `/announcements/${create.body.id}`),
    ).toBe(true);
  });

  it("re-publishing an already-published announcement is a no-op", async () => {
    const { cookies, userId } = await signupOrg();
    await createEmployeeForUser(cookies, userId);
    const create = await request(app.getHttpServer())
      .post("/announcements")
      .set("Cookie", cookieHeader(cookies))
      .set("X-CSRF-Token", cookies.csrf!)
      .send({
        title: "X",
        bodyHtml: "<p>X</p>",
        audiences: ALL_AUDIENCE,
      })
      .expect(201);
    await request(app.getHttpServer())
      .post(`/announcements/${create.body.id}/publish`)
      .set("Cookie", cookieHeader(cookies))
      .set("X-CSRF-Token", cookies.csrf!)
      .send({})
      .expect(201);
    const before = await prisma.db.notification.count();
    await request(app.getHttpServer())
      .post(`/announcements/${create.body.id}/publish`)
      .set("Cookie", cookieHeader(cookies))
      .set("X-CSRF-Token", cookies.csrf!)
      .send({})
      .expect(201);
    const after = await prisma.db.notification.count();
    expect(after).toBe(before);
  });

  it("archived announcement cannot be re-published", async () => {
    const { cookies } = await signupOrg();
    const create = await request(app.getHttpServer())
      .post("/announcements")
      .set("Cookie", cookieHeader(cookies))
      .set("X-CSRF-Token", cookies.csrf!)
      .send({
        title: "Z",
        bodyHtml: "<p>Z</p>",
        audiences: ALL_AUDIENCE,
      })
      .expect(201);
    await request(app.getHttpServer())
      .post(`/announcements/${create.body.id}/archive`)
      .set("Cookie", cookieHeader(cookies))
      .set("X-CSRF-Token", cookies.csrf!)
      .expect(201);
    const res = await request(app.getHttpServer())
      .post(`/announcements/${create.body.id}/publish`)
      .set("Cookie", cookieHeader(cookies))
      .set("X-CSRF-Token", cookies.csrf!)
      .send({});
    expect(res.status).toBe(409);
  });
});

// ─── Schedule + cron promotion ───────────────────────────────────────

describe("scheduled publish", () => {
  it("publish with scheduledFor moves to scheduled state without notifying", async () => {
    const { cookies, userId } = await signupOrg();
    await createEmployeeForUser(cookies, userId);
    const create = await request(app.getHttpServer())
      .post("/announcements")
      .set("Cookie", cookieHeader(cookies))
      .set("X-CSRF-Token", cookies.csrf!)
      .send({
        title: "Later",
        bodyHtml: "<p>...</p>",
        audiences: ALL_AUDIENCE,
      })
      .expect(201);
    const future = new Date(Date.now() + 60_000).toISOString();
    const pub = await request(app.getHttpServer())
      .post(`/announcements/${create.body.id}/publish`)
      .set("Cookie", cookieHeader(cookies))
      .set("X-CSRF-Token", cookies.csrf!)
      .send({ scheduledFor: future })
      .expect(201);
    expect(pub.body.status).toBe("scheduled");
    expect(pub.body.publishedAt).toBeNull();
    const notifs = await prisma.db.notification.count();
    expect(notifs).toBe(0);
  });

  it("cron tick promotes past-due scheduled announcements + notifies", async () => {
    const { cookies, userId } = await signupOrg();
    await createEmployeeForUser(cookies, userId);
    const create = await request(app.getHttpServer())
      .post("/announcements")
      .set("Cookie", cookieHeader(cookies))
      .set("X-CSRF-Token", cookies.csrf!)
      .send({
        title: "Drops",
        bodyHtml: "<p>...</p>",
        audiences: ALL_AUDIENCE,
      })
      .expect(201);
    const past = new Date(Date.now() - 10_000).toISOString();
    await request(app.getHttpServer())
      .post(`/announcements/${create.body.id}/publish`)
      .set("Cookie", cookieHeader(cookies))
      .set("X-CSRF-Token", cookies.csrf!)
      .send({ scheduledFor: past })
      .expect(201);

    const promoted = await svc.runScheduledPublishTick();
    expect(promoted).toContain(create.body.id);

    const after = await prisma.db.announcement.findFirstOrThrow({
      where: { id: create.body.id },
    });
    expect(after.status).toBe("published");
    expect(after.publishedAt).not.toBeNull();
    const notifs = await prisma.db.notification.count({
      where: { templateId: "announcement.published" },
    });
    expect(notifs).toBe(1);
  });

  it("cron tick leaves future scheduled rows alone", async () => {
    const { cookies, userId } = await signupOrg();
    await createEmployeeForUser(cookies, userId);
    const create = await request(app.getHttpServer())
      .post("/announcements")
      .set("Cookie", cookieHeader(cookies))
      .set("X-CSRF-Token", cookies.csrf!)
      .send({
        title: "Future",
        bodyHtml: "<p>...</p>",
        audiences: ALL_AUDIENCE,
      })
      .expect(201);
    const future = new Date(Date.now() + 60_000).toISOString();
    await request(app.getHttpServer())
      .post(`/announcements/${create.body.id}/publish`)
      .set("Cookie", cookieHeader(cookies))
      .set("X-CSRF-Token", cookies.csrf!)
      .send({ scheduledFor: future })
      .expect(201);
    const promoted = await svc.runScheduledPublishTick();
    expect(promoted).not.toContain(create.body.id);
  });
});

// ─── Acknowledgement ─────────────────────────────────────────────────

describe("acknowledgement", () => {
  it("idempotent: second ack returns existing row, no new audit", async () => {
    const { cookies, userId } = await signupOrg();
    await createEmployeeForUser(cookies, userId);
    const create = await request(app.getHttpServer())
      .post("/announcements")
      .set("Cookie", cookieHeader(cookies))
      .set("X-CSRF-Token", cookies.csrf!)
      .send({
        title: "Read it",
        bodyHtml: "<p>...</p>",
        requiresAcknowledgment: true,
        audiences: ALL_AUDIENCE,
      })
      .expect(201);
    await request(app.getHttpServer())
      .post(`/announcements/${create.body.id}/publish`)
      .set("Cookie", cookieHeader(cookies))
      .set("X-CSRF-Token", cookies.csrf!)
      .send({})
      .expect(201);

    const a = await request(app.getHttpServer())
      .post(`/announcements/${create.body.id}/acknowledge`)
      .set("Cookie", cookieHeader(cookies))
      .set("X-CSRF-Token", cookies.csrf!)
      .expect(201);
    const b = await request(app.getHttpServer())
      .post(`/announcements/${create.body.id}/acknowledge`)
      .set("Cookie", cookieHeader(cookies))
      .set("X-CSRF-Token", cookies.csrf!)
      .expect(201);
    expect(a.body.id).toBe(b.body.id);

    const count = await prisma.db.announcementAcknowledgement.count({
      where: { announcementId: create.body.id },
    });
    expect(count).toBe(1);
  });

  it("acknowledge fails if not in audience (403)", async () => {
    const { cookies, organizationId, userId } = await signupOrg();
    // Founder is in dept-A; announcement targets dept-B only.
    const deptA = await createDepartment(cookies, "A");
    const deptB = await createDepartment(cookies, "B");
    await createEmployeeForUser(cookies, userId, { departmentId: deptA });
    const create = await request(app.getHttpServer())
      .post("/announcements")
      .set("Cookie", cookieHeader(cookies))
      .set("X-CSRF-Token", cookies.csrf!)
      .send({
        title: "Eng only",
        bodyHtml: "<p>...</p>",
        requiresAcknowledgment: true,
        audiences: [{ type: "department", departmentId: deptB }],
      })
      .expect(201);
    await request(app.getHttpServer())
      .post(`/announcements/${create.body.id}/publish`)
      .set("Cookie", cookieHeader(cookies))
      .set("X-CSRF-Token", cookies.csrf!)
      .send({})
      .expect(201);
    const ack = await request(app.getHttpServer())
      .post(`/announcements/${create.body.id}/acknowledge`)
      .set("Cookie", cookieHeader(cookies))
      .set("X-CSRF-Token", cookies.csrf!);
    expect(ack.status).toBe(403);
    expect(ack.body.error.code).toBe("announcement.not_in_audience");
    expect(organizationId).toBeTruthy();
  });

  it("acknowledge before publish → 409", async () => {
    const { cookies, userId } = await signupOrg();
    await createEmployeeForUser(cookies, userId);
    const create = await request(app.getHttpServer())
      .post("/announcements")
      .set("Cookie", cookieHeader(cookies))
      .set("X-CSRF-Token", cookies.csrf!)
      .send({
        title: "Draft",
        bodyHtml: "<p>...</p>",
        requiresAcknowledgment: true,
        audiences: ALL_AUDIENCE,
      })
      .expect(201);
    const res = await request(app.getHttpServer())
      .post(`/announcements/${create.body.id}/acknowledge`)
      .set("Cookie", cookieHeader(cookies))
      .set("X-CSRF-Token", cookies.csrf!);
    expect(res.status).toBe(409);
  });

  it("ack list returns paginated employees with display info", async () => {
    const { cookies, userId } = await signupOrg();
    await createEmployeeForUser(cookies, userId);
    const create = await request(app.getHttpServer())
      .post("/announcements")
      .set("Cookie", cookieHeader(cookies))
      .set("X-CSRF-Token", cookies.csrf!)
      .send({
        title: "Read",
        bodyHtml: "<p>...</p>",
        requiresAcknowledgment: true,
        audiences: ALL_AUDIENCE,
      })
      .expect(201);
    await request(app.getHttpServer())
      .post(`/announcements/${create.body.id}/publish`)
      .set("Cookie", cookieHeader(cookies))
      .set("X-CSRF-Token", cookies.csrf!)
      .send({})
      .expect(201);
    await request(app.getHttpServer())
      .post(`/announcements/${create.body.id}/acknowledge`)
      .set("Cookie", cookieHeader(cookies))
      .set("X-CSRF-Token", cookies.csrf!)
      .expect(201);

    const list = await request(app.getHttpServer())
      .get(`/announcements/${create.body.id}/acknowledgements`)
      .set("Cookie", cookieHeader(cookies))
      .expect(200);
    expect(list.body.meta.total).toBe(1);
    expect(list.body.items[0].employee.displayName).toBeTruthy();
  });
});

// ─── Employee feed (/me/announcements) ───────────────────────────────

describe("employee feed", () => {
  it("returns published, non-expired announcements where employee is in audience", async () => {
    const { cookies, userId } = await signupOrg();
    const dept = await createDepartment(cookies, "Eng");
    await createEmployeeForUser(cookies, userId, { departmentId: dept });

    // Targeted to my dept → should appear.
    const a = await request(app.getHttpServer())
      .post("/announcements")
      .set("Cookie", cookieHeader(cookies))
      .set("X-CSRF-Token", cookies.csrf!)
      .send({
        title: "Mine",
        bodyHtml: "<p>...</p>",
        audiences: [{ type: "department", departmentId: dept }],
      })
      .expect(201);
    await request(app.getHttpServer())
      .post(`/announcements/${a.body.id}/publish`)
      .set("Cookie", cookieHeader(cookies))
      .set("X-CSRF-Token", cookies.csrf!)
      .send({})
      .expect(201);

    // Targeted to another dept → should NOT appear.
    const other = await createDepartment(cookies, "Sales");
    const b = await request(app.getHttpServer())
      .post("/announcements")
      .set("Cookie", cookieHeader(cookies))
      .set("X-CSRF-Token", cookies.csrf!)
      .send({
        title: "Not mine",
        bodyHtml: "<p>...</p>",
        audiences: [{ type: "department", departmentId: other }],
      })
      .expect(201);
    await request(app.getHttpServer())
      .post(`/announcements/${b.body.id}/publish`)
      .set("Cookie", cookieHeader(cookies))
      .set("X-CSRF-Token", cookies.csrf!)
      .send({})
      .expect(201);

    // Draft → never appears.
    await request(app.getHttpServer())
      .post("/announcements")
      .set("Cookie", cookieHeader(cookies))
      .set("X-CSRF-Token", cookies.csrf!)
      .send({
        title: "Draft",
        bodyHtml: "<p>...</p>",
        audiences: ALL_AUDIENCE,
      })
      .expect(201);

    const feed = await request(app.getHttpServer())
      .get("/me/announcements")
      .set("Cookie", cookieHeader(cookies))
      .expect(200);
    expect(feed.body.meta.total).toBe(1);
    expect(feed.body.items[0].id).toBe(a.body.id);
  });

  it("unacknowledgedOnly filter only returns requires-ack rows the user has not acked", async () => {
    const { cookies, userId } = await signupOrg();
    await createEmployeeForUser(cookies, userId);
    const needsAck = await request(app.getHttpServer())
      .post("/announcements")
      .set("Cookie", cookieHeader(cookies))
      .set("X-CSRF-Token", cookies.csrf!)
      .send({
        title: "Need",
        bodyHtml: "<p>...</p>",
        requiresAcknowledgment: true,
        audiences: ALL_AUDIENCE,
      })
      .expect(201);
    const noAck = await request(app.getHttpServer())
      .post("/announcements")
      .set("Cookie", cookieHeader(cookies))
      .set("X-CSRF-Token", cookies.csrf!)
      .send({
        title: "No",
        bodyHtml: "<p>...</p>",
        audiences: ALL_AUDIENCE,
      })
      .expect(201);
    for (const id of [needsAck.body.id, noAck.body.id]) {
      await request(app.getHttpServer())
        .post(`/announcements/${id}/publish`)
        .set("Cookie", cookieHeader(cookies))
        .set("X-CSRF-Token", cookies.csrf!)
        .send({})
        .expect(201);
    }
    const before = await request(app.getHttpServer())
      .get("/me/announcements?unacknowledgedOnly=true")
      .set("Cookie", cookieHeader(cookies))
      .expect(200);
    expect(before.body.meta.total).toBe(1);
    expect(before.body.items[0].id).toBe(needsAck.body.id);

    await request(app.getHttpServer())
      .post(`/announcements/${needsAck.body.id}/acknowledge`)
      .set("Cookie", cookieHeader(cookies))
      .set("X-CSRF-Token", cookies.csrf!)
      .expect(201);

    const after = await request(app.getHttpServer())
      .get("/me/announcements?unacknowledgedOnly=true")
      .set("Cookie", cookieHeader(cookies))
      .expect(200);
    expect(after.body.meta.total).toBe(0);
  });

  it("expired announcements are excluded from the feed", async () => {
    const { cookies, userId } = await signupOrg();
    await createEmployeeForUser(cookies, userId);
    const create = await request(app.getHttpServer())
      .post("/announcements")
      .set("Cookie", cookieHeader(cookies))
      .set("X-CSRF-Token", cookies.csrf!)
      .send({
        title: "Old",
        bodyHtml: "<p>...</p>",
        audiences: ALL_AUDIENCE,
      })
      .expect(201);
    await request(app.getHttpServer())
      .post(`/announcements/${create.body.id}/publish`)
      .set("Cookie", cookieHeader(cookies))
      .set("X-CSRF-Token", cookies.csrf!)
      .send({})
      .expect(201);
    // Bypass the API to backdate expiry.
    await prisma.db.announcement.update({
      where: { id: create.body.id },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    const feed = await request(app.getHttpServer())
      .get("/me/announcements")
      .set("Cookie", cookieHeader(cookies))
      .expect(200);
    expect(feed.body.meta.total).toBe(0);
  });
});

// ─── RBAC ────────────────────────────────────────────────────────────

describe("RBAC enforcement", () => {
  it("employee role cannot create or publish", async () => {
    const { cookies, organizationId, userId } = await signupOrg();
    await createEmployeeForUser(cookies, userId);
    await dropToEmployeeRole(organizationId, userId);
    const create = await request(app.getHttpServer())
      .post("/announcements")
      .set("Cookie", cookieHeader(cookies))
      .set("X-CSRF-Token", cookies.csrf!)
      .send({
        title: "X",
        bodyHtml: "<p>X</p>",
        audiences: ALL_AUDIENCE,
      });
    expect(create.status).toBe(403);
  });

  it("employee role CAN read its own feed and acknowledge", async () => {
    const { cookies, organizationId, userId } = await signupOrg();
    await createEmployeeForUser(cookies, userId);
    const create = await request(app.getHttpServer())
      .post("/announcements")
      .set("Cookie", cookieHeader(cookies))
      .set("X-CSRF-Token", cookies.csrf!)
      .send({
        title: "Visible",
        bodyHtml: "<p>...</p>",
        requiresAcknowledgment: true,
        audiences: ALL_AUDIENCE,
      })
      .expect(201);
    await request(app.getHttpServer())
      .post(`/announcements/${create.body.id}/publish`)
      .set("Cookie", cookieHeader(cookies))
      .set("X-CSRF-Token", cookies.csrf!)
      .send({})
      .expect(201);

    await dropToEmployeeRole(organizationId, userId);

    const feed = await request(app.getHttpServer())
      .get("/me/announcements")
      .set("Cookie", cookieHeader(cookies))
      .expect(200);
    expect(feed.body.meta.total).toBe(1);

    const ack = await request(app.getHttpServer())
      .post(`/announcements/${create.body.id}/acknowledge`)
      .set("Cookie", cookieHeader(cookies))
      .set("X-CSRF-Token", cookies.csrf!);
    expect(ack.status).toBe(201);
  });
});

// ─── Tenant isolation ────────────────────────────────────────────────

describe("tenant isolation", () => {
  it("Org-A cannot read or mutate Org-B announcements", async () => {
    const a = await signupOrg();
    const b = await signupOrg();
    const bAnn = await request(app.getHttpServer())
      .post("/announcements")
      .set("Cookie", cookieHeader(b.cookies))
      .set("X-CSRF-Token", b.cookies.csrf!)
      .send({
        title: "B-only",
        bodyHtml: "<p>...</p>",
        audiences: ALL_AUDIENCE,
      })
      .expect(201);
    const get = await request(app.getHttpServer())
      .get(`/announcements/${bAnn.body.id}`)
      .set("Cookie", cookieHeader(a.cookies));
    expect(get.status).toBe(404);
    const patch = await request(app.getHttpServer())
      .patch(`/announcements/${bAnn.body.id}`)
      .set("Cookie", cookieHeader(a.cookies))
      .set("X-CSRF-Token", a.cookies.csrf!)
      .send({ title: "hijack" });
    expect(patch.status).toBe(404);
    const archive = await request(app.getHttpServer())
      .post(`/announcements/${bAnn.body.id}/archive`)
      .set("Cookie", cookieHeader(a.cookies))
      .set("X-CSRF-Token", a.cookies.csrf!);
    expect(archive.status).toBe(404);
  });

  it("audience preview cannot count employees from another org", async () => {
    const a = await signupOrg();
    const b = await signupOrg();
    await createOrphanEmployee(b.cookies);
    await createOrphanEmployee(b.cookies);
    const preview = await request(app.getHttpServer())
      .post("/announcements/audience/preview")
      .set("Cookie", cookieHeader(a.cookies))
      .set("X-CSRF-Token", a.cookies.csrf!)
      .send({ audiences: ALL_AUDIENCE })
      .expect(200);
    expect(preview.body.count).toBe(0);
  });
});
