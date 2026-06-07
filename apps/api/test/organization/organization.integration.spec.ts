/**
 * Integration tests for Batch 23 — Organization profile, branding, and key/value
 * settings (`A-SET-001` / `A-SET-002`).
 *
 * Covers: GET/PATCH /organization, the logo presign + confirm round-trip
 * (including the cross-tenant key-injection guard), GET/PATCH /organization/settings
 * (kv upsert + audit emission + null delete), the `organization` block on
 * GET /auth/me, multi-tenant isolation, and RBAC gating.
 *
 * StorageClient is stubbed in-memory — we never touch MinIO. This keeps the
 * suite hermetic and lets us assert on the keys/TTLs the service hands out.
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
import { OrganizationModule } from "../../src/organization/organization.module";
import { JwtAuthGuard } from "../../src/auth/guards/jwt-auth.guard";
import { CsrfGuard } from "../../src/auth/guards/csrf.guard";
import { PermissionGuard } from "../../src/rbac/permission.guard";
import { TenantInterceptor } from "../../src/tenant/tenant.interceptor";
import { GlobalExceptionFilter } from "../../src/common/http-exception.filter";
import { resetEnvCacheForTests } from "../../src/infra/config/env";
import { PrismaService } from "../../src/infra/prisma/prisma.service";
import {
  ACCESS_COOKIE,
  CSRF_COOKIE,
  REFRESH_COOKIE,
} from "../../src/auth/cookies";
import {
  STORAGE_CLIENT,
  type StorageClient,
} from "../../src/storage/storage.module";

const storageCalls: {
  puts: { bucket: string; key: string; expiry: number }[];
  gets: { bucket: string; key: string; expiry: number }[];
  removes: { bucket: string; key: string }[];
} = { puts: [], gets: [], removes: [] };

const stubStorage: StorageClient = {
  presignedPutObject: async (bucket, key, expiry) => {
    storageCalls.puts.push({ bucket, key, expiry });
    return `https://stub.local/${bucket}/${key}?put=1`;
  },
  presignedGetObject: async (bucket, key, expiry) => {
    storageCalls.gets.push({ bucket, key, expiry });
    return `https://stub.local/${bucket}/${key}?get=1`;
  },
  removeObject: async (bucket, key) => {
    storageCalls.removes.push({ bucket, key });
  },
};

@Module({
  imports: [
    PrismaModule,
    AuditModule,
    AuthModule,
    RbacModule,
    OrganizationModule,
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
let n = 0;

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

async function signupOrg(): Promise<{
  cookies: AuthCookies;
  organizationId: string;
  userId: string;
  email: string;
}> {
  n += 1;
  const email = `u${n}-${Date.now()}@test.local`;
  const res = await request(app.getHttpServer())
    .post("/auth/signup")
    .send({
      organizationName: `Org ${n}`,
      slug: `org-${n}-${Date.now()}`,
      email,
      password: "hunter22hunter22",
      fullName: "Admin User",
    });
  if (res.status !== 201) {
    throw new Error(`signup failed: ${JSON.stringify(res.body)}`);
  }
  return {
    cookies: extractCookies(res.headers["set-cookie"]),
    organizationId: res.body.organization.id as string,
    userId: res.body.user.id as string,
    email,
  };
}

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

/** Invite + accept an employee-role user; return their session cookies. */
async function createEmployeeSession(
  adminCookies: AuthCookies,
): Promise<AuthCookies> {
  n += 1;
  const email = `emp-${n}-${Date.now()}@test.local`;
  const inv = await authedPost("/invites", adminCookies, {
    email,
    roleKey: "employee",
  });
  if (inv.status !== 201) {
    throw new Error(`invite failed: ${JSON.stringify(inv.body)}`);
  }
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

/** Invite + accept an hr_admin-role user; return their session cookies. */
async function createHrAdminSession(
  adminCookies: AuthCookies,
): Promise<AuthCookies> {
  n += 1;
  const email = `hr-${n}-${Date.now()}@test.local`;
  const inv = await authedPost("/invites", adminCookies, {
    email,
    roleKey: "hr_admin",
  });
  if (inv.status !== 201) {
    throw new Error(`invite failed: ${JSON.stringify(inv.body)}`);
  }
  const token = (inv.body.inviteUrl as string).split("token=")[1];
  const accepted = await request(app.getHttpServer())
    .post("/auth/accept-invite")
    .send({
      token,
      password: "hunter22hunter22",
      firstName: "HR",
      lastName: "Admin",
    });
  return extractCookies(accepted.headers["set-cookie"]);
}

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
  storageCalls.puts.length = 0;
  storageCalls.gets.length = 0;
  storageCalls.removes.length = 0;
  await prisma.db.auditLog.deleteMany();
  await prisma.db.orgSetting.deleteMany();
  await prisma.db.invite.deleteMany();
  await prisma.db.userRole.deleteMany();
  await prisma.db.rolePermission.deleteMany();
  await prisma.db.role.deleteMany();
  await prisma.db.user.deleteMany();
  await prisma.db.organization.deleteMany();
});

