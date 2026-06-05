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
import type { CreateLocationBodyT, UpdateLocationBodyT } from "./dto";

@Injectable()
export class LocationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(q: PaginationQueryT): Promise<Page<unknown>> {
    const where: Prisma.LocationWhereInput = q.includeArchived
      ? {}
      : { deletedAt: null };
    if (q.search) {
      where.OR = [
        { name: { contains: q.search, mode: "insensitive" } },
        { city: { contains: q.search, mode: "insensitive" } },
      ];
    }
    const sortBy =
      q.sortBy && ["name", "city", "createdAt"].includes(q.sortBy)
        ? q.sortBy
        : "name";
    const [items, total] = await Promise.all([
      this.prisma.db.location.findMany({
        where,
        orderBy: { [sortBy]: q.sortDir },
        ...skipTake(q),
      }),
      this.prisma.db.location.count({ where }),
    ]);
    return pageOf(items, total, q);
  }

  async get(id: string): Promise<unknown> {
    const row = await this.prisma.db.location.findFirst({
      where: { id, deletedAt: null },
    });
    if (!row) throw new NotFoundException({ code: "location.not_found" });
    return row;
  }

  async create(body: CreateLocationBodyT): Promise<unknown> {
    const orgId = currentOrganizationId();
    if (!orgId) throw new Error("no active tenant context");
    const data: Prisma.LocationUncheckedCreateInput = {
      ...body,
      organizationId: orgId,
    };
    try {
      const row = await this.prisma.db.location.create({ data });
      await this.audit.record({
        action: "location.create",
        resourceType: "location",
        resourceId: row.id,
        after: row,
      });
      return row;
    } catch (e) {
      if (isUniqueViolation(e)) {
        throw new ConflictException({ code: "location.conflict_name" });
      }
      throw e;
    }
  }

  async update(id: string, body: UpdateLocationBodyT): Promise<unknown> {
    const before = await this.get(id);
    try {
      const row = await this.prisma.db.location.update({
        where: { id },
        data: body,
      });
      await this.audit.record({
        action: "location.update",
        resourceType: "location",
        resourceId: id,
        before,
        after: row,
      });
      return row;
    } catch (e) {
      if (isUniqueViolation(e)) {
        throw new ConflictException({ code: "location.conflict_name" });
      }
      throw e;
    }
  }

  async remove(id: string): Promise<void> {
    const before = await this.get(id);
    await this.prisma.db.location.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
    await this.audit.record({
      action: "location.delete",
      resourceType: "location",
      resourceId: id,
      before,
    });
  }

  async restore(id: string): Promise<unknown> {
    const before = await this.prisma.db.location.findFirst({
      where: { id, deletedAt: { not: null } },
    });
    if (!before) throw new NotFoundException({ code: "location.not_found" });
    try {
      const row = await this.prisma.db.location.update({
        where: { id },
        data: { deletedAt: null },
      });
      await this.audit.record({
        action: "location.restore",
        resourceType: "location",
        resourceId: id,
        before,
        after: row,
      });
      return row;
    } catch (e) {
      if (isUniqueViolation(e)) {
        throw new ConflictException({ code: "location.conflict_name" });
      }
      throw e;
    }
  }
}
