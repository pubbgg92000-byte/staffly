import {
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import { PrismaService } from "../infra/prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import { UsersService } from "../rbac/users.service";
import { CallerScopeService } from "../rbac/caller-scope.service";
import { pageOf, skipTake, type Page } from "../common/pagination";
import { isUniqueViolation } from "../org-structure/departments.service";
import { currentOrganizationId } from "../tenant/tenant-context";
import type {
  CreateEmployeeBodyT,
  UpdateEmployeeBodyT,
  EmployeeListQueryT,
  RestoreEmployeeBodyT,
} from "./dto";

function displayName(
  first: string,
  middle: string | undefined,
  last: string,
): string {
  return [first, middle, last]
    .filter((s): s is string => Boolean(s && s.trim()))
    .join(" ");
}

@Injectable()
export class EmployeesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly users: UsersService,
    private readonly callerScope: CallerScopeService,
  ) {}

  async list(
    q: EmployeeListQueryT,
    callerUserId?: string,
  ): Promise<Page<unknown>> {
    const where: Prisma.EmployeeWhereInput = q.includeArchived
      ? {}
      : { deletedAt: null };
    if (q.status) where.status = q.status;
    if (q.departmentId) where.departmentId = q.departmentId;
    if (q.designationId) where.designationId = q.designationId;
    if (q.locationId) where.locationId = q.locationId;
    if (q.managerId) where.managerId = q.managerId;
    if (q.employmentType) where.employmentType = q.employmentType;
    if (q.search) {
      where.OR = [
        { displayName: { contains: q.search, mode: "insensitive" } },
        { employeeCode: { contains: q.search, mode: "insensitive" } },
        { workEmail: { contains: q.search, mode: "insensitive" } },
      ];
    }
    // Team scoping: a manager (employee.read held at `team` scope) sees only
    // their own record + direct/indirect reports. global scope → no restriction.
    if (callerUserId) {
      const team = await this.callerScope.teamFilterFor(
        callerUserId,
        "employee.read",
      );
      if (team) where.id = { in: team };
    }

    const [items, total] = await Promise.all([
      this.prisma.db.employee.findMany({
        where,
        orderBy: { [q.sortBy]: q.sortDir },
        ...skipTake(q),
        select: this.cardSelect(),
      }),
      this.prisma.db.employee.count({ where }),
    ]);
    return pageOf(items, total, q);
  }

  async get(id: string, callerUserId?: string): Promise<unknown> {
    // Team scoping: a manager (employee.read at `team` scope) may only read
    // their own record + direct/indirect reports. Out-of-team → 404 (do not
    // leak existence). global scope (hr_admin/super_admin) → no restriction.
    if (callerUserId) {
      const allowed = await this.callerScope.canActOnEmployee(
        callerUserId,
        "employee.read",
        id,
      );
      if (!allowed) throw new NotFoundException({ code: "employee.not_found" });
    }
    // Detail does NOT filter deletedAt so the FE can show an archived
    // employee with a Restore action. List visibility is controlled by
    // `includeArchived`. Update guards re-check `deletedAt` itself.
    const row = await this.prisma.db.employee.findFirst({
      where: { id },
      include: {
        department: { select: { id: true, name: true } },
        designation: { select: { id: true, name: true } },
        location: { select: { id: true, name: true } },
        manager: {
          select: { id: true, displayName: true, employeeCode: true },
        },
      },
    });
    if (!row) throw new NotFoundException({ code: "employee.not_found" });
    return row;
  }

  async create(body: CreateEmployeeBodyT): Promise<unknown> {
    const orgId = currentOrganizationId();
    if (!orgId) {
      // Should never happen on an authenticated route — guard anyway so we
      // never accidentally create a global-scope employee.
      throw new Error("create called without an active tenant context");
    }
    const data: Prisma.EmployeeUncheckedCreateInput = {
      ...body,
      displayName: displayName(body.firstName, body.middleName, body.lastName),
      organizationId: orgId,
    };
    try {
      const row = await this.prisma.db.employee.create({ data });
      await this.audit.record({
        action: "employee.create",
        resourceType: "employee",
        resourceId: row.id,
        after: row,
      });
      return row;
    } catch (e) {
      if (isUniqueViolation(e)) {
        throw new ConflictException({
          code: "employee.conflict_code_or_email",
        });
      }
      throw e;
    }
  }

  async update(id: string, body: UpdateEmployeeBodyT): Promise<unknown> {
    const before = (await this.get(id)) as {
      firstName: string;
      middleName: string | null;
      lastName: string;
      deletedAt: Date | null;
    };
    // get() now returns archived rows so the detail page can show them; an
    // archived employee can't be edited without restoring first.
    if (before.deletedAt) {
      throw new NotFoundException({ code: "employee.not_found" });
    }
    const data: Prisma.EmployeeUpdateInput = { ...body };
    if (body.firstName || body.middleName !== undefined || body.lastName) {
      data.displayName = displayName(
        body.firstName ?? before.firstName,
        body.middleName ?? before.middleName ?? undefined,
        body.lastName ?? before.lastName,
      );
    }
    try {
      const row = await this.prisma.db.employee.update({
        where: { id },
        data,
      });
      await this.audit.record({
        action: "employee.update",
        resourceType: "employee",
        resourceId: id,
        before,
        after: row,
      });
      return row;
    } catch (e) {
      if (isUniqueViolation(e)) {
        throw new ConflictException({
          code: "employee.conflict_code_or_email",
        });
      }
      throw e;
    }
  }

  async remove(id: string): Promise<void> {
    const orgId = currentOrganizationId();
    if (!orgId) {
      throw new Error("remove called without an active tenant context");
    }
    // Read the raw row (not the get() projection) so we have userId for the
    // cascade and the last-super_admin guard.
    const employee = await this.prisma.db.employee.findFirst({
      where: { id, deletedAt: null },
      select: {
        id: true,
        userId: true,
        status: true,
        displayName: true,
        employeeCode: true,
      },
    });
    if (!employee) throw new NotFoundException({ code: "employee.not_found" });

    if (employee.userId) {
      // Refuse to offboard the last active super_admin — that would lock the
      // org out of all super-only operations. The guard throws with the code
      // we pass in, surfacing as `employee.last_super_admin` to the caller.
      await this.users.ensureNotLastSuperAdmin(
        employee.userId,
        orgId,
        "employee.last_super_admin",
      );
    }

    await this.prisma.db.$transaction(async (tx) => {
      await tx.employee.update({
        where: { id },
        data: { deletedAt: new Date(), status: "offboarded" },
      });
      // Cascade: when an employee is offboarded, the linked user account
      // should no longer be able to sign in. Idempotent — leaves already
      // disabled users untouched.
      if (employee.userId) {
        await tx.user.updateMany({
          where: { id: employee.userId, status: { not: "disabled" } },
          data: { status: "disabled" },
        });
      }
    });

    await this.audit.record({
      action: "employee.delete",
      resourceType: "employee",
      resourceId: id,
      before: employee,
    });
  }

  async restore(id: string, body: RestoreEmployeeBodyT): Promise<unknown> {
    const employee = await this.prisma.db.employee.findFirst({
      where: { id, deletedAt: { not: null } },
      select: {
        id: true,
        userId: true,
        status: true,
        displayName: true,
        employeeCode: true,
        deletedAt: true,
      },
    });
    if (!employee) throw new NotFoundException({ code: "employee.not_found" });

    // Default to reactivating the linked user when restoring. Admin can opt
    // out with `{ reactivateUser: false }` if the user was deactivated for
    // cause before offboarding.
    const reactivateUser = body.reactivateUser ?? true;
    let userReactivated = false;

    try {
      await this.prisma.db.$transaction(async (tx) => {
        await tx.employee.update({
          where: { id },
          data: { deletedAt: null, status: "active" },
        });
        if (reactivateUser && employee.userId) {
          // Only flip from disabled → active. If user is invited / already
          // active, leave it alone.
          const upd = await tx.user.updateMany({
            where: { id: employee.userId, status: "disabled" },
            data: { status: "active" },
          });
          userReactivated = upd.count > 0;
        }
      });
    } catch (e) {
      if (isUniqueViolation(e)) {
        throw new ConflictException({
          code: "employee.conflict_code_or_email",
        });
      }
      throw e;
    }

    await this.audit.record({
      action: "employee.restore",
      resourceType: "employee",
      resourceId: id,
      before: employee,
      after: { status: "active", userReactivated, reactivateUser },
    });

    const restored = (await this.get(id)) as Record<string, unknown>;
    return { ...restored, userReactivated };
  }

  private cardSelect(): Prisma.EmployeeSelect {
    return {
      id: true,
      employeeCode: true,
      displayName: true,
      firstName: true,
      lastName: true,
      workEmail: true,
      status: true,
      employmentType: true,
      workMode: true,
      profilePhotoUrl: true,
      joinedOn: true,
      managerId: true,
      deletedAt: true,
      department: { select: { id: true, name: true } },
      designation: { select: { id: true, name: true } },
      location: { select: { id: true, name: true } },
    };
  }

  async findByUserId(userId: string): Promise<unknown> {
    const row = await this.prisma.db.employee.findFirst({
      where: { userId, deletedAt: null },
      include: {
        department: {
          select: {
            id: true,
            name: true,
            parentId: true,
            headEmployeeId: true,
            // Included so the employee /me page can label the parent dept
            // when the user is in a "team" (a sub-department).
            parent: { select: { id: true, name: true } },
          },
        },
        designation: { select: { id: true, name: true, level: true } },
        location: {
          select: { id: true, name: true, city: true, country: true },
        },
        manager: {
          select: {
            id: true,
            displayName: true,
            employeeCode: true,
            workEmail: true,
            designation: { select: { name: true } },
          },
        },
      },
    });
    if (!row) throw new NotFoundException({ code: "employee.not_found" });
    return row;
  }
}
