/**
 * Integration tests for Batch 8 — Documents & Compliance.
 * Covers: categories CRUD, document CRUD, version history (replace),
 * presign upload/download URLs (stubbed StorageClient), expiry filters,
 * mandatory ack tracking, employee feed, RBAC, tenant isolation.
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
import { DocumentsModule } from "../../src/documents/documents.module";
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

/**
 * Deterministic in-memory storage client. Lets us assert that the right
 * keys / TTLs are presented without involving MinIO.
 */
const storageCalls: {
  puts: { bucket: string; key: string; expiry: number }[];
  gets: { bucket: string; key: string; expiry: number; params?: unknown }[];
  removes: { bucket: string; key: string }[];
} = { puts: [], gets: [], removes: [] };

const stubStorage: StorageClient = {
  presignedPutObject: async (bucket, key, expiry) => {
    storageCalls.puts.push({ bucket, key, expiry });
    return `https://stub.local/${bucket}/${key}?put=1`;
  },
  presignedGetObject: async (bucket, key, expiry, params) => {
    storageCalls.gets.push({ bucket, key, expiry, params });
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
    OrgStructureModule,
    EmployeesModule,
    DocumentsModule,
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

async function createCategory(
  cookies: CookieBag,
  body: Record<string, unknown>,
): Promise<{ id: string; isPersonal: boolean }> {
  const res = await request(app.getHttpServer())
    .post("/documents/categories")
    .set("Cookie", cookieHeader(cookies))
    .set("X-CSRF-Token", cookies.csrf!)
    .send(body)
    .expect(201);
  return { id: res.body.id, isPersonal: res.body.isPersonal };
}

function fileMeta(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    storageKey: `uploads/test/document/${Math.random()}/file.pdf`,
    fileName: "policy.pdf",
    mimeType: "application/pdf",
    sizeBytes: 1024,
    ...overrides,
  };
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
  await prisma.db.documentAcknowledgement.deleteMany();
  await prisma.db.documentAudience.deleteMany();
  // Versions must be released from the FK on documents.current_version_id
  // before the rows themselves can be removed.
  await prisma.db.document.updateMany({
    data: { currentVersionId: null },
  });
  await prisma.db.documentVersion.deleteMany();
  await prisma.db.document.deleteMany();
  await prisma.db.documentCategory.deleteMany();
  await prisma.db.auditLog.deleteMany();
  await prisma.db.employee.deleteMany();
  await prisma.db.refreshToken.deleteMany();
  await prisma.db.userRole.deleteMany();
  await prisma.db.rolePermission.deleteMany();
  await prisma.db.role.deleteMany();
  await prisma.db.user.deleteMany();
  await prisma.db.organization.deleteMany();
});

const ALL_AUDIENCE = [{ type: "all_employees" as const }];

// ─── Categories CRUD ─────────────────────────────────────────────────

