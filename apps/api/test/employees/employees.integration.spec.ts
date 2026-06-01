/**
 * Integration tests for Batch 4 — Employee Management + Org Structure CRUD.
 * Same testcontainers + supertest + Nest test app pattern as
 * test/auth/auth.integration.spec.ts.
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

function parseSetCookie(hdr: string | string[] | undefined): CookieBag {
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

function asCookie(c: CookieBag): string {
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
    fullName: "Alice",
  };
  const res = await request(app.getHttpServer())
    .post("/auth/signup")
    .send(payload)
    .expect(201);
  return {
    cookies: parseSetCookie(res.headers["set-cookie"]),
    organizationId: res.body.organization.id,
    userId: res.body.user.id,
    email: payload.email,
  };
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

// ─── Departments ────────────────────────────────────────────────────────

describe("departments CRUD", () => {
  it("create → list → get → update → delete", async () => {
    const { cookies } = await signupOrg();

    const create = await request(app.getHttpServer())
      .post("/departments")
      .set("Cookie", asCookie(cookies))
      .set("X-CSRF-Token", cookies.csrf!)
      .send({ name: "Engineering", code: "ENG" });
    expect(create.status).toBe(201);
    const id = create.body.id;

    const list = await request(app.getHttpServer())
      .get("/departments")
      .set("Cookie", asCookie(cookies));
    expect(list.status).toBe(200);
    expect(list.body.items).toHaveLength(1);
    expect(list.body.meta.total).toBe(1);

    const get = await request(app.getHttpServer())
      .get(`/departments/${id}`)
      .set("Cookie", asCookie(cookies));
    expect(get.status).toBe(200);
    expect(get.body.name).toBe("Engineering");

    const patch = await request(app.getHttpServer())
      .patch(`/departments/${id}`)
      .set("Cookie", asCookie(cookies))
      .set("X-CSRF-Token", cookies.csrf!)
      .send({ name: "Eng" });
    expect(patch.status).toBe(200);
    expect(patch.body.name).toBe("Eng");

    const del = await request(app.getHttpServer())
      .delete(`/departments/${id}`)
      .set("Cookie", asCookie(cookies))
      .set("X-CSRF-Token", cookies.csrf!);
    expect(del.status).toBe(204);

    const after = await request(app.getHttpServer())
      .get("/departments")
      .set("Cookie", asCookie(cookies));
    expect(after.body.items).toHaveLength(0);
  });

  it("duplicate name → 409", async () => {
    const { cookies } = await signupOrg();
    await request(app.getHttpServer())
      .post("/departments")
      .set("Cookie", asCookie(cookies))
      .set("X-CSRF-Token", cookies.csrf!)
      .send({ name: "Engineering" })
      .expect(201);
    const dup = await request(app.getHttpServer())
      .post("/departments")
      .set("Cookie", asCookie(cookies))
      .set("X-CSRF-Token", cookies.csrf!)
      .send({ name: "Engineering" });
    expect(dup.status).toBe(409);
  });

  it("RBAC: no perm → 403", async () => {
    const { cookies, organizationId, userId } = await signupOrg();
    // Downgrade to employee role (no org.structure.write).
    await prisma.db.userRole.deleteMany({ where: { userId } });
    const emp = await prisma.db.role.findFirstOrThrow({
      where: { organizationId, key: "employee" },
    });
    await prisma.db.userRole.create({
      data: { organizationId, userId, roleId: emp.id },
    });
    const res = await request(app.getHttpServer())
      .post("/departments")
      .set("Cookie", asCookie(cookies))
      .set("X-CSRF-Token", cookies.csrf!)
      .send({ name: "Sales" });
    expect(res.status).toBe(403);
  });

  it("audit log written on create", async () => {
    const { cookies, organizationId } = await signupOrg();
    const res = await request(app.getHttpServer())
      .post("/departments")
      .set("Cookie", asCookie(cookies))
      .set("X-CSRF-Token", cookies.csrf!)
      .send({ name: "Marketing" })
      .expect(201);
    const log = await prisma.db.auditLog.findFirst({
      where: {
        organizationId,
        action: "department.create",
        resourceId: res.body.id,
      },
    });
    expect(log).not.toBeNull();
  });
});

// ─── Designations + Locations (smoke) ────────────────────────────────────

describe("designations & locations", () => {
  it("designation create + list", async () => {
    const { cookies } = await signupOrg();
    await request(app.getHttpServer())
      .post("/designations")
      .set("Cookie", asCookie(cookies))
      .set("X-CSRF-Token", cookies.csrf!)
      .send({ name: "Software Engineer", level: 3 })
      .expect(201);
    const list = await request(app.getHttpServer())
      .get("/designations")
      .set("Cookie", asCookie(cookies));
    expect(list.body.items[0].name).toBe("Software Engineer");
  });

  it("location create + list + search", async () => {
    const { cookies } = await signupOrg();
    await request(app.getHttpServer())
      .post("/locations")
      .set("Cookie", asCookie(cookies))
      .set("X-CSRF-Token", cookies.csrf!)
      .send({ name: "Bangalore HQ", city: "Bangalore", country: "IN" })
      .expect(201);
    await request(app.getHttpServer())
      .post("/locations")
      .set("Cookie", asCookie(cookies))
      .set("X-CSRF-Token", cookies.csrf!)
      .send({ name: "Mumbai", city: "Mumbai", country: "IN" })
      .expect(201);
    const search = await request(app.getHttpServer())
      .get("/locations?search=bangalore")
      .set("Cookie", asCookie(cookies));
    expect(search.body.items).toHaveLength(1);
    expect(search.body.items[0].city).toBe("Bangalore");
  });
});

// ─── Employees ───────────────────────────────────────────────────────────

describe("employees", () => {
  async function setupOrgWithStructure(): Promise<{
    cookies: CookieBag;
    deptId: string;
    desigId: string;
    locId: string;
  }> {
    const { cookies } = await signupOrg();
    const dept = await request(app.getHttpServer())
      .post("/departments")
      .set("Cookie", asCookie(cookies))
      .set("X-CSRF-Token", cookies.csrf!)
      .send({ name: "Engineering" })
      .expect(201);
    const desig = await request(app.getHttpServer())
      .post("/designations")
      .set("Cookie", asCookie(cookies))
      .set("X-CSRF-Token", cookies.csrf!)
      .send({ name: "Engineer" })
      .expect(201);
    const loc = await request(app.getHttpServer())
      .post("/locations")
      .set("Cookie", asCookie(cookies))
      .set("X-CSRF-Token", cookies.csrf!)
      .send({ name: "HQ" })
      .expect(201);
    return {
      cookies,
      deptId: dept.body.id,
      desigId: desig.body.id,
      locId: loc.body.id,
    };
  }

  it("create + get (profile shape with relations)", async () => {
    const { cookies, deptId, desigId, locId } = await setupOrgWithStructure();
    const create = await request(app.getHttpServer())
      .post("/employees")
      .set("Cookie", asCookie(cookies))
      .set("X-CSRF-Token", cookies.csrf!)
      .send({
        employeeCode: "E001",
        firstName: "Alice",
        lastName: "Smith",
        workEmail: "alice.smith@acme.test",
        departmentId: deptId,
        designationId: desigId,
        locationId: locId,
        joinedOn: "2025-01-15",
      });
    expect(create.status).toBe(201);
    expect(create.body.displayName).toBe("Alice Smith");

    const get = await request(app.getHttpServer())
      .get(`/employees/${create.body.id}`)
      .set("Cookie", asCookie(cookies));
    expect(get.status).toBe(200);
    expect(get.body.department.name).toBe("Engineering");
    expect(get.body.designation.name).toBe("Engineer");
    expect(get.body.location.name).toBe("HQ");
  });

  it("update recomputes displayName", async () => {
    const { cookies } = await setupOrgWithStructure();
    const create = await request(app.getHttpServer())
      .post("/employees")
      .set("Cookie", asCookie(cookies))
      .set("X-CSRF-Token", cookies.csrf!)
      .send({
        employeeCode: "E002",
        firstName: "Bob",
        lastName: "Jones",
        workEmail: "bob@acme.test",
      })
      .expect(201);
    const patch = await request(app.getHttpServer())
      .patch(`/employees/${create.body.id}`)
      .set("Cookie", asCookie(cookies))
      .set("X-CSRF-Token", cookies.csrf!)
      .send({ middleName: "Q", lastName: "Smith" });
    expect(patch.status).toBe(200);
    expect(patch.body.displayName).toBe("Bob Q Smith");
  });

  it("duplicate employeeCode → 409", async () => {
    const { cookies } = await setupOrgWithStructure();
    await request(app.getHttpServer())
      .post("/employees")
      .set("Cookie", asCookie(cookies))
      .set("X-CSRF-Token", cookies.csrf!)
      .send({
        employeeCode: "E100",
        firstName: "A",
        lastName: "B",
        workEmail: "a@acme.test",
      })
      .expect(201);
    const dup = await request(app.getHttpServer())
      .post("/employees")
      .set("Cookie", asCookie(cookies))
      .set("X-CSRF-Token", cookies.csrf!)
      .send({
        employeeCode: "E100",
        firstName: "C",
        lastName: "D",
        workEmail: "c@acme.test",
      });
    expect(dup.status).toBe(409);
  });

  it("list: search by displayName / employeeCode", async () => {
    const { cookies } = await setupOrgWithStructure();
    for (const e of [
      {
        employeeCode: "E-001",
        firstName: "Alice",
        lastName: "Smith",
        workEmail: "alice@acme.test",
      },
      {
        employeeCode: "E-002",
        firstName: "Bob",
        lastName: "Brown",
        workEmail: "bob@acme.test",
      },
      {
        employeeCode: "E-003",
        firstName: "Carol",
        lastName: "Jones",
        workEmail: "carol@acme.test",
      },
    ]) {
      await request(app.getHttpServer())
        .post("/employees")
        .set("Cookie", asCookie(cookies))
        .set("X-CSRF-Token", cookies.csrf!)
        .send(e)
        .expect(201);
    }
    const search = await request(app.getHttpServer())
      .get("/employees?search=alice")
      .set("Cookie", asCookie(cookies));
    expect(search.status).toBe(200);
    expect(search.body.items).toHaveLength(1);
    expect(search.body.items[0].displayName).toBe("Alice Smith");

    const code = await request(app.getHttpServer())
      .get("/employees?search=E-00")
      .set("Cookie", asCookie(cookies));
    expect(code.body.items).toHaveLength(3);
  });

  it("list: filter by departmentId", async () => {
    const { cookies, deptId } = await setupOrgWithStructure();
    await request(app.getHttpServer())
      .post("/employees")
      .set("Cookie", asCookie(cookies))
      .set("X-CSRF-Token", cookies.csrf!)
      .send({
        employeeCode: "E-A",
        firstName: "A",
        lastName: "X",
        workEmail: "ax@acme.test",
        departmentId: deptId,
      })
      .expect(201);
    await request(app.getHttpServer())
      .post("/employees")
      .set("Cookie", asCookie(cookies))
      .set("X-CSRF-Token", cookies.csrf!)
      .send({
        employeeCode: "E-B",
        firstName: "B",
        lastName: "X",
        workEmail: "bx@acme.test",
      })
      .expect(201);
    const res = await request(app.getHttpServer())
      .get(`/employees?departmentId=${deptId}`)
      .set("Cookie", asCookie(cookies));
    expect(res.body.items).toHaveLength(1);
    expect(res.body.items[0].employeeCode).toBe("E-A");
  });

  it("list: pagination", async () => {
    const { cookies } = await setupOrgWithStructure();
    for (let i = 0; i < 5; i++) {
      await request(app.getHttpServer())
        .post("/employees")
        .set("Cookie", asCookie(cookies))
        .set("X-CSRF-Token", cookies.csrf!)
        .send({
          employeeCode: `P-${i}`,
          firstName: `User${i}`,
          lastName: "Page",
          workEmail: `u${i}@acme.test`,
        })
        .expect(201);
    }
    const p1 = await request(app.getHttpServer())
      .get("/employees?page=1&pageSize=2&sortBy=employeeCode&sortDir=asc")
      .set("Cookie", asCookie(cookies));
    expect(p1.body.items).toHaveLength(2);
    expect(p1.body.meta.total).toBe(5);
    expect(p1.body.meta.totalPages).toBe(3);
    const p2 = await request(app.getHttpServer())
      .get("/employees?page=2&pageSize=2&sortBy=employeeCode&sortDir=asc")
      .set("Cookie", asCookie(cookies));
    expect(p2.body.items).toHaveLength(2);
    expect(p2.body.items[0].employeeCode).not.toBe(
      p1.body.items[0].employeeCode,
    );
  });

  it("soft delete: row hidden from list and get", async () => {
    const { cookies } = await setupOrgWithStructure();
    const create = await request(app.getHttpServer())
      .post("/employees")
      .set("Cookie", asCookie(cookies))
      .set("X-CSRF-Token", cookies.csrf!)
      .send({
        employeeCode: "E-D",
        firstName: "Delete",
        lastName: "Me",
        workEmail: "d@acme.test",
      })
      .expect(201);
    await request(app.getHttpServer())
      .delete(`/employees/${create.body.id}`)
      .set("Cookie", asCookie(cookies))
      .set("X-CSRF-Token", cookies.csrf!)
      .expect(204);
    const get = await request(app.getHttpServer())
      .get(`/employees/${create.body.id}`)
      .set("Cookie", asCookie(cookies));
    expect(get.status).toBe(404);
    const list = await request(app.getHttpServer())
      .get("/employees")
      .set("Cookie", asCookie(cookies));
    expect(list.body.items).toHaveLength(0);
  });

  it("tenant isolation: Org-A cannot see Org-B employees", async () => {
    const a = await signupOrg();
    const b = await signupOrg();
    await request(app.getHttpServer())
      .post("/employees")
      .set("Cookie", asCookie(a.cookies))
      .set("X-CSRF-Token", a.cookies.csrf!)
      .send({
        employeeCode: "A-1",
        firstName: "A",
        lastName: "A",
        workEmail: "a-1@acme.test",
      })
      .expect(201);
    await request(app.getHttpServer())
      .post("/employees")
      .set("Cookie", asCookie(b.cookies))
      .set("X-CSRF-Token", b.cookies.csrf!)
      .send({
        employeeCode: "B-1",
        firstName: "B",
        lastName: "B",
        workEmail: "b-1@beta.test",
      })
      .expect(201);
    const listA = await request(app.getHttpServer())
      .get("/employees")
      .set("Cookie", asCookie(a.cookies));
    expect(listA.body.items).toHaveLength(1);
    expect(listA.body.items[0].employeeCode).toBe("A-1");
    const listB = await request(app.getHttpServer())
      .get("/employees")
      .set("Cookie", asCookie(b.cookies));
    expect(listB.body.items).toHaveLength(1);
    expect(listB.body.items[0].employeeCode).toBe("B-1");
  });

  it("audit logs on create/update/delete", async () => {
    const { cookies, organizationId } = (await signupOrg()) as Awaited<
      ReturnType<typeof signupOrg>
    >;
    const create = await request(app.getHttpServer())
      .post("/employees")
      .set("Cookie", asCookie(cookies))
      .set("X-CSRF-Token", cookies.csrf!)
      .send({
        employeeCode: "AUD-1",
        firstName: "Aud",
        lastName: "Itor",
        workEmail: "aud@acme.test",
      })
      .expect(201);
    await request(app.getHttpServer())
      .patch(`/employees/${create.body.id}`)
      .set("Cookie", asCookie(cookies))
      .set("X-CSRF-Token", cookies.csrf!)
      .send({ firstName: "Audrey" })
      .expect(200);
    await request(app.getHttpServer())
      .delete(`/employees/${create.body.id}`)
      .set("Cookie", asCookie(cookies))
      .set("X-CSRF-Token", cookies.csrf!)
      .expect(204);
    const logs = await prisma.db.auditLog.findMany({
      where: {
        organizationId,
        resourceType: "employee",
        resourceId: create.body.id,
      },
      orderBy: { createdAt: "asc" },
    });
    expect(logs.map((l) => l.action)).toEqual([
      "employee.create",
      "employee.update",
      "employee.delete",
    ]);
  });
});
