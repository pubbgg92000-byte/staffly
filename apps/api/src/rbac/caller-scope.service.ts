import { Injectable } from "@nestjs/common";
import type { PermissionScope } from "@prisma/client";
import { PrismaService } from "../infra/prisma/prisma.service";

/**
 * Resolves *how much* a caller can see/act on for a given permission, using the
 * `RolePermission.scope` column (`global | team | self | assigned`).
 *
 * Today only `global` (org-wide: super_admin, hr_admin) and `team` (manager,
 * limited to their direct + indirect reports) are enforced. A caller's
 * effective scope for a permission is the *highest* across all their roles
 * (global outranks team), so granting a global role anywhere wins.
 *
 * Used by the list services to inject an `employeeId IN (team)` constraint and
 * by the leave approve/cancel paths to reject acting on out-of-team requests.
 * The PermissionGuard still decides *whether* the caller holds the permission
 * at all — this service only narrows the rows once access is granted.
 */
@Injectable()
export class CallerScopeService {
  constructor(private readonly prisma: PrismaService) {}

  private static readonly RANK: Record<PermissionScope, number> = {
    assigned: 0,
    self: 1,
    team: 2,
    global: 3,
  };

  /** Highest scope the caller holds for `permissionKey`, or undefined if none. */
  async scopeFor(
    userId: string,
    permissionKey: string,
  ): Promise<PermissionScope | undefined> {
    const rows = await this.prisma.db.userRole.findMany({
      where: { userId },
      select: {
        role: {
          select: {
            rolePermissions: {
              where: { permissionKey },
              select: { scope: true },
            },
          },
        },
      },
    });
    let best: PermissionScope | undefined;
    for (const ur of rows) {
      for (const rp of ur.role.rolePermissions) {
        if (
          best === undefined ||
          CallerScopeService.RANK[rp.scope] > CallerScopeService.RANK[best]
        ) {
          best = rp.scope;
        }
      }
    }
    return best;
  }

  /** The caller's own `Employee.id`, or null if they have no employee record. */
  async employeeIdForUser(userId: string): Promise<string | null> {
    const e = await this.prisma.db.employee.findFirst({
      where: { userId, deletedAt: null },
      select: { id: true },
    });
    return e?.id ?? null;
  }

  /**
   * The manager's own id plus every direct/indirect report id. Iterative
   * breadth-first walk over `Employee.managerId` (indexed), depth-capped to
   * guard against accidental cycles. Tenant-scoped via the Prisma extension.
   */
  async teamEmployeeIds(managerEmployeeId: string): Promise<string[]> {
    const all = new Set<string>([managerEmployeeId]);
    let frontier = [managerEmployeeId];
    for (let depth = 0; depth < 10 && frontier.length > 0; depth++) {
      const reports = await this.prisma.db.employee.findMany({
        where: { managerId: { in: frontier }, deletedAt: null },
        select: { id: true },
      });
      frontier = [];
      for (const r of reports) {
        if (!all.has(r.id)) {
          all.add(r.id);
          frontier.push(r.id);
        }
      }
    }
    return [...all];
  }

  /**
   * For a team-scoped read permission, the employee-id allowlist to filter a
   * list by. Returns `null` when the caller has org-wide (`global`) scope (no
   * restriction). Returns `[]` for a team-scoped caller with no employee record
   * (sees nothing). Callers apply this as `where.<empCol> = { in: ids }`.
   */
  async teamFilterFor(
    userId: string,
    permissionKey: string,
  ): Promise<string[] | null> {
    const scope = await this.scopeFor(userId, permissionKey);
    if (scope !== "team") return null;
    const empId = await this.employeeIdForUser(userId);
    if (!empId) return [];
    return this.teamEmployeeIds(empId);
  }

  /**
   * Whether the caller may act on `targetEmployeeId` under `permissionKey`:
   * `global` scope → always true; `team` scope → only when the target is in the
   * caller's team. (Permission *presence* is enforced separately by the guard.)
   */
  async canActOnEmployee(
    userId: string,
    permissionKey: string,
    targetEmployeeId: string,
  ): Promise<boolean> {
    const scope = await this.scopeFor(userId, permissionKey);
    if (scope !== "team") return true;
    const empId = await this.employeeIdForUser(userId);
    if (!empId) return false;
    const team = await this.teamEmployeeIds(empId);
    return team.includes(targetEmployeeId);
  }
}