// ─── GET /organization ───────────────────────────────────────────────────────

describe("GET /organization", () => {
  it("returns the caller's org profile with a null logoUrl on a fresh org", async () => {
    const { cookies, organizationId } = await signupOrg();
    const res = await authedGet("/organization", cookies);
    expect(res.status).toBe(200);
    expect(res.body.id).toBe(organizationId);
    expect(res.body.logoUrl).toBeNull();
    // Defaults that signup seeds on the Organization row.
    expect(res.body.primaryColor).toBe("#0F172A");
    expect(res.body.timezone).toBe("Etc/UTC");
    expect(res.body.locale).toBe("en-US");
    expect(res.body.currency).toBe("USD");
    expect(res.body.weekStart).toBe(1);
    // Sensitive admin-only fields that v0.23 surfaces but doesn't let users edit.
    expect(res.body).toHaveProperty("plan");
    expect(res.body).toHaveProperty("status");
  });

  it("returns 403 to a user without org.settings.read (employee role)", async () => {
    const { cookies: admin } = await signupOrg();
    const emp = await createEmployeeSession(admin);
    const res = await authedGet("/organization", emp);
    expect(res.status).toBe(403);
  });
});

// ─── PATCH /organization ─────────────────────────────────────────────────────

describe("PATCH /organization", () => {
  it("updates allowed profile fields and records an audit entry", async () => {
    const { cookies, organizationId, userId } = await signupOrg();
    const res = await authedPatch("/organization", cookies, {
      name: "Acme Holdings",
      legalName: "Acme Holdings, Inc.",
      domain: "acme.test",
      primaryColor: "#1A2B3C",
      timezone: "America/New_York",
      locale: "en-GB",
      currency: "eur", // lowercase — service should uppercase
      weekStart: 0,
      billingEmail: "ops@acme.test",
    });
    expect(res.status).toBe(200);
    expect(res.body.name).toBe("Acme Holdings");
    expect(res.body.currency).toBe("EUR");
    expect(res.body.weekStart).toBe(0);

    const audits = await prisma.db.auditLog.findMany({
      where: { organizationId, action: "organization.update" },
    });
    expect(audits).toHaveLength(1);
    expect(audits[0]!.actorUserId).toBe(userId);
    expect(audits[0]!.resourceType).toBe("organization");
    expect(audits[0]!.resourceId).toBe(organizationId);
  });

  it("rejects an invalid hex colour", async () => {
    const { cookies } = await signupOrg();
    const res = await authedPatch("/organization", cookies, {
      primaryColor: "blue",
    });
    expect(res.status).toBe(400);
  });

  it("rejects an unknown IANA timezone", async () => {
    const { cookies } = await signupOrg();
    const res = await authedPatch("/organization", cookies, {
      timezone: "Mars/Olympus_Mons",
    });
    expect(res.status).toBe(400);
  });

  it("rejects a non-ISO-4217 currency", async () => {
    const { cookies } = await signupOrg();
    const res = await authedPatch("/organization", cookies, {
      currency: "XXX",
    });
    expect(res.status).toBe(400);
  });

  it("rejects unknown keys via the .strict() DTO (e.g. attempting to change slug or plan)", async () => {
    const { cookies } = await signupOrg();
    const res = await authedPatch("/organization", cookies, {
      slug: "stolen-slug",
    });
    expect(res.status).toBe(400);
    const res2 = await authedPatch("/organization", cookies, {
      plan: "growth",
    });
    expect(res2.status).toBe(400);
  });

  it("returns 403 to a user without org.settings.write (employee role)", async () => {
    const { cookies: admin } = await signupOrg();
    const emp = await createEmployeeSession(admin);
    const res = await authedPatch("/organization", emp, { name: "Sneaky" });
    expect(res.status).toBe(403);
  });

  it("allows an hr_admin to read and edit the organization profile", async () => {
    const { cookies: admin } = await signupOrg();
    const hr = await createHrAdminSession(admin);
    const read = await authedGet("/organization", hr);
    expect(read.status).toBe(200);
    const write = await authedPatch("/organization", hr, {
      name: "Acme by HR",
      billingEmail: "hr-ops@acme.test",
    });
    expect(write.status).toBe(200);
    expect(write.body.name).toBe("Acme by HR");
    expect(write.body.billingEmail).toBe("hr-ops@acme.test");
  });
});

