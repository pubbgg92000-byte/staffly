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
import { isUniqueViolation } from "./departments.service";
import { currentOrganizationId } from "../tenant/tenant-context";
import type { CreateDesignationBodyT, UpdateDesignationBodyT } from "./dto";

@Injectable()
export class DesignationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(q: PaginationQueryT): Promise<Page<unknown>> {
    const where: Prisma.DesignationWhereInput = { deletedAt: null };
    if (q.search) where.name = { contains: q.search, mode: "insensitive" };
    const sortBy =
      q.sortBy && ["name", "level", "createdAt"].includes(q.sortBy)
        ? q.sortBy
        : "name";
    const [items, total] = await Promise.all([
      this.prisma.db.designation.findMany({
        where,
        orderBy: { [sortBy]: q.sortDir },
        ...skipTake(q),
      }),
      this.prisma.db.designation.count({ where }),
    ]);
    return pageOf(items, total, q);
  }

  async get(id: string): Promise<unknown> {
    const row = await this.prisma.db.designation.findFirst({
      where: { id, deletedAt: null },
    });
    if (!row) throw new NotFoundException({ code: "designation.not_found" });
    return row;
  }

  async create(body: CreateDesignationBodyT): Promise<unknown> {
    const orgId = currentOrganizationId();
    if (!orgId) throw new Error("no active tenant context");
    const data: Prisma.DesignationUncheckedCreateInput = {
      ...body,
      organizationId: orgId,
    };
    try {
      const row = await this.prisma.db.designation.create({ data });
      await this.audit.record({
        action: "designation.create",
        resourceType: "designation",
        resourceId: row.id,
        after: row,
      });
      return row;
    } catch (e) {
      if (isUniqueViolation(e)) {
        throw new ConflictException({ code: "designation.conflict_name" });
      }
      throw e;
    }
  }

  async update(id: string, body: UpdateDesignationBodyT): Promise<unknown> {
    const before = await this.get(id);
    try {
      const row = await this.prisma.db.designation.update({
        where: { id },
        data: body,
      });
      await this.audit.record({
        action: "designation.update",
        resourceType: "designation",
        resourceId: id,
        before,
        after: row,
      });
      return row;
    } catch (e) {
      if (isUniqueViolation(e)) {
        throw new ConflictException({ code: "designation.conflict_name" });
      }
      throw e;
    }
  }

  async remove(id: string): Promise<void> {
    const before = await this.get(id);
    await this.prisma.db.designation.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
    await this.audit.record({
      action: "designation.delete",
      resourceType: "designation",
      resourceId: id,
      before,
    });
  }
}
