/**
 * Development seed: provisions a "Staffly Dev" organization, the four
 * system roles + per-role permissions, and one user per role with the
 * fixed credentials documented in the project handbook.
 *
 * Idempotent — re-running updates the password hashes in place (handy when
 * you want to reset known dev creds) but does not duplicate rows.
 *
 * Usage:
 *   pnpm --filter @staffly/api db:seed:dev
 *
 * NEVER run this against a production DB — the printed credentials are
 * fixed and well-known.
 */
import { PrismaClient } from "@prisma/client";
import argon2 from "argon2";
import { readFileSync } from "node:fs";
import path from "node:path";

type Catalog = {
  permissions: {
    key: string;
    resource: string;
    action: string;
    description: string;
  }[];
  roles: {
    key: "super_admin" | "hr_admin" | "manager" | "employee";
    name: string;
    description: string;
    isSystem: boolean;
    permissions: "*" | string[];
  }[];
};

const catalogPath = path.resolve(
  __dirname,
  "../src/seeds/role-permissions.json",
);
const catalog = JSON.parse(readFileSync(catalogPath, "utf8")) as Catalog;

const ORG_SLUG = "staffly-dev";
const ORG_NAME = "Staffly Dev";

const USERS: {
  email: string;
  password: string;
  role: Catalog["roles"][number]["key"];
  defaultPortal: "admin" | "employee";
}[] = [
  {
    email: "superadmin@staffly.local",
    password: "Admin@123",
    role: "super_admin",
    defaultPortal: "admin",
  },
  {
    email: "hr@staffly.local",
    password: "HR@123",
    role: "hr_admin",
    defaultPortal: "admin",
  },
  {
    email: "manager@staffly.local",
    password: "Manager@123",
    role: "manager",
    defaultPortal: "admin",
  },
  {
    email: "employee@staffly.local",
    password: "Employee@123",
    role: "employee",
    defaultPortal: "employee",
  },
];

const prisma = new PrismaClient();

async function hash(plain: string): Promise<string> {
  return argon2.hash(plain, {
    type: argon2.argon2id,
    memoryCost: 64 * 1024,
    timeCost: 3,
    parallelism: 2,
  });
}

async function main(): Promise<void> {
  // 1. Permission catalog (idempotent upsert).
  await prisma.$transaction(
    catalog.permissions.map((p) =>
      prisma.permission.upsert({
        where: { key: p.key },
        create: p,
        update: {
          resource: p.resource,
          action: p.action,
          description: p.description,
        },
      }),
    ),
  );

  // 2. Organization (idempotent).
  const org = await prisma.organization.upsert({
    where: { slug: ORG_SLUG },
    create: { slug: ORG_SLUG, name: ORG_NAME },
    update: { name: ORG_NAME },
  });

  // 3. Roles + role-permission edges.
  const allKeys = catalog.permissions.map((p) => p.key);
  const roleIds: Record<string, string> = {};
  for (const role of catalog.roles) {
    const created = await prisma.role.upsert({
      where: {
        organizationId_key: { organizationId: org.id, key: role.key },
      },
      create: {
        organizationId: org.id,
        key: role.key,
        name: role.name,
        description: role.description,
        isSystem: role.isSystem,
      },
      update: { name: role.name, description: role.description },
    });
    roleIds[role.key] = created.id;
    const permKeys = role.permissions === "*" ? allKeys : role.permissions;
    if (permKeys.length > 0) {
      await prisma.rolePermission.createMany({
        data: permKeys.map((permissionKey) => ({
          organizationId: org.id,
          roleId: created.id,
          permissionKey,
        })),
        skipDuplicates: true,
      });
    }
  }

  // 4. Users + role assignments.
  for (const u of USERS) {
    const passwordHash = await hash(u.password);
    const user = await prisma.user.upsert({
      where: { email: u.email },
      create: {
        organizationId: org.id,
        email: u.email,
        passwordHash,
        status: "active",
        emailVerifiedAt: new Date(),
        defaultPortal: u.defaultPortal,
      },
      update: {
        passwordHash,
        status: "active",
        defaultPortal: u.defaultPortal,
      },
    });
    const roleId = roleIds[u.role];
    if (!roleId) throw new Error(`missing role: ${u.role}`);
    await prisma.userRole.upsert({
      where: { userId_roleId: { userId: user.id, roleId } },
      create: { organizationId: org.id, userId: user.id, roleId },
      update: {},
    });
  }

  // eslint-disable-next-line no-console
  console.warn(
    `dev seed: organization "${ORG_NAME}" (${ORG_SLUG}) provisioned with ${USERS.length} users`,
  );
  for (const u of USERS) {
    // eslint-disable-next-line no-console
    console.warn(
      `  - ${u.role.padEnd(11)} ${u.email}  password: ${u.password}`,
    );
  }
}

main()
  .catch((err) => {
    // eslint-disable-next-line no-console
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