describe("document categories CRUD", () => {
  it("create + read + update + delete", async () => {
    const { cookies } = await signupOrg();
    const created = await request(app.getHttpServer())
      .post("/documents/categories")
      .set("Cookie", cookieHeader(cookies))
      .set("X-CSRF-Token", cookies.csrf!)
      .send({
        name: "Policies",
        code: "POL",
        color: "#0F172A",
        description: "Company-wide policies",
      })
      .expect(201);
    expect(created.body.isActive).toBe(true);
    expect(created.body.isPersonal).toBe(false);
    expect(created.body.color).toBe("#0F172A");

    const list = await request(app.getHttpServer())
      .get("/documents/categories")
      .set("Cookie", cookieHeader(cookies))
      .expect(200);
    expect(list.body.meta.total).toBe(1);

    const patched = await request(app.getHttpServer())
      .patch(`/documents/categories/${created.body.id}`)
      .set("Cookie", cookieHeader(cookies))
      .set("X-CSRF-Token", cookies.csrf!)
      .send({ isActive: false })
      .expect(200);
    expect(patched.body.isActive).toBe(false);

    const del = await request(app.getHttpServer())
      .delete(`/documents/categories/${created.body.id}`)
      .set("Cookie", cookieHeader(cookies))
      .set("X-CSRF-Token", cookies.csrf!);
    expect(del.status).toBe(204);
  });

  it("refuses delete when category has documents attached", async () => {
    const { cookies } = await signupOrg();
    const cat = await createCategory(cookies, { name: "X" });
    await request(app.getHttpServer())
      .post("/documents")
      .set("Cookie", cookieHeader(cookies))
      .set("X-CSRF-Token", cookies.csrf!)
      .send({
        categoryId: cat.id,
        title: "D",
        file: fileMeta(),
        audiences: ALL_AUDIENCE,
      })
      .expect(201);
    const res = await request(app.getHttpServer())
      .delete(`/documents/categories/${cat.id}`)
      .set("Cookie", cookieHeader(cookies))
      .set("X-CSRF-Token", cookies.csrf!);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("document.category.in_use");
  });

  it("rejects duplicate name (409) and bad color (400)", async () => {
    const { cookies } = await signupOrg();
    await createCategory(cookies, { name: "Dup" });
    const dup = await request(app.getHttpServer())
      .post("/documents/categories")
      .set("Cookie", cookieHeader(cookies))
      .set("X-CSRF-Token", cookies.csrf!)
      .send({ name: "Dup" });
    expect(dup.status).toBe(409);

    const badColor = await request(app.getHttpServer())
      .post("/documents/categories")
      .set("Cookie", cookieHeader(cookies))
      .set("X-CSRF-Token", cookies.csrf!)
      .send({ name: "Z", color: "notahex" });
    expect(badColor.status).toBe(400);
  });
});

// ─── Presign upload ──────────────────────────────────────────────────

