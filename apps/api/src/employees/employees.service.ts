import {
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import { PrismaService } from "../infra/prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import { pageOf, skipTake, type Page } from "../common/pagination";
import { isUniqueViolation } from "../org-structure/departments.service";
import { currentOrganizationId } from "../tenant/tenant-context";
import type {
  CreateEmployeeBodyT,
  UpdateEmployeeBodyT,
  EmployeeListQueryT,
} from "./dto";

function displayName(first: string, middle: string | undefined, last: string): string {
  return [first, middle, last].filter((s): s is string => Boolean(s && s.trim()))
    .join(" ");
}

@Injectable()
export class EmployeesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
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
        manager: { select: { id: true, displayName: true, employeeCode: true } },
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
        throw new ConflictException({ code: "employee.conflict_code_or_email" });
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
        throw new ConflictException({ code: "employee.conflict_code_or_email" });
      }
      throw e;
    }
  }

  async remove(id: string): Promise<void> {
    const before = await this.get(id);
    await this.prisma.db.employee.update({
      where: { id },
      data: { deletedAt: new Date(), status: "offboarded" },
    });
    await this.audit.record({
      action: "employee.delete",
      resourceType: "employee",
      resourceId: id,
      before,
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
      department: { select: { id: true, name: true } },
      designation: { select: { id: true, name: true } },
      location: { select: { id: true, name: true } },
    };
  }
}
