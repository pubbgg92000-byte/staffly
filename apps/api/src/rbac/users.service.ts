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

    // Last-super_admin guard: if this user is currently the only active
    // super_admin in the org, refuse to swap them to anything else. Without
    // this, an admin with rbac.write could lock the org out of all
    // super-only operations.
    await this.ensureNotLastSuperAdmin(userId, orgId, "last_super_admin");

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

  async deactivate(userId: string, actorUserId: string): Promise<unknown> {
    const orgId = requireOrg();
    const user = await this.prisma.db.user.findFirst({
      where: { id: userId, deletedAt: null },
      select: { id: true, email: true, status: true },
    });
    if (!user) throw new NotFoundException({ code: "user.not_found" });

    if (userId === actorUserId) {
      // No self-lockout. An admin cannot disable their own account from this
      // endpoint; they'd lose the ability to undo it.
      throw new BadRequestException({ code: "user.self_deactivate" });
    }

    if (user.status === "disabled") {
      // Idempotent: already disabled.
      return { userId, status: "disabled" as const };
    }

    await this.ensureNotLastSuperAdmin(userId, orgId, "last_super_admin");

    await this.prisma.db.user.update({
      where: { id: userId },
      data: { status: "disabled" },
    });

    // Terminate the disabled user's sessions: revoke every active refresh
    // token so they cannot mint fresh access tokens via /auth/refresh. Any
    // outstanding access token still works until its short TTL (~15 min)
    // expires — a bounded, documented residual (OI-14) — but the indefinite
    // "refresh forever" hole is closed.
    await this.prisma.db.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date(), revokeReason: "user_deactivated" },
    });

    await this.audit.record({
      action: "user.deactivate",
      resourceType: "user",
      resourceId: userId,
      before: { status: user.status },
      after: { status: "disabled" },
    });

    return { userId, status: "disabled" as const };
  }

  async activate(userId: string): Promise<unknown> {
    const user = await this.prisma.db.user.findFirst({
      where: { id: userId, deletedAt: null },
      select: { id: true, email: true, status: true },
    });
    if (!user) throw new NotFoundException({ code: "user.not_found" });

    if (user.status === "active") {
      // Idempotent: already active.
      return { userId, status: "active" as const };
    }

    await this.prisma.db.user.update({
      where: { id: userId },
      data: { status: "active" },
    });

    await this.audit.record({
      action: "user.activate",
      resourceType: "user",
      resourceId: userId,
      before: { status: user.status },
      after: { status: "active" },
    });

    return { userId, status: "active" as const };
  }

  /**
   * Throws if the given user is currently the only active super_admin in the
   * org. Called from any path that would remove the super_admin role or
   * disable the user — including role reassignment, deactivation, and the
   * employee offboarding flow.
   *
   * `code` lets the caller pick a more specific error code if needed; the
   * default `"last_super_admin"` is sufficient for most cases.
   */
  async ensureNotLastSuperAdmin(
    userId: string,
    orgId: string,
    code: string = "last_super_admin",
  ): Promise<void> {
    // Is this user currently a super_admin?
    const userIsSuperAdmin = await this.prisma.db.userRole.findFirst({
      where: {
        userId,
        organizationId: orgId,
        role: { key: "super_admin", deletedAt: null },
      },
      select: { userId: true },
    });
    if (!userIsSuperAdmin) return;

    // Count *active* super_admins in the org (status=active, not deleted).
    const activeSuperAdmins = await this.prisma.db.userRole.count({
      where: {
        organizationId: orgId,
        role: { key: "super_admin", deletedAt: null },
        user: { status: "active", deletedAt: null },
      },
    });
    if (activeSuperAdmins <= 1) {
      throw new BadRequestException({ code });
    }
  }
}
