import { Injectable } from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import {
  SYSTEM_ROLES,
  expandRolePermissions,
  type RoleKey,
} from "./system-roles";
import { DEFAULT_LEAVE_TYPES } from "../leave/default-leave-types";
import { DEFAULT_DOCUMENT_CATEGORIES } from "../documents/default-document-categories";

/**
 * Materializes the four system roles into a new organization.
 *
 * Designed to run inside a Prisma transaction owned by the caller (signup),
 * so it accepts a `Prisma.TransactionClient` rather than reaching for a
 * shared `PrismaService`. The Permission catalog (global, shared across orgs)
 * is assumed to already be seeded via `prisma db seed`.
 *
 * Idempotent at the role level: re-running for the same org is a no-op for
 * roles whose `(organizationId, key)` already exists. The first call creates
 * every (role, permission) edge.
 */
@Injectable()
export class OrgBootstrapService {
  async bootstrap(
    tx: Prisma.TransactionClient,
    organizationId: string,
  ): Promise<Record<RoleKey, string>> {
    const roleIdByKey = {} as Record<RoleKey, string>;

    for (const role of SYSTEM_ROLES) {
      const created = await tx.role.upsert({
        where: {
          organizationId_key: {
            organizationId,
            key: role.key,
          },
        },
        create: {
          organizationId,
          key: role.key,
          name: role.name,
          description: role.description,
          isSystem: role.isSystem,
        },
        update: {},
      });
      roleIdByKey[role.key] = created.id;

      const permKeys = expandRolePermissions(role);
      if (permKeys.length === 0) continue;

      await tx.rolePermission.createMany({
        data: permKeys.map((permissionKey) => ({
          organizationId,
          roleId: created.id,
          permissionKey,
        })),
        skipDuplicates: true,
      });
    }

    // Seed default leave types for the org. Idempotent — `(organizationId, code)`
    // is unique, so re-running for the same org is a no-op.
    await tx.leaveType.createMany({
      data: DEFAULT_LEAVE_TYPES.map((t) => ({
        organizationId,
        name: t.name,
        code: t.code,
        color: t.color,
        accrualType: t.accrualType,
        accrualAmount: t.accrualAmount,
        maxBalance: t.maxBalance,
        carryForwardMax: t.carryForwardMax,
        isPaid: t.isPaid,
        isSystem: true,
      })),
      skipDuplicates: true,
    });

    // Seed an empty default holiday calendar for the org. Admins populate it.
    // Idempotent — `(organizationId, name)` is unique on holiday_calendars.
    await tx.holidayCalendar.createMany({
      data: [
        {
          organizationId,
          name: "Standard",
          isDefault: true,
        },
      ],
      skipDuplicates: true,
    });

    // Seed default document categories. isSystem=true prevents deletion.
    // Idempotent — `(organizationId, code)` is unique on document_categories.
    await tx.documentCategory.createMany({
      data: DEFAULT_DOCUMENT_CATEGORIES.map((c) => ({
        organizationId,
        name: c.name,
        code: c.code,
        color: c.color,
        isPersonal: c.isPersonal,
        isActive: true,
        isSystem: true,
      })),
      skipDuplicates: true,
    });

    return roleIdByKey;
  }
}
