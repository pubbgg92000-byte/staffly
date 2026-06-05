import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import { PrismaService } from "../infra/prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import { pageOf, skipTake, type Page } from "../common/pagination";
import { currentOrganizationId } from "../tenant/tenant-context";
import type { AssignRoleBodyT, UserListQueryT } from "./dto";

function requireOrg(): string {
  const id = currentOrganizationId();
  if (!id) throw new Error("no active tenant context");
  return id;
}

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(q: UserListQueryT): Promise<Page<unknown>> {
    // Employee is not a relation on User in the Prisma schema (the FK is on
    // Employee.userId). We do a two-step fetch: users first, then a separate
    // lookup of employees keyed by userId so we can merge names.
    const where: Prisma.UserWhereInput = { deletedAt: null };
    if (q.search) {
      where.email = { contains: q.search, mode: "insensitive" };
    }

    const [users, total] = await Promise.all([
      this.prisma.db.user.findMany({
        where,
        orderBy: { email: "asc" },
        ...skipTake(q),
        select: {
          id: true,
          email: true,
          status: true,
          defaultPortal: true,
          lastLoginAt: true,
          createdAt: true,
          userRoles: {
            where: { role: { deletedAt: null } },
            select: {
              role: { select: { id: true, key: true, name: true } },
              assignedAt: true,
            },
            orderBy: { assignedAt: "asc" },
          },
        },
      }),
      this.prisma.db.user.count({ where }),
    ]);

    // Enrich with employee records (one-to-one, optional).
    const userIds = users.map((u) => u.id);
    const employees =
      userIds.length > 0
        ? await this.prisma.db.employee.findMany({
            where: { userId: { in: userIds }, deletedAt: null },
            select: {
              userId: true,
              id: true,
              displayName: true,
              employeeCode: true,
            },
          })
        : [];
    const empByUserId = new Map(employees.map((e) => [e.userId, e]));

    const shaped = users.map((u) => {
      const emp = empByUserId.get(u.id);
      return {
        id: u.id,
        email: u.email,
        status: u.status,
        defaultPortal: u.defaultPortal,
        lastLoginAt: u.lastLoginAt,
        createdAt: u.createdAt,
        employee: emp
          ? {
              id: emp.id,
              displayName: emp.displayName,
              employeeCode: emp.employeeCode,
            }
          : null,
        roles: u.userRoles.map((ur) => ({
          id: ur.role.id,
          key: ur.role.key,
          name: ur.role.name,
          assignedAt: ur.assignedAt,
        })),
      };
    });

    return pageOf(shaped, total, q);
  }

  async assignRole(
    userId: string,
    body: AssignRoleBodyT,
    actorUserId: string,
  ): Promise<unknown> {
    const orgId = requireOrg();

    const user = await this.prisma.db.user.findFirst({
      where: { id: userId, deletedAt: null },
      select: { id: true, email: true },
    });
    if (!user) throw new NotFoundException({ code: "user.not_found" });

    const role = await this.prisma.db.role.findFirst({
      where: { id: body.roleId, deletedAt: null },
    });
    if (!role) throw new NotFoundException({ code: "role.not_found" });

    // Prevent assigning super_admin to anyone other than the actor themselves
    // via this endpoint. super_admin assignment is only done at org-bootstrap.
    if (role.key === "super_admin") {
      throw new BadRequestException({ code: "role.super_admin_protected" });
    }

    // Enforce single-role assignment: remove all current roles, add the new one.
    await this.prisma.db.$transaction(async (tx) => {
      await tx.userRole.deleteMany({
        where: { userId, organizationId: orgId },
      });
      await tx.userRole.create({
        data: {
          organizationId: orgId,
          userId,
          roleId: role.id,
          assignedBy: actorUserId,
        },
      });
    });

    await this.audit.record({
      action: "user.role.assign",
      resourceType: "user",
      resourceId: userId,
      after: { roleId: role.id, roleKey: role.key },
    });

    return { userId, role: { id: role.id, key: role.key, name: role.name } };
  }
}
