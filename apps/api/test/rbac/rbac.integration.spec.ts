/**
 * Integration tests for the RBAC API (v0.20).
 *
 * Spins up a real Postgres via testcontainers, boots the full NestJS app, and
 * exercises every RBAC endpoint at the HTTP boundary with supertest.
 *
 * Run with:
 *   pnpm --filter @staffly/api test:integration
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
import { JwtAuthGuard } from "../../src/auth/guards/jwt-auth.guard";
import { CsrfGuard } from "../../src/auth/guards/csrf.guard";
import { PermissionGuard } from "../../src/rbac/permission.guard";
import { TenantInterceptor } from "../../src/tenant/tenant.interceptor";
import { GlobalExceptionFilter } from "../../src/common/http-exception.filter";
import { resetEnvCacheForTests } from "../../src/infra/config/env";
import { PrismaService } from "../../src/infra/prisma/prisma.service";
import {
  CSRF_COOKIE,
  REFRESH_COOKIE,
  ACCESS_COOKIE,
} from "../../src/auth/cookies";

@Module({
  imports: [PrismaModule, AuthModule, RbacModule, AuditModule],
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
let n = 0;

function unique(): string {
  n += 1;
  return `${n}-${Date.now()}`;
}

function uniqueSignup() {
  const u = unique();
  return {
    organizationName: `TestOrg ${u}`,
    slug: `testorg-${u}`,
    email: `admin-${u}@rbac.test`,
    password: "hunter22hunter22",
    fullName: "Admin User",
  };
}

interface AuthCookies {
  access?: string;
  refresh?: string;
  csrf?: string;
}

function extractCookies(header: string | string[] | undefined): AuthCookies {
  const arr = Array.isArray(header)
    ? header
    : typeof header === "string"
      ? [header]
      : [];
  const out: AuthCookies = {};
  for (const c of arr) {
    const [pair] = c.split(";");
    const [name, ...rest] = pair!.split("=");
    const value = rest.join("=");
    if (name === ACCESS_COOKIE) out.access = value;
    else if (name === REFRESH_COOKIE) out.refresh = value;
    else if (name === CSRF_COOKIE) out.csrf = value;
  }
  return out;
}

function cookieHeader(c: AuthCookies): string {
  const parts: string[] = [];
  if (c.access) parts.push(`${ACCESS_COOKIE}=${c.access}`);
  if (c.refresh) parts.push(`${REFRESH_COOKIE}=${c.refresh}`);
  if (c.csrf) parts.push(`${CSRF_COOKIE}=${c.csrf}`);
  return parts.join("; ");
}

/** Sign up and return cookies (caller becomes super_admin of a fresh org). */
async function signup(): Promise<{
  cookies: AuthCookies;
  orgId: string;
  userId: string;
  email: string;
}> {
  const payload = uniqueSignup();
  const res = await request(app.getHttpServer())
    .post("/auth/signup")
    .send(payload);
  if (res.status !== 201)
    throw new Error(`signup failed: ${JSON.stringify(res.body)}`);
  const cookies = extractCookies(res.headers["set-cookie"]);
  return {
    cookies,
    orgId: res.body.organization.id as string,
    userId: res.body.user.id as string,
    email: payload.email,
  };
}

/** Authenticated GET helper. */
function authedGet(path: string, cookies: AuthCookies): request.Test {
  return request(app.getHttpServer())
    .get(path)
    .set("Cookie", cookieHeader(cookies))
    .set("x-csrf-token", cookies.csrf ?? "");
}

function authedPost(
  path: string,
  cookies: AuthCookies,
  body?: object,
): request.Test {
  return request(app.getHttpServer())
    .post(path)
    .set("Cookie", cookieHeader(cookies))
    .set("x-csrf-token", cookies.csrf ?? "")
    .send(body);
}

function authedPatch(
  path: string,
  cookies: AuthCookies,
  body?: object,
): request.Test {
  return request(app.getHttpServer())
    .patch(path)
    .set("Cookie", cookieHeader(cookies))
    .set("x-csrf-token", cookies.csrf ?? "")
    .send(body);
}

function authedPut(
  path: string,
  cookies: AuthCookies,
  body?: object,
): request.Test {
  return request(app.getHttpServer())
    .put(path)
    .set("Cookie", cookieHeader(cookies))
    .set("x-csrf-token", cookies.csrf ?? "")
    .send(body);
}

function authedDelete(path: string, cookies: AuthCookies): request.Test {
  return request(app.getHttpServer())
    .delete(path)
    .set("Cookie", cookieHeader(cookies))
    .set("x-csrf-token", cookies.csrf ?? "");
}

