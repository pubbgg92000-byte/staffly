import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import { PrismaService } from "../infra/prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import { isUniqueViolation } from "../org-structure/departments.service";
import { currentOrganizationId } from "../tenant/tenant-context";
import { pageOf, skipTake, type Page } from "../common/pagination";
import type {
  CategoryListQueryT,
  CreateCategoryBodyT,
  UpdateCategoryBodyT,
} from "./dto";

function requireOrg(): string {
  const id = currentOrganizationId();
  if (!id) throw new Error("no active tenant context");
  return id;
}

@Injectable()
export class DocumentCategoriesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(q: CategoryListQueryT): Promise<Page<unknown>> {
    const where: Prisma.DocumentCategoryWhereInput = q.includeArchived
      ? {}
      : { deletedAt: null };
    if (q.search) where.name = { contains: q.search, mode: "insensitive" };
    if (q.isActive !== undefined) where.isActive = q.isActive;
    if (q.isPersonal !== undefined) where.isPersonal = q.isPersonal;
    const [items, total] = await Promise.all([
      this.prisma.db.documentCategory.findMany({
        where,
        orderBy: [{ isActive: "desc" }, { name: "asc" }],
        ...skipTake(q),
      }),
      this.prisma.db.documentCategory.count({ where }),
    ]);
    return pageOf(items, total, q);
  }

  async get(id: string): Promise<unknown> {
    const row = await this.prisma.db.documentCategory.findFirst({
      where: { id, deletedAt: null },
    });
    if (!row)
      throw new NotFoundException({ code: "document.category.not_found" });
    return row;
  }

  async create(body: CreateCategoryBodyT): Promise<unknown> {
    const orgId = requireOrg();
    try {
      const row = await this.prisma.db.documentCategory.create({
        data: {
          organizationId: orgId,
          name: body.name,
          code: body.code ?? null,
          color: body.color ?? "#94A3B8",
          description: body.description ?? null,
          isActive: body.isActive ?? true,
          isPersonal: body.isPersonal ?? false,
        },
      });
      await this.audit.record({
        action: "document.category.create",
        resourceType: "document_category",
        resourceId: row.id,
        after: row,
      });
      return row;
    } catch (e) {
      if (isUniqueViolation(e))
        throw new ConflictException({
          code: "document.category.conflict_name_or_code",
        });
      throw e;
    }
  }

  async update(id: string, body: UpdateCategoryBodyT): Promise<unknown> {
    const before = await this.prisma.db.documentCategory.findFirst({
      where: { id, deletedAt: null },
    });
    if (!before)
      throw new NotFoundException({ code: "document.category.not_found" });
    try {
      const row = await this.prisma.db.documentCategory.update({
        where: { id },
        data: {
          name: body.name,
          code: body.code,
          color: body.color,
          description: body.description,
          isActive: body.isActive,
          isPersonal: body.isPersonal,
        },
      });
      await this.audit.record({
        action: "document.category.update",
        resourceType: "document_category",
        resourceId: id,
        before,
        after: row,
      });
      return row;
    } catch (e) {
      if (isUniqueViolation(e))
        throw new ConflictException({
          code: "document.category.conflict_name_or_code",
        });
      throw e;
    }
  }

  async remove(id: string): Promise<void> {
    const before = await this.prisma.db.documentCategory.findFirst({
      where: { id, deletedAt: null },
    });
    if (!before)
      throw new NotFoundException({ code: "document.category.not_found" });
    if (before.isSystem)
      throw new BadRequestException({
        code: "document.category.system_undeletable",
      });
    const used = await this.prisma.db.document.count({
      where: { categoryId: id, deletedAt: null },
    });
    if (used > 0)
      throw new ConflictException({
        code: "document.category.in_use",
        meta: { documentCount: used },
      });
    await this.prisma.db.documentCategory.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
    await this.audit.record({
      action: "document.category.delete",
      resourceType: "document_category",
      resourceId: id,
      before,
    });
  }

  async restore(id: string): Promise<unknown> {
    const before = await this.prisma.db.documentCategory.findFirst({
      where: { id, deletedAt: { not: null } },
    });
    if (!before)
      throw new NotFoundException({ code: "document.category.not_found" });
    try {
      const row = await this.prisma.db.documentCategory.update({
        where: { id },
        data: { deletedAt: null },
      });
      await this.audit.record({
        action: "document.category.restore",
        resourceType: "document_category",
        resourceId: id,
        before,
        after: row,
      });
      return row;
    } catch (e) {
      if (isUniqueViolation(e)) {
        throw new ConflictException({
          code: "document.category.conflict_name_or_code",
        });
      }
      throw e;
    }
  }
}
