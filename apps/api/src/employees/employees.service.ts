import {
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import { PrismaService } from "../infra/prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import { UsersService } from "../rbac/users.service";
import { pageOf, skipTake, type Page } from "../common/pagination";
import { isUniqueViolation } from "../org-structure/departments.service";
import { currentOrganizationId } from "../tenant/tenant-context";
import type {
  CreateEmployeeBodyT,
  UpdateEmployeeBodyT,
  EmployeeListQueryT,
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
  ) {}

  async list(q: EmployeeListQueryT): Promise<Page<unknown>> {
    const where: Prisma.EmployeeWhereInput = { deletedAt: null };
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

  async get(id: string): Promise<unknown> {
    const row = await this.prisma.db.employee.findFirst({
      where: { id, deletedAt: null },
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
    };
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