// ─── Lifecycle ───────────────────────────────────────────────────────────────

beforeAll(async () => {
  container = await new PostgreSqlContainer("postgres:18-alpine")
    .withDatabase("staffly_test")
    .withUsername("staffly")
    .withPassword("test")
    .start();

  process.env.DATABASE_URL = container.getConnectionUri();
  process.env.JWT_SECRET = "test-secret-must-be-at-least-32-characters-long";
  process.env.ACCESS_TOKEN_TTL_SECONDS = "900";
  process.env.REFRESH_TOKEN_TTL_SECONDS = "604800";
  process.env.COOKIE_DOMAIN = "localhost";
  process.env.NODE_ENV = "test";
  resetEnvCacheForTests();

  execSync("pnpm prisma migrate deploy", {
    stdio: "inherit",
    env: { ...process.env },
  });
  execSync("pnpm db:seed", {
    stdio: "inherit",
    env: { ...process.env },
  });

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
  // Wipe per-org data; preserve the global Permission catalog.
  await prisma.db.invite.deleteMany();
  await prisma.db.userRole.deleteMany();
  await prisma.db.rolePermission.deleteMany();
  await prisma.db.role.deleteMany();
  await prisma.db.user.deleteMany();
  await prisma.db.organization.deleteMany();
});

// ─── GET /permissions ────────────────────────────────────────────────────────

describe("GET /permissions", () => {
  it("returns full catalog for super_admin", async () => {
    const { cookies } = await signup();
    const res = await authedGet("/permissions", cookies);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.items)).toBe(true);
    expect(res.body.items.length).toBeGreaterThan(0);
    const first = res.body.items[0];
    expect(first).toHaveProperty("key");
    expect(first).toHaveProperty("resource");
    expect(first).toHaveProperty("action");
    expect(first).toHaveProperty("description");
  });

  it("returns 401 when unauthenticated", async () => {
    const res = await request(app.getHttpServer()).get("/permissions");
    expect(res.status).toBe(401);
  });

  it("returns 403 when caller lacks rbac.read", async () => {
    // Bootstrap an org, then create an hr_admin user (has no rbac.read).
    const { cookies, orgId, userId } = await signup();
    const hrCookies = await createHrAdminUser(cookies, orgId);
    const res = await authedGet("/permissions", hrCookies);
    expect(res.status).toBe(403);
  });
});

// ─── Roles CRUD ──────────────────────────────────────────────────────────────

describe("GET /roles", () => {
  it("lists system roles bootstrapped at signup", async () => {
    const { cookies } = await signup();
    const res = await authedGet("/roles", cookies);
    expect(res.status).toBe(200);
    expect(res.body.meta.total).toBeGreaterThanOrEqual(4);
    const keys = res.body.items.map((r: { key: string }) => r.key);
    expect(keys).toContain("super_admin");
    expect(keys).toContain("hr_admin");
    expect(keys).toContain("manager");
    expect(keys).toContain("employee");
  });

  it("returns userCount and permissionCount on each role", async () => {
    const { cookies } = await signup();
    const res = await authedGet("/roles", cookies);
    const superAdmin = res.body.items.find(
      (r: { key: string }) => r.key === "super_admin",
    );
    expect(typeof superAdmin.userCount).toBe("number");
    expect(typeof superAdmin.permissionCount).toBe("number");
  });
});

describe("GET /roles/:id", () => {
  it("returns role with full permission list", async () => {
    const { cookies } = await signup();
    const list = await authedGet("/roles?search=hr_admin", cookies);
    const hrRole = list.body.items[0];
    const res = await authedGet(`/roles/${hrRole.id}`, cookies);
    expect(res.status).toBe(200);
    expect(res.body.id).toBe(hrRole.id);
    expect(Array.isArray(res.body.permissions)).toBe(true);
    expect(res.body.permissions.length).toBeGreaterThan(0);
    expect(res.body.permissions[0]).toHaveProperty("key");
  });

  it("returns 404 for unknown id", async () => {
    const { cookies } = await signup();
    const res = await authedGet(
      "/roles/00000000-0000-0000-0000-000000000000",
      cookies,
    );
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("role.not_found");
  });
});