describe("presign upload", () => {
  it("returns a stub URL, key under uploads/<org>/document/<token>/<filename>", async () => {
    const { cookies, organizationId } = await signupOrg();
    const res = await request(app.getHttpServer())
      .post("/documents/files/presign-upload")
      .set("Cookie", cookieHeader(cookies))
      .set("X-CSRF-Token", cookies.csrf!)
      .send({
        fileName: "Code of Conduct.pdf",
        mimeType: "application/pdf",
        sizeBytes: 12345,
      })
      .expect(200);
    expect(res.body.url).toMatch(/^https:\/\/stub\.local\//);
    expect(res.body.key).toMatch(
      new RegExp(
        `^uploads/${organizationId}/document/[^/]+/Code_of_Conduct\\.pdf$`,
      ),
    );
    expect(res.body.expiresIn).toBe(900);
    expect(storageCalls.puts).toHaveLength(1);
  });

  it("validates file size (rejects > 100MB)", async () => {
    const { cookies } = await signupOrg();
    const res = await request(app.getHttpServer())
      .post("/documents/files/presign-upload")
      .set("Cookie", cookieHeader(cookies))
      .set("X-CSRF-Token", cookies.csrf!)
      .send({
        fileName: "huge.pdf",
        mimeType: "application/pdf",
        sizeBytes: 101 * 1024 * 1024,
      });
    expect(res.status).toBe(400);
  });
});

// ─── Documents CRUD + version history ────────────────────────────────

describe("documents CRUD + versions", () => {
  it("creates draft, publishes, archives — full lifecycle", async () => {
    const { cookies } = await signupOrg();
    const cat = await createCategory(cookies, { name: "Policies" });

    const create = await request(app.getHttpServer())
      .post("/documents")
      .set("Cookie", cookieHeader(cookies))
      .set("X-CSRF-Token", cookies.csrf!)
      .send({
        categoryId: cat.id,
        title: "Code of Conduct",
        file: fileMeta(),
        audiences: ALL_AUDIENCE,
        isRequired: true,
      })
      .expect(201);
    expect(create.body.publishedAt).toBeNull();
    expect(create.body.versions).toHaveLength(1);
    expect(create.body.versions[0].versionNo).toBe(1);
    expect(create.body.currentVersion.versionNo).toBe(1);

    const pub = await request(app.getHttpServer())
      .post(`/documents/${create.body.id}/publish`)
      .set("Cookie", cookieHeader(cookies))
      .set("X-CSRF-Token", cookies.csrf!)
      .expect(201);
    expect(pub.body.publishedAt).toBeTruthy();

    const arch = await request(app.getHttpServer())
      .post(`/documents/${create.body.id}/archive`)
      .set("Cookie", cookieHeader(cookies))
      .set("X-CSRF-Token", cookies.csrf!)
      .expect(201);
    expect(arch.body.archivedAt).toBeTruthy();
  });

  it("publishNow=true creates and publishes in one call", async () => {
    const { cookies } = await signupOrg();
    const cat = await createCategory(cookies, { name: "P" });
    const res = await request(app.getHttpServer())
      .post("/documents")
      .set("Cookie", cookieHeader(cookies))
      .set("X-CSRF-Token", cookies.csrf!)
      .send({
        categoryId: cat.id,
        title: "T",
        file: fileMeta(),
        audiences: ALL_AUDIENCE,
        publishNow: true,
      })
      .expect(201);
    expect(res.body.publishedAt).toBeTruthy();
  });

  it("rejects creating a distributed doc with no audiences", async () => {
    const { cookies } = await signupOrg();
    const cat = await createCategory(cookies, { name: "P" });
    const res = await request(app.getHttpServer())
      .post("/documents")
      .set("Cookie", cookieHeader(cookies))
      .set("X-CSRF-Token", cookies.csrf!)
      .send({
        categoryId: cat.id,
        title: "T",
        file: fileMeta(),
      });
    expect(res.status).toBe(400);
  });

  it("personal doc requires subjectEmployeeId and matches personal category", async () => {
    const { cookies } = await signupOrg();
    const personal = await createCategory(cookies, {
      name: "Personal",
      isPersonal: true,
    });
    const distributed = await createCategory(cookies, { name: "Public" });
    const empId = await createOrphanEmployee(cookies);

    // Missing subject
    const miss = await request(app.getHttpServer())
      .post("/documents")
      .set("Cookie", cookieHeader(cookies))
      .set("X-CSRF-Token", cookies.csrf!)
      .send({
        categoryId: personal.id,
        title: "PAN",
        file: fileMeta(),
        isPersonal: true,
      });
    expect(miss.status).toBe(400);

    // Mismatched category
    const mismatch = await request(app.getHttpServer())
      .post("/documents")
      .set("Cookie", cookieHeader(cookies))
      .set("X-CSRF-Token", cookies.csrf!)
      .send({
        categoryId: distributed.id,
        title: "PAN",
        file: fileMeta(),
        isPersonal: true,
        subjectEmployeeId: empId,
      });
    expect(mismatch.status).toBe(400);

    // Happy path
    const ok = await request(app.getHttpServer())
      .post("/documents")
      .set("Cookie", cookieHeader(cookies))
      .set("X-CSRF-Token", cookies.csrf!)
      .send({
        categoryId: personal.id,
        title: "PAN",
        file: fileMeta(),
        isPersonal: true,
        subjectEmployeeId: empId,
      })
      .expect(201);
    expect(ok.body.isPersonal).toBe(true);
    expect(ok.body.subjectEmployeeId).toBe(empId);
  });

  it("replace bumps version, retains history, swaps current pointer", async () => {
    const { cookies } = await signupOrg();
    const cat = await createCategory(cookies, { name: "P" });
    const doc = await request(app.getHttpServer())
      .post("/documents")
      .set("Cookie", cookieHeader(cookies))
      .set("X-CSRF-Token", cookies.csrf!)
      .send({
        categoryId: cat.id,
        title: "T",
        file: fileMeta({ fileName: "v1.pdf" }),
        audiences: ALL_AUDIENCE,
      })
      .expect(201);
    expect(doc.body.currentVersion.fileName).toBe("v1.pdf");

    const replaced = await request(app.getHttpServer())
      .post(`/documents/${doc.body.id}/replace`)
      .set("Cookie", cookieHeader(cookies))
      .set("X-CSRF-Token", cookies.csrf!)
      .send({ file: fileMeta({ fileName: "v2.pdf" }) })
      .expect(201);
    expect(replaced.body.currentVersion.versionNo).toBe(2);
    expect(replaced.body.currentVersion.fileName).toBe("v2.pdf");
    expect(replaced.body.versions).toHaveLength(2);

    const replaced2 = await request(app.getHttpServer())
      .post(`/documents/${doc.body.id}/replace`)
      .set("Cookie", cookieHeader(cookies))
      .set("X-CSRF-Token", cookies.csrf!)
      .send({ file: fileMeta({ fileName: "v3.pdf" }) })
      .expect(201);
    expect(replaced2.body.currentVersion.versionNo).toBe(3);
    expect(replaced2.body.versions).toHaveLength(3);
  });

  it("update on published doc locks isRequired and audiences", async () => {
    const { cookies } = await signupOrg();
    const cat = await createCategory(cookies, { name: "P" });
    const create = await request(app.getHttpServer())
      .post("/documents")
      .set("Cookie", cookieHeader(cookies))
      .set("X-CSRF-Token", cookies.csrf!)
      .send({
        categoryId: cat.id,
        title: "T",
        file: fileMeta(),
        audiences: ALL_AUDIENCE,
        publishNow: true,
      })
      .expect(201);

    // Title editable on a published doc.
    const okTitle = await request(app.getHttpServer())
      .patch(`/documents/${create.body.id}`)
      .set("Cookie", cookieHeader(cookies))
      .set("X-CSRF-Token", cookies.csrf!)
      .send({ title: "T2" });
    expect(okTitle.status).toBe(200);

    // isRequired NOT editable on a published doc.
    const blocked = await request(app.getHttpServer())
      .patch(`/documents/${create.body.id}`)
      .set("Cookie", cookieHeader(cookies))
      .set("X-CSRF-Token", cookies.csrf!)
      .send({ isRequired: false });
    expect(blocked.status).toBe(400);
    expect(blocked.body.error.code).toBe("document.published_locked_fields");
  });

  it("soft delete excludes from list", async () => {
    const { cookies } = await signupOrg();
    const cat = await createCategory(cookies, { name: "P" });
    const create = await request(app.getHttpServer())
      .post("/documents")
      .set("Cookie", cookieHeader(cookies))
      .set("X-CSRF-Token", cookies.csrf!)
      .send({
        categoryId: cat.id,
        title: "T",
        file: fileMeta(),
        audiences: ALL_AUDIENCE,
      })
      .expect(201);
    await request(app.getHttpServer())
      .delete(`/documents/${create.body.id}`)
      .set("Cookie", cookieHeader(cookies))
      .set("X-CSRF-Token", cookies.csrf!)
      .expect(204);
    const list = await request(app.getHttpServer())
      .get("/documents")
      .set("Cookie", cookieHeader(cookies))
      .expect(200);
    expect(list.body.meta.total).toBe(0);
  });
});

// ─── Download URLs ───────────────────────────────────────────────────

describe("download URLs", () => {
  it("returns a presigned GET URL for the current version", async () => {
    const { cookies } = await signupOrg();
    const cat = await createCategory(cookies, { name: "P" });
    const create = await request(app.getHttpServer())
      .post("/documents")
      .set("Cookie", cookieHeader(cookies))
      .set("X-CSRF-Token", cookies.csrf!)
      .send({
        categoryId: cat.id,
        title: "T",
        file: fileMeta({ fileName: "current.pdf" }),
        audiences: ALL_AUDIENCE,
      })
      .expect(201);
    const url = await request(app.getHttpServer())
      .get(`/documents/${create.body.id}/download-url`)
      .set("Cookie", cookieHeader(cookies))
      .expect(200);
    expect(url.body.url).toMatch(/get=1/);
    expect(url.body.fileName).toBe("current.pdf");
    expect(storageCalls.gets[0]?.params).toBeTruthy();
  });

  it("can fetch a specific past version", async () => {
    const { cookies } = await signupOrg();
    const cat = await createCategory(cookies, { name: "P" });
    const doc = await request(app.getHttpServer())
      .post("/documents")
      .set("Cookie", cookieHeader(cookies))
      .set("X-CSRF-Token", cookies.csrf!)
      .send({
        categoryId: cat.id,
        title: "T",
        file: fileMeta({ fileName: "v1.pdf" }),
        audiences: ALL_AUDIENCE,
      })
      .expect(201);
    await request(app.getHttpServer())
      .post(`/documents/${doc.body.id}/replace`)
      .set("Cookie", cookieHeader(cookies))
      .set("X-CSRF-Token", cookies.csrf!)
      .send({ file: fileMeta({ fileName: "v2.pdf" }) })
      .expect(201);
    const v1url = await request(app.getHttpServer())
      .get(`/documents/${doc.body.id}/versions/1/download-url`)
      .set("Cookie", cookieHeader(cookies))
      .expect(200);
    expect(v1url.body.fileName).toBe("v1.pdf");
    const missing = await request(app.getHttpServer())
      .get(`/documents/${doc.body.id}/versions/99/download-url`)
      .set("Cookie", cookieHeader(cookies));
    expect(missing.status).toBe(404);
  });
});

// ─── Expiry filter ───────────────────────────────────────────────────

describe("expiry filter", () => {
  it("expiringInDays returns docs expiring within N days only", async () => {
    const { cookies } = await signupOrg();
    const cat = await createCategory(cookies, { name: "P" });

    const soon = new Date(Date.now() + 5 * 86400000).toISOString();
    const later = new Date(Date.now() + 60 * 86400000).toISOString();

    await request(app.getHttpServer())
      .post("/documents")
      .set("Cookie", cookieHeader(cookies))
      .set("X-CSRF-Token", cookies.csrf!)
      .send({
        categoryId: cat.id,
        title: "Soon",
        file: fileMeta(),
        audiences: ALL_AUDIENCE,
        expiresAt: soon,
      })
      .expect(201);
    await request(app.getHttpServer())
      .post("/documents")
      .set("Cookie", cookieHeader(cookies))
      .set("X-CSRF-Token", cookies.csrf!)
      .send({
        categoryId: cat.id,
        title: "Later",
        file: fileMeta(),
        audiences: ALL_AUDIENCE,
        expiresAt: later,
      })
      .expect(201);
    await request(app.getHttpServer())
      .post("/documents")
      .set("Cookie", cookieHeader(cookies))
      .set("X-CSRF-Token", cookies.csrf!)
      .send({
        categoryId: cat.id,
        title: "NoExp",
        file: fileMeta(),
        audiences: ALL_AUDIENCE,
      })
      .expect(201);

    const within = await request(app.getHttpServer())
      .get("/documents?expiringInDays=14")
      .set("Cookie", cookieHeader(cookies))
      .expect(200);
    expect(within.body.meta.total).toBe(1);
    expect(within.body.items[0].title).toBe("Soon");
  });
});

// ─── Mandatory ack tracking ──────────────────────────────────────────

describe("mandatory ack tracking", () => {
  it("acknowledge is idempotent; pending list shrinks accordingly", async () => {
    const { cookies, userId } = await signupOrg();
    await createEmployeeForUser(cookies, userId);
    const other = await createOrphanEmployee(cookies);

    const cat = await createCategory(cookies, { name: "P" });
    const doc = await request(app.getHttpServer())
      .post("/documents")
      .set("Cookie", cookieHeader(cookies))
      .set("X-CSRF-Token", cookies.csrf!)
      .send({
        categoryId: cat.id,
        title: "Must read",
        file: fileMeta(),
        audiences: ALL_AUDIENCE,
        isRequired: true,
        publishNow: true,
      })
      .expect(201);

    const pendingBefore = await request(app.getHttpServer())
      .get(`/documents/${doc.body.id}/pending`)
      .set("Cookie", cookieHeader(cookies))
      .expect(200);
    expect(pendingBefore.body.pendingEmployeeIds.sort()).toEqual(
      [other]
        .concat([
          pendingBefore.body.pendingEmployeeIds.find(
            (id: string) => id !== other,
          ),
        ])
        .sort(),
    );
    expect(pendingBefore.body.pendingEmployeeIds).toHaveLength(2);

    // First ack
    const a = await request(app.getHttpServer())
      .post(`/documents/${doc.body.id}/acknowledge`)
      .set("Cookie", cookieHeader(cookies))
      .set("X-CSRF-Token", cookies.csrf!)
      .expect(201);
    // Second ack returns same row, no new audit
    const b = await request(app.getHttpServer())
      .post(`/documents/${doc.body.id}/acknowledge`)
      .set("Cookie", cookieHeader(cookies))
      .set("X-CSRF-Token", cookies.csrf!)
      .expect(201);
    expect(a.body.id).toBe(b.body.id);

    const ackCount = await prisma.db.documentAcknowledgement.count({
      where: { documentId: doc.body.id },
    });
    expect(ackCount).toBe(1);

    const pendingAfter = await request(app.getHttpServer())
      .get(`/documents/${doc.body.id}/pending`)
      .set("Cookie", cookieHeader(cookies))
      .expect(200);
    expect(pendingAfter.body.pendingEmployeeIds).toEqual([other]);
  });

  it("acknowledge fails if not in audience (403)", async () => {
    const { cookies, userId } = await signupOrg();
    const dept = await request(app.getHttpServer())
      .post("/departments")
      .set("Cookie", cookieHeader(cookies))
      .set("X-CSRF-Token", cookies.csrf!)
      .send({ name: "X" })
      .expect(201);
    await createEmployeeForUser(cookies, userId); // Not in dept X
    const cat = await createCategory(cookies, { name: "P" });
    const doc = await request(app.getHttpServer())
      .post("/documents")
      .set("Cookie", cookieHeader(cookies))
      .set("X-CSRF-Token", cookies.csrf!)
      .send({
        categoryId: cat.id,
        title: "T",
        file: fileMeta(),
        audiences: [{ type: "department", departmentId: dept.body.id }],
        publishNow: true,
      })
      .expect(201);

    const ack = await request(app.getHttpServer())
      .post(`/documents/${doc.body.id}/acknowledge`)
      .set("Cookie", cookieHeader(cookies))
      .set("X-CSRF-Token", cookies.csrf!);
    expect(ack.status).toBe(403);
    expect(ack.body.error.code).toBe("document.not_in_audience");
  });

  it("acknowledge fails before publish (409)", async () => {
    const { cookies, userId } = await signupOrg();
    await createEmployeeForUser(cookies, userId);
    const cat = await createCategory(cookies, { name: "P" });
    const doc = await request(app.getHttpServer())
      .post("/documents")
      .set("Cookie", cookieHeader(cookies))
      .set("X-CSRF-Token", cookies.csrf!)
      .send({
        categoryId: cat.id,
        title: "Draft",
        file: fileMeta(),
        audiences: ALL_AUDIENCE,
      })
      .expect(201);
    const res = await request(app.getHttpServer())
      .post(`/documents/${doc.body.id}/acknowledge`)
      .set("Cookie", cookieHeader(cookies))
      .set("X-CSRF-Token", cookies.csrf!);
    expect(res.status).toBe(409);
  });
});

// ─── Employee feed ───────────────────────────────────────────────────

describe("employee feed (/me/documents)", () => {
  it("returns published, in-audience documents and personal docs targeting self", async () => {
    const { cookies, userId } = await signupOrg();
    const empId = await createEmployeeForUser(cookies, userId);
    const cat = await createCategory(cookies, { name: "P" });
    const personalCat = await createCategory(cookies, {
      name: "Personal",
      isPersonal: true,
    });

    // Distributed and published → should appear.
    const a = await request(app.getHttpServer())
      .post("/documents")
      .set("Cookie", cookieHeader(cookies))
      .set("X-CSRF-Token", cookies.csrf!)
      .send({
        categoryId: cat.id,
        title: "Mine",
        file: fileMeta(),
        audiences: ALL_AUDIENCE,
        publishNow: true,
      })
      .expect(201);

    // Draft → should NOT appear.
    await request(app.getHttpServer())
      .post("/documents")
      .set("Cookie", cookieHeader(cookies))
      .set("X-CSRF-Token", cookies.csrf!)
      .send({
        categoryId: cat.id,
        title: "Draft",
        file: fileMeta(),
        audiences: ALL_AUDIENCE,
      })
      .expect(201);

    // Personal targeting me → should appear.
    const p = await request(app.getHttpServer())
      .post("/documents")
      .set("Cookie", cookieHeader(cookies))
      .set("X-CSRF-Token", cookies.csrf!)
      .send({
        categoryId: personalCat.id,
        title: "PAN",
        file: fileMeta(),
        isPersonal: true,
        subjectEmployeeId: empId,
        publishNow: true,
      })
      .expect(201);

    // Personal targeting someone else → should NOT appear.
    const other = await createOrphanEmployee(cookies);
    await request(app.getHttpServer())
      .post("/documents")
      .set("Cookie", cookieHeader(cookies))
      .set("X-CSRF-Token", cookies.csrf!)
      .send({
        categoryId: personalCat.id,
        title: "OtherPAN",
        file: fileMeta(),
        isPersonal: true,
        subjectEmployeeId: other,
        publishNow: true,
      })
      .expect(201);

    const feed = await request(app.getHttpServer())
      .get("/me/documents")
      .set("Cookie", cookieHeader(cookies))
      .expect(200);
    expect(feed.body.meta.total).toBe(2);
    const titles = feed.body.items
      .map((i: { title: string }) => i.title)
      .sort();
    expect(titles).toEqual(["Mine", "PAN"]);
    expect(a.body.id).toBeTruthy();
    expect(p.body.id).toBeTruthy();
  });

  it("unacknowledgedOnly filters to required + un-acked", async () => {
    const { cookies, userId } = await signupOrg();
    await createEmployeeForUser(cookies, userId);
    const cat = await createCategory(cookies, { name: "P" });

    const must = await request(app.getHttpServer())
      .post("/documents")
      .set("Cookie", cookieHeader(cookies))
      .set("X-CSRF-Token", cookies.csrf!)
      .send({
        categoryId: cat.id,
        title: "Must",
        file: fileMeta(),
        audiences: ALL_AUDIENCE,
        isRequired: true,
        publishNow: true,
      })
      .expect(201);

    await request(app.getHttpServer())
      .post("/documents")
      .set("Cookie", cookieHeader(cookies))
      .set("X-CSRF-Token", cookies.csrf!)
      .send({
        categoryId: cat.id,
        title: "Optional",
        file: fileMeta(),
        audiences: ALL_AUDIENCE,
        publishNow: true,
      })
      .expect(201);

    const before = await request(app.getHttpServer())
      .get("/me/documents?unacknowledgedOnly=true")
      .set("Cookie", cookieHeader(cookies))
      .expect(200);
    expect(before.body.meta.total).toBe(1);
    expect(before.body.items[0].title).toBe("Must");

    await request(app.getHttpServer())
      .post(`/documents/${must.body.id}/acknowledge`)
      .set("Cookie", cookieHeader(cookies))
      .set("X-CSRF-Token", cookies.csrf!)
      .expect(201);

    const after = await request(app.getHttpServer())
      .get("/me/documents?unacknowledgedOnly=true")
      .set("Cookie", cookieHeader(cookies))
      .expect(200);
    expect(after.body.meta.total).toBe(0);
  });
});

// ─── RBAC ────────────────────────────────────────────────────────────

describe("RBAC enforcement", () => {
  it("employee role cannot create documents but can list its own feed and ack", async () => {
    const { cookies, organizationId, userId } = await signupOrg();
    await createEmployeeForUser(cookies, userId);
    const cat = await createCategory(cookies, { name: "P" });
    const doc = await request(app.getHttpServer())
      .post("/documents")
      .set("Cookie", cookieHeader(cookies))
      .set("X-CSRF-Token", cookies.csrf!)
      .send({
        categoryId: cat.id,
        title: "T",
        file: fileMeta(),
        audiences: ALL_AUDIENCE,
        isRequired: true,
        publishNow: true,
      })
      .expect(201);

    await dropToEmployeeRole(organizationId, userId);

    const create = await request(app.getHttpServer())
      .post("/documents")
      .set("Cookie", cookieHeader(cookies))
      .set("X-CSRF-Token", cookies.csrf!)
      .send({
        categoryId: cat.id,
        title: "Bad",
        file: fileMeta(),
        audiences: ALL_AUDIENCE,
      });
    expect(create.status).toBe(403);

    const feed = await request(app.getHttpServer())
      .get("/me/documents")
      .set("Cookie", cookieHeader(cookies))
      .expect(200);
    expect(feed.body.meta.total).toBe(1);

    const ack = await request(app.getHttpServer())
      .post(`/documents/${doc.body.id}/acknowledge`)
      .set("Cookie", cookieHeader(cookies))
      .set("X-CSRF-Token", cookies.csrf!);
    expect(ack.status).toBe(201);
  });

  it("employee role cannot read full admin list (403)", async () => {
    const { cookies, organizationId, userId } = await signupOrg();
    await dropToEmployeeRole(organizationId, userId);
    const res = await request(app.getHttpServer())
      .get("/documents")
      .set("Cookie", cookieHeader(cookies));
    expect(res.status).toBe(403);
  });
});

// ─── Tenant isolation ────────────────────────────────────────────────

describe("tenant isolation", () => {
  it("Org-A cannot read, mutate, or download Org-B documents", async () => {
    const a = await signupOrg();
    const b = await signupOrg();
    const cat = await createCategory(b.cookies, { name: "P" });
    const doc = await request(app.getHttpServer())
      .post("/documents")
      .set("Cookie", cookieHeader(b.cookies))
      .set("X-CSRF-Token", b.cookies.csrf!)
      .send({
        categoryId: cat.id,
        title: "B-only",
        file: fileMeta(),
        audiences: ALL_AUDIENCE,
        publishNow: true,
      })
      .expect(201);

    const get = await request(app.getHttpServer())
      .get(`/documents/${doc.body.id}`)
      .set("Cookie", cookieHeader(a.cookies));
    expect(get.status).toBe(404);

    const dl = await request(app.getHttpServer())
      .get(`/documents/${doc.body.id}/download-url`)
      .set("Cookie", cookieHeader(a.cookies));
    expect(dl.status).toBe(404);

    const arch = await request(app.getHttpServer())
      .post(`/documents/${doc.body.id}/archive`)
      .set("Cookie", cookieHeader(a.cookies))
      .set("X-CSRF-Token", a.cookies.csrf!);
    expect(arch.status).toBe(404);
  });

  it("audience preview cannot count Org-B employees", async () => {
    const a = await signupOrg();
    const b = await signupOrg();
    await createOrphanEmployee(b.cookies);
    await createOrphanEmployee(b.cookies);
    const res = await request(app.getHttpServer())
      .post("/documents/audience/preview")
      .set("Cookie", cookieHeader(a.cookies))
      .set("X-CSRF-Token", a.cookies.csrf!)
      .send({ audiences: ALL_AUDIENCE })
      .expect(200);
    expect(res.body.count).toBe(0);
  });
});
