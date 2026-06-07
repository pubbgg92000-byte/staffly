/**
 * Integration tests for Sprint v0.22 — in-app notifications (read side).
 * Covers: self-feed listing + user isolation, tenant isolation, unread count,
 * mark-read, mark-all-read, offset pagination + unreadOnly filter, invalid
 * notification access (404), and auth requirement.
 *
 * Notifications are seeded directly via Prisma (with explicit organizationId +
 * userId, since no tenant context is active outside an HTTP request) — there is
 * no producer endpoint in scope for v0.22 beyond the existing announcement
 * fan-out, which is covered by the announcements suite.
 */
import { beforeAll, afterAll, beforeEach, describe, expect, it } from "vitest";
import {
  PostgreSqlContainer,
  type StartedPostgreSqlContainer,
} from "@testcontainers/postgresql";
import { execSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { type INestApplication, Module } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from "@nestjs/core";
import cookieParser from "cookie-parser";
import request from "supertest";

import { PrismaModule } from "../../src/infra/prisma/prisma.module";
import { AuthModule } from "../../src/auth/auth.module";
import { RbacModule } from "../../src/rbac/rbac.module";
import { NotificationsModule } from "../../src/notifications/notifications.module";
import { JwtAuthGuard } from "../../src/auth/guards/jwt-auth.guard";
import { CsrfGuard } from "../../src/auth/guards/csrf.guard";
import { PermissionGuard } from "../../src/rbac/permission.guard";
import { TenantInterceptor } from "../../src/tenant/tenant.interceptor";
import { GlobalExceptionFilter } from "../../src/common/http-exception.filter";
import { resetEnvCacheForTests } from "../../src/infra/config/env";
import { PrismaService } from "../../src/infra/prisma/prisma.service";
import { ACCESS_COOKIE, CSRF_COOKIE } from "../../src/auth/cookies";

@Module({
  imports: [PrismaModule, AuthModule, RbacModule, NotificationsModule],
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

async function createUser(organizationId: string): Promise<string> {
  unique += 1;
  const u = await prisma.db.user.create({
    data: {
      organizationId,
      email: `extra-${unique}-${Date.now()}@test.local`,
      status: "active",
    },
  });
  return u.id;
}

/** Seed a notification row directly (no tenant context → extension passes through). */
async function seedNotification(
  organizationId: string,
  userId: string,
  overrides: Record<string, unknown> = {},
): Promise<{ id: string; readAt: Date | null }> {
  return prisma.db.notification.create({
    data: {
      organizationId,
      userId,
      templateId: "announcement.published",
      payload: {
        title: "Hello",
        priority: "normal",
        requiresAcknowledgment: false,
      },
      linkTo: "/announcements/seed",
      ...overrides,
    },
    select: { id: true, readAt: true },
  });
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
  await prisma.db.notification.deleteMany();
  await prisma.db.auditLog.deleteMany();
  await prisma.db.refreshToken.deleteMany();
  await prisma.db.userRole.deleteMany();
  await prisma.db.rolePermission.deleteMany();
  await prisma.db.role.deleteMany();
  await prisma.db.user.deleteMany();
  await prisma.db.organization.deleteMany();
});

// ─── List + user isolation ───────────────────────────────────────────

describe("list + user isolation", () => {
  it("returns only the caller's notifications within the tenant", async () => {
    const { cookies, organizationId, userId } = await signupOrg();
    const other = await createUser(organizationId);
    await seedNotification(organizationId, userId, {
      payload: { title: "Mine 1" },
    });
    await seedNotification(organizationId, userId, {
      payload: { title: "Mine 2" },
    });
    await seedNotification(organizationId, other, {
      payload: { title: "Theirs" },
    });

    const res = await request(app.getHttpServer())
      .get("/me/notifications")
      .set("Cookie", cookieHeader(cookies))
      .expect(200);

    expect(res.body.meta.total).toBe(2);
    const titles = res.body.items
      .map((n: { payload: { title: string } }) => n.payload.title)
      .sort();
    expect(titles).toEqual(["Mine 1", "Mine 2"]);
  });

  it("orders newest-first by default", async () => {
    const { cookies, organizationId, userId } = await signupOrg();
    const older = await seedNotification(organizationId, userId);
    await new Promise((r) => setTimeout(r, 5));
    const newer = await seedNotification(organizationId, userId);

    const res = await request(app.getHttpServer())
      .get("/me/notifications")
      .set("Cookie", cookieHeader(cookies))
      .expect(200);
    expect(res.body.items[0].id).toBe(newer.id);
    expect(res.body.items[1].id).toBe(older.id);
  });
});

// ─── Response shape ──────────────────────────────────────────────────

describe("response shape", () => {
  it("returns the full item shape including a top-level priority column", async () => {
    const { cookies, organizationId, userId } = await signupOrg();
    await seedNotification(organizationId, userId, { priority: "high" });

    const res = await request(app.getHttpServer())
      .get("/me/notifications")
      .set("Cookie", cookieHeader(cookies))
      .expect(200);

    const item = res.body.items[0];
    expect(item.priority).toBe("high");
    expect(item).toMatchObject({
      id: expect.any(String),
      templateId: "announcement.published",
      linkTo: "/announcements/seed",
      readAt: null,
    });
    expect(typeof item.createdAt).toBe("string");
    expect(item.payload).toMatchObject({ title: "Hello" });
  });
});

// ─── Tenant isolation ────────────────────────────────────────────────

describe("tenant isolation", () => {
  it("a user never sees another org's notifications", async () => {
    const a = await signupOrg();
    const b = await signupOrg();
    await seedNotification(b.organizationId, b.userId, {
      payload: { title: "B-only" },
    });

    const res = await request(app.getHttpServer())
      .get("/me/notifications")
      .set("Cookie", cookieHeader(a.cookies))
      .expect(200);
    expect(res.body.meta.total).toBe(0);

    const count = await request(app.getHttpServer())
      .get("/me/notifications/unread-count")
      .set("Cookie", cookieHeader(a.cookies))
      .expect(200);
    expect(count.body.count).toBe(0);
  });
});

// ─── Unread count ────────────────────────────────────────────────────

describe("unread count", () => {
  it("counts only the caller's unread rows", async () => {
    const { cookies, organizationId, userId } = await signupOrg();
    await seedNotification(organizationId, userId);
    await seedNotification(organizationId, userId);
    await seedNotification(organizationId, userId, { readAt: new Date() });

    const res = await request(app.getHttpServer())
      .get("/me/notifications/unread-count")
      .set("Cookie", cookieHeader(cookies))
      .expect(200);
    expect(res.body.count).toBe(2);
  });
});

// ─── Mark read ───────────────────────────────────────────────────────

describe("mark read", () => {
  it("marks a single notification read (204) and decrements the unread count", async () => {
    const { cookies, organizationId, userId } = await signupOrg();
    const n1 = await seedNotification(organizationId, userId);
    await seedNotification(organizationId, userId);

    await request(app.getHttpServer())
      .post(`/me/notifications/${n1.id}/read`)
      .set("Cookie", cookieHeader(cookies))
      .set("X-CSRF-Token", cookies.csrf!)
      .expect(204);

    const fresh = await prisma.db.notification.findFirstOrThrow({
      where: { id: n1.id },
    });
    expect(fresh.readAt).not.toBeNull();

    const count = await request(app.getHttpServer())
      .get("/me/notifications/unread-count")
      .set("Cookie", cookieHeader(cookies))
      .expect(200);
    expect(count.body.count).toBe(1);
  });

  it("is idempotent: re-reading preserves the original readAt", async () => {
    const { cookies, organizationId, userId } = await signupOrg();
    const n = await seedNotification(organizationId, userId);

    await request(app.getHttpServer())
      .post(`/me/notifications/${n.id}/read`)
      .set("Cookie", cookieHeader(cookies))
      .set("X-CSRF-Token", cookies.csrf!)
      .expect(204);
    const first = await prisma.db.notification.findFirstOrThrow({
      where: { id: n.id },
    });

    await request(app.getHttpServer())
      .post(`/me/notifications/${n.id}/read`)
      .set("Cookie", cookieHeader(cookies))
      .set("X-CSRF-Token", cookies.csrf!)
      .expect(204);
    const second = await prisma.db.notification.findFirstOrThrow({
      where: { id: n.id },
    });
    expect(second.readAt?.getTime()).toBe(first.readAt?.getTime());
  });
});

// ─── Mark all read ───────────────────────────────────────────────────

describe("mark all read", () => {
  it("marks every unread notification read", async () => {
    const { cookies, organizationId, userId } = await signupOrg();
    await seedNotification(organizationId, userId);
    await seedNotification(organizationId, userId);
    await seedNotification(organizationId, userId, { readAt: new Date() });

    await request(app.getHttpServer())
      .post("/me/notifications/read-all")
      .set("Cookie", cookieHeader(cookies))
      .set("X-CSRF-Token", cookies.csrf!)
      .expect(204);

    const count = await request(app.getHttpServer())
      .get("/me/notifications/unread-count")
      .set("Cookie", cookieHeader(cookies))
      .expect(200);
    expect(count.body.count).toBe(0);
  });

  it("does not touch other users' notifications", async () => {
    const { cookies, organizationId, userId } = await signupOrg();
    const other = await createUser(organizationId);
    await seedNotification(organizationId, userId);
    const theirs = await seedNotification(organizationId, other);

    await request(app.getHttpServer())
      .post("/me/notifications/read-all")
      .set("Cookie", cookieHeader(cookies))
      .set("X-CSRF-Token", cookies.csrf!)
      .expect(204);

    const fresh = await prisma.db.notification.findFirstOrThrow({
      where: { id: theirs.id },
    });
    expect(fresh.readAt).toBeNull();
  });
});

// ─── Pagination + filter ─────────────────────────────────────────────

describe("pagination + unreadOnly filter", () => {
  it("paginates with offset (page/pageSize)", async () => {
    const { cookies, organizationId, userId } = await signupOrg();
    await prisma.db.notification.createMany({
      data: Array.from({ length: 25 }).map((_, i) => ({
        organizationId,
        userId,
        templateId: "announcement.published",
        payload: { title: `N${i}` },
      })),
    });

    const p1 = await request(app.getHttpServer())
      .get("/me/notifications?page=1&pageSize=20")
      .set("Cookie", cookieHeader(cookies))
      .expect(200);
    expect(p1.body.items).toHaveLength(20);
    expect(p1.body.meta.total).toBe(25);
    expect(p1.body.meta.totalPages).toBe(2);
    expect(p1.body.meta.page).toBe(1);

    const p2 = await request(app.getHttpServer())
      .get("/me/notifications?page=2&pageSize=20")
      .set("Cookie", cookieHeader(cookies))
      .expect(200);
    expect(p2.body.items).toHaveLength(5);
    expect(p2.body.meta.page).toBe(2);
  });

  it("unreadOnly=true returns only unread rows", async () => {
    const { cookies, organizationId, userId } = await signupOrg();
    await seedNotification(organizationId, userId);
    await seedNotification(organizationId, userId);
    await seedNotification(organizationId, userId, { readAt: new Date() });
    await seedNotification(organizationId, userId, { readAt: new Date() });

    const res = await request(app.getHttpServer())
      .get("/me/notifications?unreadOnly=true")
      .set("Cookie", cookieHeader(cookies))
      .expect(200);
    expect(res.body.meta.total).toBe(2);
    expect(
      res.body.items.every((n: { readAt: string | null }) => n.readAt === null),
    ).toBe(true);
  });

  it("unreadOnly=false returns all rows (the string 'false' must not coerce to true)", async () => {
    const { cookies, organizationId, userId } = await signupOrg();
    await seedNotification(organizationId, userId);
    await seedNotification(organizationId, userId, { readAt: new Date() });

    const res = await request(app.getHttpServer())
      .get("/me/notifications?unreadOnly=false")
      .set("Cookie", cookieHeader(cookies))
      .expect(200);
    expect(res.body.meta.total).toBe(2);
  });
});

// ─── Invalid notification access ─────────────────────────────────────

describe("invalid notification access", () => {
  it("404 when marking a non-existent notification", async () => {
    const { cookies } = await signupOrg();
    const res = await request(app.getHttpServer())
      .post(`/me/notifications/${randomUUID()}/read`)
      .set("Cookie", cookieHeader(cookies))
      .set("X-CSRF-Token", cookies.csrf!);
    expect(res.status).toBe(404);
  });

  it("404 when marking another user's notification in the same org (stays unread)", async () => {
    const { cookies, organizationId } = await signupOrg();
    const other = await createUser(organizationId);
    const theirs = await seedNotification(organizationId, other);

    const res = await request(app.getHttpServer())
      .post(`/me/notifications/${theirs.id}/read`)
      .set("Cookie", cookieHeader(cookies))
      .set("X-CSRF-Token", cookies.csrf!);
    expect(res.status).toBe(404);

    const fresh = await prisma.db.notification.findFirstOrThrow({
      where: { id: theirs.id },
    });
    expect(fresh.readAt).toBeNull();
  });

  it("404 when marking another org's notification", async () => {
    const a = await signupOrg();
    const b = await signupOrg();
    const theirs = await seedNotification(b.organizationId, b.userId);

    const res = await request(app.getHttpServer())
      .post(`/me/notifications/${theirs.id}/read`)
      .set("Cookie", cookieHeader(a.cookies))
      .set("X-CSRF-Token", a.cookies.csrf!);
    expect(res.status).toBe(404);
  });
});

// ─── Auth requirement ────────────────────────────────────────────────

describe("auth requirement", () => {
  it("401 without a session", async () => {
    const res = await request(app.getHttpServer()).get("/me/notifications");
    expect(res.status).toBe(401);
  });
});