describe("POST /roles", () => {
  it("creates a custom role with specified permissions", async () => {
    const { cookies } = await signup();
    const res = await authedPost("/roles", cookies, {
      name: "Content Reviewer",
      description: "Can read announcements and documents.",
      permissions: ["announcement.read", "document.read"],
    });
    expect(res.status).toBe(201);
    expect(res.body.key).toBe("content_reviewer");
    expect(res.body.isSystem).toBe(false);
    expect(res.body.permissions.map((p: { key: string }) => p.key)).toContain(
      "announcement.read",
    );
  });

  it("returns 409 when a role with the same generated key exists", async () => {
    const { cookies } = await signup();
    await authedPost("/roles", cookies, { name: "Duplicate Role" });
    const res2 = await authedPost("/roles", cookies, {
      name: "Duplicate Role",
    });
    expect(res2.status).toBe(409);
    expect(res2.body.error.code).toBe("role.conflict_key");
  });

  it("returns 400 for unknown permission keys", async () => {
    const { cookies } = await signup();
    const res = await authedPost("/roles", cookies, {
      name: "Bad Role",
      permissions: ["nonexistent.permission"],
    });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("role.unknown_permissions");
  });

  it("returns 403 when caller lacks rbac.write", async () => {
    const { cookies, orgId } = await signup();
    const hrCookies = await createHrAdminUser(cookies, orgId);
    const res = await authedPost("/roles", hrCookies, { name: "Test" });
    expect(res.status).toBe(403);
  });
});

describe("PATCH /roles/:id", () => {
  it("updates name, description, and permission set", async () => {
    const { cookies } = await signup();
    const created = await authedPost("/roles", cookies, {
      name: "Old Name",
      permissions: ["announcement.read"],
    });
    const id = created.body.id as string;

    const res = await authedPatch(`/roles/${id}`, cookies, {
      name: "New Name",
      permissions: ["document.read", "holiday.read"],
    });
    expect(res.status).toBe(200);
    expect(res.body.name).toBe("New Name");
    const permKeys = res.body.permissions.map((p: { key: string }) => p.key);
    expect(permKeys).toContain("document.read");
    expect(permKeys).not.toContain("announcement.read");
  });

  it("blocks updating name/description/permissions of a system role", async () => {
    const { cookies } = await signup();
    const list = await authedGet("/roles?search=manager", cookies);
    const mgr = list.body.items.find(
      (r: { key: string }) => r.key === "manager",
    );

    const res = await authedPatch(`/roles/${mgr.id}`, cookies, {
      name: "Team Lead",
    });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("role.system_immutable");
  });
});

describe("DELETE /roles/:id", () => {
  it("soft-deletes a custom role with no users", async () => {
    const { cookies } = await signup();
    const created = await authedPost("/roles", cookies, { name: "Temp Role" });
    const id = created.body.id as string;

    const del = await authedDelete(`/roles/${id}`, cookies);
    expect(del.status).toBe(204);

    // Detail stays 200 with `deletedAt` set so the FE can render Restore.
    const get = await authedGet(`/roles/${id}`, cookies);
    expect(get.status).toBe(200);
    expect(get.body.deletedAt).not.toBeNull();

    // But default list hides it; includeArchived=true surfaces it.
    const live = await authedGet("/roles", cookies);
    expect(live.body.items.find((r: { id: string }) => r.id === id)).toBeUndefined();
    const archived = await authedGet("/roles?includeArchived=true", cookies);
    expect(archived.body.items.find((r: { id: string }) => r.id === id)).toBeDefined();
  });

  it("blocks delete of a system role", async () => {
    const { cookies } = await signup();
    const list = await authedGet("/roles", cookies);
    const emp = list.body.items.find(
      (r: { key: string }) => r.key === "employee",
    );

    const res = await authedDelete(`/roles/${emp.id}`, cookies);
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("role.system_undeletable");
  });

  it("blocks delete when users are assigned", async () => {
    const { cookies, orgId } = await signup();
    const created = await authedPost("/roles", cookies, { name: "Busy Role" });
    const roleId = created.body.id as string;

    // Create a user and assign this role.
    const { userId } = await createAnyUser(cookies, orgId);
    await authedPut(`/users/${userId}/roles`, cookies, { roleId });

    const del = await authedDelete(`/roles/${roleId}`, cookies);
    expect(del.status).toBe(409);
    expect(del.body.error.code).toBe("role.in_use");
  });
});

// ─── GET /users & PUT /users/:id/roles ───────────────────────────────────────

describe("GET /users", () => {
  it("returns all users with their roles", async () => {
    const { cookies } = await signup();
    const res = await authedGet("/users", cookies);
    expect(res.status).toBe(200);
    expect(res.body.meta.total).toBeGreaterThanOrEqual(1);
    const self = res.body.items[0];
    expect(self.email).toBeDefined();
    expect(Array.isArray(self.roles)).toBe(true);
    expect(self.roles[0].key).toBe("super_admin");
  });
});