// ─── POST /organization/logo/presign-upload + POST /organization/logo ────────

describe("Logo upload round-trip", () => {
  it("presigns under uploads/<org>/logo/ and confirm writes the key to the row", async () => {
    const { cookies, organizationId } = await signupOrg();

    const presign = await authedPost(
      "/organization/logo/presign-upload",
      cookies,
      {
        fileName: "Logo.png",
        mimeType: "image/png",
        sizeBytes: 12_345,
      },
    );
    expect(presign.status).toBe(200);
    expect(presign.body.url).toBe(
      `https://stub.local/staffly-test/${presign.body.key}?put=1`,
    );
    expect(presign.body.key.startsWith(`uploads/${organizationId}/logo/`)).toBe(
      true,
    );
    expect(presign.body.expiresIn).toBe(900);
    expect(storageCalls.puts).toHaveLength(1);

    const confirm = await authedPost("/organization/logo", cookies, {
      key: presign.body.key,
    });
    expect(confirm.status).toBe(201);
    // After confirm, logoUrl is presented as a re-presigned GET URL (never the key).
    expect(confirm.body.logoUrl).toBe(
      `https://stub.local/staffly-test/${presign.body.key}?get=1`,
    );
    const row = await prisma.db.organization.findUnique({
      where: { id: organizationId },
      select: { logoUrl: true },
    });
    expect(row?.logoUrl).toBe(presign.body.key);

    const audits = await prisma.db.auditLog.findMany({
      where: { organizationId, action: "organization.logo.update" },
    });
    expect(audits).toHaveLength(1);
  });

  it("rejects an oversized logo at the DTO layer (>2 MB)", async () => {
    const { cookies } = await signupOrg();
    const res = await authedPost("/organization/logo/presign-upload", cookies, {
      fileName: "huge.png",
      mimeType: "image/png",
      sizeBytes: 3 * 1024 * 1024,
    });
    expect(res.status).toBe(400);
  });

  it("rejects a disallowed mime type", async () => {
    const { cookies } = await signupOrg();
    const res = await authedPost("/organization/logo/presign-upload", cookies, {
      fileName: "logo.tiff",
      mimeType: "image/tiff",
      sizeBytes: 1000,
    });
    expect(res.status).toBe(400);
  });

  it("refuses confirm with a key from a different tenant", async () => {
    const a = await signupOrg();
    const b = await signupOrg();
    const presign = await authedPost(
      "/organization/logo/presign-upload",
      b.cookies,
      {
        fileName: "logo.png",
        mimeType: "image/png",
        sizeBytes: 1000,
      },
    );
    expect(presign.status).toBe(200);
    // Org A tries to point its logoUrl at Org B's freshly-presigned key.
    const res = await authedPost("/organization/logo", a.cookies, {
      key: presign.body.key,
    });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("organization.logo_key_invalid");
  });
});

// ─── GET /organization/settings ──────────────────────────────────────────────

describe("GET /organization/settings", () => {
  it("returns {} for a freshly-signed-up org", async () => {
    const { cookies } = await signupOrg();
    const res = await authedGet("/organization/settings", cookies);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({});
  });
});

// ─── PATCH /organization/settings ────────────────────────────────────────────

