/**
 * Idempotent seed for the global Permission catalog.
 *
 * Default Roles + Role↔Permission assignments are per-organization and are written
 * by the OrgBootstrapService at org-creation time (Batch 3). This seed only fills
 * the org-agnostic `permissions` table so that integration tests have something
 * to point FKs at.
 */
import { PrismaClient } from "@prisma/client";
import { readFileSync } from "node:fs";
import path from "node:path";

type Catalog = {
  permissions: {
    key: string;
    resource: string;
    action: string;
    description: string;
  }[];
};

// Run under tsx in CJS mode (apps/api/package.json has no `"type": "module"`).
const catalogPath = path.resolve(
  __dirname,
  "../src/seeds/role-permissions.json",
);
const catalog = JSON.parse(readFileSync(catalogPath, "utf8")) as Catalog;

const prisma = new PrismaClient();

async function main(): Promise<void> {
  const ops = catalog.permissions.map((p) =>
    prisma.permission.upsert({
      where: { key: p.key },
      create: {
        key: p.key,
        resource: p.resource,
        action: p.action,
        description: p.description,
      },
      update: {
        resource: p.resource,
        action: p.action,
        description: p.description,
      },
    }),
  );
  await prisma.$transaction(ops);
  // eslint-disable-next-line no-console
  console.warn(`seed: upserted ${ops.length} permissions`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