describe("PUT /users/:id/roles", () => {
  it("assigns a single role, replacing the previous one", async () => {
    const { cookies, orgId } = await signup();

    // Create a second user (hr_admin) to reassign — avoids stripping the
    // super_admin caller's own role, which would lose rbac.read access.
    const { userId: targetId } = await createAnyUser(cookies, orgId);

    // Get the employee role id.
    const list = await authedGet("/roles", cookies);
    const empRole = list.body.items.find(
      (r: { key: string }) => r.key === "employee",
    );

    const res = await authedPut(`/users/${targetId}/roles`, cookies, {
      roleId: empRole.id,
    });
    expect(res.status).toBe(200);
    expect(res.body.role.key).toBe("employee");

    // Verify via GET /users — super_admin still has rbac.read.
    const users = await authedGet("/users", cookies);
    const target = users.body.items.find(
      (u: { id: string }) => u.id === targetId,
    );
    expect(target.roles).toHaveLength(1);
    expect(target.roles[0].key).toBe("employee");
  });

  it("blocks assigning super_admin role", async () => {
    const { cookies, orgId } = await signup();
    const { userId: targetId } = await createAnyUser(cookies, orgId);

    const list = await authedGet("/roles", cookies);
    const sa = list.body.items.find(
      (r: { key: string }) => r.key === "super_admin",
    );

    const res = await authedPut(`/users/${targetId}/roles`, cookies, {
      roleId: sa.id,
    });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("role.super_admin_protected");
  });

  it("returns 404 for unknown user", async () => {
    const { cookies } = await signup();
    const list = await authedGet("/roles", cookies);
    const empRole = list.body.items.find(
      (r: { key: string }) => r.key === "employee",
    );
    const res = await authedPut(
      "/users/00000000-0000-0000-0000-000000000000/roles",
      cookies,
      { roleId: empRole.id },
    );
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("user.not_found");
  });
});

// ─── Invites ─────────────────────────────────────────────────────────────────

describe("POST /invites", () => {
  it("creates an invite and returns inviteUrl", async () => {
    const { cookies } = await signup();
    const email = `invitee-${unique()}@test.local`;
    const res = await authedPost("/invites", cookies, {
      email,
      roleKey: "hr_admin",
    });
    expect(res.status).toBe(201);
    expect(res.body.email).toBe(email);
    expect(res.body.roleKey).toBe("hr_admin");
    expect(res.body.status).toBe("pending");
    expect(res.body.inviteUrl).toContain("accept-invite?token=");
  });

  it("blocks duplicate pending invite for the same email", async () => {
    const { cookies } = await signup();
    const email = `dup-${unique()}@test.local`;
    await authedPost("/invites", cookies, { email, roleKey: "employee" });
    const res2 = await authedPost("/invites", cookies, {
      email,
      roleKey: "employee",
    });
    expect(res2.status).toBe(409);
    expect(res2.body.error.code).toBe("invite.already_pending");
  });

  it("blocks super_admin invite", async () => {
    const { cookies } = await signup();
    const res = await authedPost("/invites", cookies, {
      email: `sa-${unique()}@test.local`,
      roleKey: "super_admin",
    });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("invite.super_admin_protected");
  });

  it("returns 403 when caller lacks employee.invite", async () => {
    const { cookies, orgId } = await signup();
    // employee role lacks employee.invite
    const empCookies = await createEmployeeUser(cookies, orgId);
    const res = await authedPost("/invites", empCookies, {
      email: `emp-${unique()}@test.local`,
      roleKey: "employee",
    });
    expect(res.status).toBe(403);
  });
});

describe("GET /invites", () => {
  it("lists invites with status filter", async () => {
    const { cookies } = await signup();
    await authedPost("/invites", cookies, {
      email: `a-${unique()}@test.local`,
      roleKey: "employee",
    });
    const res = await authedGet("/invites?status=pending", cookies);
    expect(res.status).toBe(200);
    expect(res.body.meta.total).toBeGreaterThanOrEqual(1);
    expect(res.body.items[0].status).toBe("pending");
  });
});

