import {
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import { PrismaService } from "../infra/prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import {
  pageOf,
  skipTake,
  type Page,
  type PaginationQueryT,
} from "../common/pagination";
import { isUniqueViolation } from "../org-structure/departments.service";
import { currentOrganizationId } from "../tenant/tenant-context";
import type { CreateLeaveTypeBodyT, UpdateLeaveTypeBodyT } from "./dto";

@Injectable()
export class LeaveTypesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(q: PaginationQueryT): Promise<Page<unknown>> {
    const where: Prisma.LeaveTypeWhereInput = { deletedAt: null };
    if (q.search) where.name = { contains: q.search, mode: "insensitive" };
    const [items, total] = await Promise.all([
      this.prisma.db.leaveType.findMany({
        where,
        orderBy: { name: "asc" },
        ...skipTake(q),
      }),
      this.prisma.db.leaveType.count({ where }),
    ]);
    return pageOf(items, total, q);
  }

  async get(id: string): Promise<unknown> {
    const row = await this.prisma.db.leaveType.findFirst({
      where: { id, deletedAt: null },
    });
    if (!row) throw new NotFoundException({ code: "leave.type.not_found" });
    return row;
  }

  async create(body: CreateLeaveTypeBodyT): Promise<unknown> {
    const orgId = currentOrganizationId();
    if (!orgId) throw new Error("no active tenant context");
    try {
      const row = await this.prisma.db.leaveType.create({
        data: {
          ...body,
          organizationId: orgId,
        } as Prisma.LeaveTypeUncheckedCreateInput,
      });
      await this.audit.record({
        action: "leave.type.create",
        resourceType: "leave_type",
        resourceId: row.id,
        after: row,
      });
      return row;
    } catch (e) {
      if (isUniqueViolation(e))
        throw new ConflictException({
          code: "leave.type.conflict_name_or_code",
        });
      throw e;
    }
  }

  async update(id: string, body: UpdateLeaveTypeBodyT): Promise<unknown> {
    const before = await this.get(id);
    try {
      const row = await this.prisma.db.leaveType.update({
        where: { id },
        data: body,
      });
      await this.audit.record({
        action: "leave.type.update",
        resourceType: "leave_type",
        resourceId: id,
        before,
        after: row,
      });
      return row;
    } catch (e) {
      if (isUniqueViolation(e))
        throw new ConflictException({
          code: "leave.type.conflict_name_or_code",
        });
      throw e;
    }
  }

  async remove(id: string): Promise<void> {
    const before = await this.get(id);
    await this.prisma.db.leaveType.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
    await this.audit.record({
      action: "leave.type.delete",
      resourceType: "leave_type",
      resourceId: id,
      before,
    });
  }
}
