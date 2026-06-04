/**
 * Development seed: provisions a "Staffly Dev" organization, the four
 * system roles + per-role permissions, one user per role, one employee
 * record per user, and a minimal demo dataset (holidays, announcement,
 * leave balances, attendance record) so every dashboard widget renders
 * real data on first boot.
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
import { DEFAULT_DOCUMENT_CATEGORIES } from "../src/documents/default-document-categories";

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
  employeeCode: string;
  firstName: string;
  lastName: string;
  displayName: string;
}[] = [
  {
    email: "superadmin@staffly.local",
    password: "Admin@123",
    role: "super_admin",
    defaultPortal: "admin",
    employeeCode: "EMP-001",
    firstName: "Super",
    lastName: "Admin",
    displayName: "Super Admin",
  },
  {
    email: "hr@staffly.local",
    password: "HR@123",
    role: "hr_admin",
    defaultPortal: "admin",
    employeeCode: "EMP-002",
    firstName: "HR",
    lastName: "Manager",
    displayName: "HR Manager",
  },
  {
    email: "manager@staffly.local",
    password: "Manager@123",
    role: "manager",
    defaultPortal: "admin",
    employeeCode: "EMP-003",
    firstName: "Team",
    lastName: "Manager",
    displayName: "Team Manager",
  },
  {
    email: "employee@staffly.local",
    password: "Employee@123",
    role: "employee",
    defaultPortal: "employee",
    employeeCode: "EMP-004",
    firstName: "Alex",
    lastName: "Employee",
    displayName: "Alex Employee",
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

  // 3b. Default document categories (idempotent on code).
  await prisma.documentCategory.createMany({
    data: DEFAULT_DOCUMENT_CATEGORIES.map((c) => ({
      organizationId: org.id,
      name: c.name,
      code: c.code,
      color: c.color,
      isPersonal: c.isPersonal,
      isActive: true,
      isSystem: true,
    })),
    skipDuplicates: true,
  });

  // 4. Users + role assignments + employee records (linked via userId).
  const employeeIdByEmail: Record<string, string> = {};
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

    // Employee record — one per user. Unique on (organizationId, employeeCode).
    const emp = await prisma.employee.upsert({
      where: {
        organizationId_employeeCode: {
          organizationId: org.id,
          employeeCode: u.employeeCode,
        },
      },
      create: {
        organizationId: org.id,
        userId: user.id,
        employeeCode: u.employeeCode,
        firstName: u.firstName,
        lastName: u.lastName,
        displayName: u.displayName,
        workEmail: u.email,
        status: "active",
        joinedOn: new Date("2025-01-15"),
        employmentType: "full_time",
        workMode: "onsite",
      },
      update: { userId: user.id, status: "active" },
    });
    employeeIdByEmail[u.email] = emp.id;
  }

  // 5. Holiday calendar (default) + 2 upcoming holidays.
  const cal = await prisma.holidayCalendar.upsert({
    where: {
      organizationId_name: { organizationId: org.id, name: "General Calendar" },
    },
    create: {
      organizationId: org.id,
      name: "General Calendar",
      code: "DEFAULT",
      isDefault: true,
    },
    update: { isDefault: true },
  });

  const h1 = new Date();
  h1.setUTCDate(1);
  h1.setUTCMonth(h1.getUTCMonth() + 1);
  h1.setUTCHours(0, 0, 0, 0);
  const h2 = new Date(h1);
  h2.setUTCMonth(h2.getUTCMonth() + 1);

  await prisma.holiday.upsert({
    where: { calendarId_date: { calendarId: cal.id, date: h1 } },
    create: {
      organizationId: org.id,
      calendarId: cal.id,
      date: h1,
      name: "Demo Public Holiday",
      type: "public",
    },
    update: { name: "Demo Public Holiday" },
  });
  await prisma.holiday.upsert({
    where: { calendarId_date: { calendarId: cal.id, date: h2 } },
    create: {
      organizationId: org.id,
      calendarId: cal.id,
      date: h2,
      name: "Company Offsite Day",
      type: "company",
    },
    update: { name: "Company Offsite Day" },
  });

  // 6. Announcement published to all employees.
  // AnnouncementAudience has no @@unique, so check-then-create.
  const annTitle = "Welcome to Staffly Dev";
  let annId: string;
  const existingAnn = await prisma.announcement.findFirst({
    where: { organizationId: org.id, title: annTitle, deletedAt: null },
    select: { id: true },
  });
  if (existingAnn) {
    annId = existingAnn.id;
  } else {
    const created = await prisma.announcement.create({
      data: {
        organizationId: org.id,
        title: annTitle,
        bodyHtml:
          "<p>Welcome! This is the Staffly development environment. Use it to explore all features.</p>",
        status: "published",
        publishedAt: new Date(),
        priority: "normal",
        pinned: true,
        requiresAcknowledgment: false,
      },
    });
    annId = created.id;
  }
  const existingAud = await prisma.announcementAudience.findFirst({
    where: { announcementId: annId, audienceType: "all_employees" },
    select: { id: true },
  });
  if (!existingAud) {
    await prisma.announcementAudience.create({
      data: {
        organizationId: org.id,
        announcementId: annId,
        audienceType: "all_employees",
      },
    });
  }

  // 7. Leave type + leave balance for every employee.
  const leaveType = await prisma.leaveType.upsert({
    where: { organizationId_code: { organizationId: org.id, code: "AL" } },
    create: {
      organizationId: org.id,
      name: "Annual Leave",
      code: "AL",
      color: "#6366F1",
      unit: "day",
      accrualType: "annual",
      accrualAmount: 21,
      isPaid: true,
      requiresApproval: true,
    },
    update: { name: "Annual Leave" },
  });

  const cycleYear = new Date().getUTCFullYear();
  for (const empId of Object.values(employeeIdByEmail)) {
    await prisma.leaveBalance.upsert({
      where: {
        employeeId_leaveTypeId_cycleYear: {
          employeeId: empId,
          leaveTypeId: leaveType.id,
          cycleYear,
        },
      },
      create: {
        organizationId: org.id,
        employeeId: empId,
        leaveTypeId: leaveType.id,
        cycleYear,
        allocated: 21,
        used: 3,
        pending: 0,
        carryForward: 0,
        adjusted: 0,
      },
      update: { allocated: 21 },
    });
  }

  // 8. Today's attendance record for the employee (checked in this morning).
  const empId = employeeIdByEmail["employee@staffly.local"];
  if (empId) {
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    const checkInTime = new Date(today);
    checkInTime.setUTCHours(9, 0, 0, 0);
    const workedMinutes = Math.max(
      0,
      Math.floor((Date.now() - checkInTime.getTime()) / 60_000),
    );
    await prisma.attendanceRecord.upsert({
      where: {
        employeeId_attendanceDate: { employeeId: empId, attendanceDate: today },
      },
      create: {
        organizationId: org.id,
        employeeId: empId,
        attendanceDate: today,
        checkInAt: checkInTime,
        status: "present",
        workedMinutes,
      },
      update: { status: "present", workedMinutes },
    });
  }

  // eslint-disable-next-line no-console
  console.warn(
    `dev seed: "${ORG_NAME}" (${ORG_SLUG}) — ${USERS.length} users + employee records + demo data`,
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