describe("DELETE /invites/:id (revoke)", () => {
  it("revokes a pending invite", async () => {
    const { cookies } = await signup();
    const inv = await authedPost("/invites", cookies, {
      email: `rev-${unique()}@test.local`,
      roleKey: "employee",
    });
    const id = inv.body.id as string;

    const del = await authedDelete(`/invites/${id}`, cookies);
    expect(del.status).toBe(204);

    const list = await authedGet(`/invites?status=revoked`, cookies);
    const found = list.body.items.find((i: { id: string }) => i.id === id);
    expect(found).toBeDefined();
    expect(found.status).toBe("revoked");
  });

  it("returns 400 when invite is not pending", async () => {
    const { cookies } = await signup();
    const inv = await authedPost("/invites", cookies, {
      email: `nonpending-${unique()}@test.local`,
      roleKey: "employee",
    });
    const id = inv.body.id as string;

    // Revoke first time.
    await authedDelete(`/invites/${id}`, cookies);
    // Second revoke should fail.
    const res = await authedDelete(`/invites/${id}`, cookies);
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("invite.not_revokable");
  });
});

describe("POST /invites/:id/resend", () => {
  it("expires the old invite and returns a new inviteUrl", async () => {
    const { cookies } = await signup();
    const email = `resend-${unique()}@test.local`;
    const inv = await authedPost("/invites", cookies, {
      email,
      roleKey: "employee",
    });
    const oldId = inv.body.id as string;
    const oldUrl = inv.body.inviteUrl as string;

    const res = await authedPost(`/invites/${oldId}/resend`, cookies);
    expect(res.status).toBe(201);
    expect(res.body.email).toBe(email);
    expect(res.body.inviteUrl).not.toBe(oldUrl);
    expect(res.body.inviteUrl).toContain("accept-invite?token=");

    // Old invite should now be expired.
    const list = await authedGet(`/invites?status=expired`, cookies);
    const expired = list.body.items.find((i: { id: string }) => i.id === oldId);
    expect(expired).toBeDefined();
  });

  it("returns 400 when resending a revoked invite", async () => {
    const { cookies } = await signup();
    const inv = await authedPost("/invites", cookies, {
      email: `rev2-${unique()}@test.local`,
      roleKey: "employee",
    });
    const id = inv.body.id as string;
    await authedDelete(`/invites/${id}`, cookies);

    const res = await authedPost(`/invites/${id}/resend`, cookies);
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("invite.revoked");
  });
});

// ─── Auth guards ─────────────────────────────────────────────────────────────

describe("auth guards", () => {
  it("returns 401 for all RBAC endpoints when unauthenticated", async () => {
    const endpoints = [
      { method: "GET", path: "/roles" },
      { method: "GET", path: "/permissions" },
      { method: "GET", path: "/users" },
      { method: "GET", path: "/invites" },
    ] as const;

    for (const ep of endpoints) {
      const res = await request(app.getHttpServer())[
        ep.method.toLowerCase() as "get"
      ](ep.path);
      expect(res.status, `${ep.method} ${ep.path}`).toBe(401);
    }
  });
});

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Creates an hr_admin user in the given org and returns their cookies. */
async function createHrAdminUser(
  adminCookies: AuthCookies,
  orgId: string,
): Promise<AuthCookies> {
  const email = `hr-${unique()}@test.local`;
  const inv = await authedPost("/invites", adminCookies, {
    email,
    roleKey: "hr_admin",
  });
  const token = (inv.body.inviteUrl as string).split("token=")[1];
  const accepted = await request(app.getHttpServer())
    .post("/auth/accept-invite")
    .send({
      token,
      password: "hunter22hunter22",
      firstName: "HR",
      lastName: "User",
    });
  return extractCookies(accepted.headers["set-cookie"]);
}

/** Creates an employee-role user and returns their cookies. */
async function createEmployeeUser(
  adminCookies: AuthCookies,
  orgId: string,
): Promise<AuthCookies> {
  const email = `emp-${unique()}@test.local`;
  const inv = await authedPost("/invites", adminCookies, {
    email,
    roleKey: "employee",
  });
  const token = (inv.body.inviteUrl as string).split("token=")[1];
  const accepted = await request(app.getHttpServer())
    .post("/auth/accept-invite")
    .send({
      token,
      password: "hunter22hunter22",
      firstName: "Emp",
      lastName: "User",
    });
  return extractCookies(accepted.headers["set-cookie"]);
}

/** Creates any user (hr_admin) and returns their userId for role tests. */
async function createAnyUser(
  adminCookies: AuthCookies,
  orgId: string,
): Promise<{ userId: string; cookies: AuthCookies }> {
  const cookies = await createHrAdminUser(adminCookies, orgId);
  const me = await authedGet("/auth/me", cookies);
  return { userId: me.body.user.id as string, cookies };
}