describe("PATCH /organization/settings", () => {
  it("upserts a batch of keys and records a single audit entry", async () => {
    const { cookies, organizationId } = await signupOrg();
    const res = await authedPatch("/organization/settings", cookies, {
      "attendance.geofence_radius_m": 250,
      "leave.default_policy": "standard",
    });
    expect(res.status).toBe(200);
    expect(res.body["attendance.geofence_radius_m"]).toBe(250);
    expect(res.body["leave.default_policy"]).toBe("standard");

    const rows = await prisma.db.orgSetting.findMany({
      where: { organizationId },
    });
    expect(rows).toHaveLength(2);

    const audits = await prisma.db.auditLog.findMany({
      where: { organizationId, action: "organization.settings.update" },
    });
    expect(audits).toHaveLength(1);
  });

  it("updates an existing key in place rather than inserting a duplicate", async () => {
    const { cookies, organizationId } = await signupOrg();
    await authedPatch("/organization/settings", cookies, {
      "ui.density": "comfy",
    });
    const res = await authedPatch("/organization/settings", cookies, {
      "ui.density": "compact",
    });
    expect(res.status).toBe(200);
    expect(res.body["ui.density"]).toBe("compact");
    const rows = await prisma.db.orgSetting.findMany({
      where: { organizationId },
    });
    expect(rows).toHaveLength(1);
  });

  it("persists an explicit null value (JSON null, not missing)", async () => {
    const { cookies } = await signupOrg();
    await authedPatch("/organization/settings", cookies, {
      "ui.theme": "dark",
    });
    const res = await authedPatch("/organization/settings", cookies, {
      "ui.theme": null,
    });
    expect(res.status).toBe(200);
    expect(res.body["ui.theme"]).toBeNull();
  });

  it("rejects an invalid key shape (must be dotted lowercase)", async () => {
    const { cookies } = await signupOrg();
    const res = await authedPatch("/organization/settings", cookies, {
      "Bad-Key": 1,
    });
    expect(res.status).toBe(400);
  });

  it("rejects an empty patch", async () => {
    const { cookies } = await signupOrg();
    const res = await authedPatch("/organization/settings", cookies, {});
    expect(res.status).toBe(400);
  });
});

// ─── Multi-tenant isolation ──────────────────────────────────────────────────

describe("multi-tenant isolation", () => {
  it("each org sees only its own profile and settings", async () => {
    const a = await signupOrg();
    const b = await signupOrg();
    await authedPatch("/organization", a.cookies, { name: "Org-A Renamed" });
    await authedPatch("/organization/settings", a.cookies, {
      "policy.foo": "a-value",
    });

    const profileA = await authedGet("/organization", a.cookies);
    expect(profileA.body.id).toBe(a.organizationId);
    expect(profileA.body.name).toBe("Org-A Renamed");

    const profileB = await authedGet("/organization", b.cookies);
    expect(profileB.body.id).toBe(b.organizationId);
    expect(profileB.body.name).not.toBe("Org-A Renamed");

    const settingsB = await authedGet("/organization/settings", b.cookies);
    expect(settingsB.body).toEqual({});
  });
});

// ─── GET /auth/me includes organization ──────────────────────────────────────

describe("GET /auth/me — organization block", () => {
  it("returns a populated organization block with logoUrl re-presigned (or null)", async () => {
    const { cookies, organizationId } = await signupOrg();
    const me = await authedGet("/auth/me", cookies);
    expect(me.status).toBe(200);
    expect(me.body.organization.id).toBe(organizationId);
    expect(me.body.organization).toHaveProperty("slug");
    expect(me.body.organization).toHaveProperty("name");
    expect(me.body.organization.primaryColor).toBe("#0F172A");
    expect(me.body.organization.logoUrl).toBeNull();

    // After confirming a logo, /auth/me re-presigns it to a GET URL.
    const presign = await authedPost(
      "/organization/logo/presign-upload",
      cookies,
      { fileName: "logo.png", mimeType: "image/png", sizeBytes: 100 },
    );
    await authedPost("/organization/logo", cookies, { key: presign.body.key });
    const me2 = await authedGet("/auth/me", cookies);
    expect(me2.body.organization.logoUrl).toContain("?get=1");
  });
});
