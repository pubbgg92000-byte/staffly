import {
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import { PrismaService } from "../infra/prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import { pageOf, skipTake, type PaginationQueryT, type Page } from "../common/pagination";
import { currentOrganizationId } from "../tenant/tenant-context";
import type {
  CreateDepartmentBodyT,
  UpdateDepartmentBodyT,
} from "./dto";

function requireOrg(): string {
  const id = currentOrganizationId();
  if (!id) throw new Error("no active tenant context");
  return id;
}

@Injectable()
export class DepartmentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(q: PaginationQueryT): Promise<Page<unknown>> {
    const where: Prisma.DepartmentWhereInput = { deletedAt: null };
    if (q.search) where.name = { contains: q.search, mode: "insensitive" };
    const sortBy = q.sortBy && ["name", "createdAt"].includes(q.sortBy) ? q.sortBy : "name";
    const [items, total] = await Promise.all([
      this.prisma.db.department.findMany({
        where,
        orderBy: { [sortBy]: q.sortDir },
        ...skipTake(q),
      }),
      this.prisma.db.department.count({ where }),
    ]);
    return pageOf(items, total, q);
  }

  async get(id: string): Promise<unknown> {
    const row = await this.prisma.db.department.findFirst({
      where: { id, deletedAt: null },
    });
    if (!row) throw new NotFoundException({ code: "department.not_found" });
    return row;
  }

  async create(body: CreateDepartmentBodyT): Promise<unknown> {
    const data: Prisma.DepartmentUncheckedCreateInput = {
      ...body,
      organizationId: requireOrg(),
    };
    try {
      const row = await this.prisma.db.department.create({ data });
      await this.audit.record({
        action: "department.create",
        resourceType: "department",
        resourceId: row.id,
        after: row,
      });
      return row;
    } catch (e) {
      if (isUniqueViolation(e)) {
        throw new ConflictException({ code: "department.conflict_name_or_code" });
      }
      throw e;
    }
  }

  async update(id: string, body: UpdateDepartmentBodyT): Promise<unknown> {
    const before = await this.get(id);
    try {
      const row = await this.prisma.db.department.update({
        where: { id },
        data: body,
      });
      await this.audit.record({
        action: "department.update",
        resourceType: "department",
        resourceId: id,
        before,
        after: row,
      });
      return row;
    } catch (e) {
      if (isUniqueViolation(e)) {
        throw new ConflictException({ code: "department.conflict_name_or_code" });
      }
      throw e;
    }
  }

  async remove(id: string): Promise<void> {
    const before = await this.get(id);
    await this.prisma.db.department.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
    await this.audit.record({
      action: "department.delete",
      resourceType: "department",
      resourceId: id,
      before,
    });
  }
}

export function isUniqueViolation(e: unknown): boolean {
  return (
    typeof e === "object" &&
    e !== null &&
    "code" in e &&
    (e as { code: unknown }).code === "P2002"
  );
}
