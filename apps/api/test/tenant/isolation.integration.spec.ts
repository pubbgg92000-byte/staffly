/**
 * Tenant isolation integration test — verifies the assertions in docs/02 § 8.
 *
 * Requires Docker (testcontainers spins up a real Postgres). Run with:
 *
 *   RUN_INTEGRATION=1 pnpm --filter @staffly/api test
 *
 * Excluded from the default `vitest run` via vitest.config.ts.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  PostgreSqlContainer,
  type StartedPostgreSqlContainer,
} from "@testcontainers/postgresql";
import { execSync } from "node:child_process";
import { PrismaClient } from "@prisma/client";
import {
  buildTenantClient,
  type TenantPrismaClient,
} from "../../src/tenant/prisma-tenant-client";
import {
  runWithTenant,
  TenantBoundaryViolation,
} from "../../src/tenant/tenant-context";

const ORG_A = "00000000-0000-0000-0000-00000000000a";
const ORG_B = "00000000-0000-0000-0000-00000000000b";

let container: StartedPostgreSqlContainer;
let raw: PrismaClient;
let scoped: TenantPrismaClient;

beforeAll(async () => {
  container = await new PostgreSqlContainer("postgres:18-alpine")
    .withDatabase("staffly_test")
    .withUsername("staffly")
    .withPassword("test")
    .start();

  process.env.DATABASE_URL = container.getConnectionUri();

  execSync("pnpm prisma migrate deploy", {
    stdio: "inherit",
    env: { ...process.env },
  });

  raw = new PrismaClient();
  scoped = buildTenantClient();

  // Bootstrap two organizations with one user each.
  await raw.organization.createMany({
    data: [
      { id: ORG_A, name: "Acme", slug: "acme" },
      { id: ORG_B, name: "Bravo", slug: "bravo" },
    ],
  });
  await raw.user.createMany({
    data: [
      { organizationId: ORG_A, email: "alice@acme.test" },
      { organizationId: ORG_B, email: "bob@bravo.test" },
    ],
  });
}, 120_000);

afterAll(async () => {
  await raw?.$disconnect();
  await scoped?.$disconnect();
  await container?.stop();
});

describe("Prisma tenant extension — isolation", () => {
  it("scoped findMany returns only the active tenant's rows", async () => {
    await runWithTenant({ organizationId: ORG_A }, async () => {
      const users = await scoped.user.findMany();
      expect(users).toHaveLength(1);
      expect(users[0]?.email).toBe("alice@acme.test");
    });
  });

  it("scoped findUnique on the other tenant's id returns null", async () => {
    const bobInB = await raw.user.findFirst({
      where: { organizationId: ORG_B },
    });
    if (!bobInB) throw new Error("seed missing");

    await runWithTenant({ organizationId: ORG_A }, async () => {
      const found = await scoped.user.findUnique({ where: { id: bobInB.id } });
      expect(found).toBeNull();
    });
  });

  it("scoped create auto-stamps the active tenant's organizationId", async () => {
    await runWithTenant({ organizationId: ORG_A }, async () => {
      const created = await scoped.user.create({
        // Prisma's generated type requires organizationId here. The tenant extension
        // injects it at runtime — this cast asserts the runtime behavior the test
        // is verifying.
        data: { email: "carol@acme.test" } as unknown as Parameters<
          typeof scoped.user.create
        >[0]["data"],
      });
      expect(created.organizationId).toBe(ORG_A);
    });
  });

  it("explicit where.organizationId on the wrong tenant throws", async () => {
    await runWithTenant({ organizationId: ORG_A }, async () => {
      await expect(
        scoped.user.findMany({ where: { organizationId: ORG_B } }),
      ).rejects.toBeInstanceOf(TenantBoundaryViolation);
    });
  });

  it("queries WITHOUT a tenant context pass through unmodified", async () => {
    const all = await scoped.user.findMany();
    expect(all.length).toBeGreaterThanOrEqual(3);
  });

  it("the global Permission catalog is opt-out of tenancy", async () => {
    await raw.permission.upsert({
      where: { key: "test.ping" },
      create: {
        key: "test.ping",
        resource: "test",
        action: "ping",
        description: "x",
      },
      update: {},
    });
    await runWithTenant({ organizationId: ORG_A }, async () => {
      const perms = await scoped.permission.findMany({
        where: { key: "test.ping" },
      });
      expect(perms).toHaveLength(1);
    });
  });
});
