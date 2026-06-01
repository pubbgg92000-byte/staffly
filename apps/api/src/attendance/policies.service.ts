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
  type PaginationQueryT,
  type Page,
} from "../common/pagination";
import { isUniqueViolation } from "../org-structure/departments.service";
import { currentOrganizationId } from "../tenant/tenant-context";
import type { CreatePolicyBodyT, UpdatePolicyBodyT } from "./dto";

@Injectable()
export class AttendancePoliciesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(q: PaginationQueryT): Promise<Page<unknown>> {
    const where: Prisma.AttendancePolicyWhereInput = { deletedAt: null };
    if (q.search)
      where.name = { contains: q.search, mode: "insensitive" };
    const [items, total] = await Promise.all([
      this.prisma.db.attendancePolicy.findMany({
        where,
        orderBy: { name: "asc" },
        ...skipTake(q),
      }),
      this.prisma.db.attendancePolicy.count({ where }),
    ]);
    return pageOf(items, total, q);
  }

  async get(id: string): Promise<unknown> {
    const row = await this.prisma.db.attendancePolicy.findFirst({
      where: { id, deletedAt: null },
    });
    if (!row)
      throw new NotFoundException({ code: "attendance.policy.not_found" });
    return row;
  }

  async getDefault(): Promise<unknown | null> {
    return this.prisma.db.attendancePolicy.findFirst({
      where: { isDefault: true, deletedAt: null },
    });
  }

  async create(body: CreatePolicyBodyT): Promise<unknown> {
    const orgId = currentOrganizationId();
    if (!orgId) throw new Error("no active tenant context");
    return this.prisma.db.$transaction(async (tx) => {
      if (body.isDefault) await this.unsetExistingDefault(tx, orgId);
      try {
        const row = await tx.attendancePolicy.create({
          data: { ...body, organizationId: orgId } as Prisma.AttendancePolicyUncheckedCreateInput,
        });
        await this.audit.record({
          action: "attendance.policy.create",
          resourceType: "attendance_policy",
          resourceId: row.id,
          after: row,
        });
        return row;
      } catch (e) {
        if (isUniqueViolation(e))
          throw new ConflictException({ code: "attendance.policy.conflict_name" });
        throw e;
      }
    });
  }

  async update(id: string, body: UpdatePolicyBodyT): Promise<unknown> {
    const before = await this.get(id);
    const orgId = currentOrganizationId();
    if (!orgId) throw new Error("no active tenant context");
    return this.prisma.db.$transaction(async (tx) => {
      if (body.isDefault) await this.unsetExistingDefault(tx, orgId, id);
      try {
        const row = await tx.attendancePolicy.update({
          where: { id },
          data: body,
        });
        await this.audit.record({
          action: "attendance.policy.update",
          resourceType: "attendance_policy",
          resourceId: id,
          before,
          after: row,
        });
        return row;
      } catch (e) {
        if (isUniqueViolation(e))
          throw new ConflictException({ code: "attendance.policy.conflict_name" });
        throw e;
      }
    });
  }

  async remove(id: string): Promise<void> {
    const before = await this.get(id);
    await this.prisma.db.attendancePolicy.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
    await this.audit.record({
      action: "attendance.policy.delete",
      resourceType: "attendance_policy",
      resourceId: id,
      before,
    });
  }

  private async unsetExistingDefault(
    tx: Prisma.TransactionClient,
    organizationId: string,
    exceptId?: string,
  ): Promise<void> {
    await tx.attendancePolicy.updateMany({
      where: {
        organizationId,
        isDefault: true,
        deletedAt: null,
        ...(exceptId ? { id: { not: exceptId } } : {}),
      },
      data: { isDefault: false },
    });
  }
}
