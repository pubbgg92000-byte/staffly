import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import { PrismaService } from "../infra/prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import { pageOf, skipTake, type Page } from "../common/pagination";
import { currentOrganizationId } from "../tenant/tenant-context";
import { isUniqueViolation } from "../org-structure/departments.service";
import type { CreateRoleBodyT, RoleListQueryT, UpdateRoleBodyT } from "./dto";

function slugify(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 40);
}

function requireOrg(): string {
  const id = currentOrganizationId();
  if (!id) throw new Error("no active tenant context");
  return id;
}

@Injectable()
export class RolesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(q: RoleListQueryT): Promise<Page<unknown>> {
    const where: Prisma.RoleWhereInput = { deletedAt: null };
    if (q.search) where.name = { contains: q.search, mode: "insensitive" };

    const [items, total] = await Promise.all([
      this.prisma.db.role.findMany({
        where,
        orderBy: [{ isSystem: "desc" }, { name: "asc" }],
        ...skipTake(q),
        select: {
          id: true,
          key: true,
          name: true,
          description: true,
          isSystem: true,
          createdAt: true,
          updatedAt: true,
          _count: { select: { userRoles: true, rolePermissions: true } },
        },
      }),
      this.prisma.db.role.count({ where }),
    ]);

    const shaped = items.map((r) => ({
      id: r.id,
      key: r.key,
      name: r.name,
      description: r.description,
      isSystem: r.isSystem,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
      userCount: r._count.userRoles,
      permissionCount: r._count.rolePermissions,
    }));

    return pageOf(shaped, total, q);
  }

  async get(id: string): Promise<unknown> {
    const row = await this.prisma.db.role.findFirst({
      where: { id, deletedAt: null },
      select: {
        id: true,
        key: true,
        name: true,
        description: true,
        isSystem: true,
        createdAt: true,
        updatedAt: true,
        rolePermissions: {
          select: { permissionKey: true, scope: true },
          orderBy: { permissionKey: "asc" },
        },
        _count: { select: { userRoles: true } },
      },
    });
    if (!row) throw new NotFoundException({ code: "role.not_found" });
    return {
      ...row,
      permissions: row.rolePermissions.map((rp) => ({
        key: rp.permissionKey,
        scope: rp.scope,
      })),
      userCount: row._count.userRoles,
      rolePermissions: undefined,
      _count: undefined,
    };
  }

  async create(body: CreateRoleBodyT): Promise<unknown> {
    const orgId = requireOrg();
    await this.validatePermissionKeys(body.permissions);

    const key = slugify(body.name);
    if (!key) throw new BadRequestException({ code: "role.invalid_name" });

    try {
      const row = await this.prisma.db.role.create({
        data: {
          organizationId: orgId,
          key,
          name: body.name,
          description: body.description ?? null,
          isSystem: false,
          rolePermissions: {
            create: body.permissions.map((pk) => ({
              organizationId: orgId,
              permissionKey: pk,
            })),
          },
        },
        select: { id: true, key: true, name: true, isSystem: true },
      });
      await this.audit.record({
        action: "role.create",
        resourceType: "role",
        resourceId: row.id,
        after: row,
      });
      return this.get(row.id);
    } catch (e) {
      if (isUniqueViolation(e)) {
        throw new ConflictException({ code: "role.conflict_key" });
      }
      throw e;
    }
  }

  async update(id: string, body: UpdateRoleBodyT): Promise<unknown> {
    const row = await this.prisma.db.role.findFirst({
      where: { id, deletedAt: null },
    });
    if (!row) throw new NotFoundException({ code: "role.not_found" });

    if (body.permissions !== undefined) {
      await this.validatePermissionKeys(body.permissions);
    }

    const orgId = requireOrg();

    try {
      await this.prisma.db.$transaction(async (tx) => {
        await tx.role.update({
          where: { id },
          data: {
            name: body.name ?? undefined,
            description: body.description ?? undefined,
          },
        });

        if (body.permissions !== undefined) {
          // Replace permission set atomically.
          await tx.rolePermission.deleteMany({ where: { roleId: id } });
          if (body.permissions.length > 0) {
            await tx.rolePermission.createMany({
              data: body.permissions.map((pk) => ({
                organizationId: orgId,
                roleId: id,
                permissionKey: pk,
              })),
              skipDuplicates: true,
            });
          }
        }
      });

      await this.audit.record({
        action: "role.update",
        resourceType: "role",
        resourceId: id,
        before: row,
        after: body,
      });

      return this.get(id);
    } catch (e) {
      if (isUniqueViolation(e)) {
        throw new ConflictException({ code: "role.conflict_key" });
      }
      throw e;
    }
  }

  async remove(id: string): Promise<void> {
    const row = await this.prisma.db.role.findFirst({
      where: { id, deletedAt: null },
      include: { _count: { select: { userRoles: true } } },
    });
    if (!row) throw new NotFoundException({ code: "role.not_found" });
    if (row.isSystem) {
      throw new BadRequestException({ code: "role.system_undeletable" });
    }
    if (row._count.userRoles > 0) {
      throw new ConflictException({
        code: "role.in_use",
        meta: { userCount: row._count.userRoles },
      } as object);
    }

    await this.prisma.db.role.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
    await this.audit.record({
      action: "role.delete",
      resourceType: "role",
      resourceId: id,
      before: row,
    });
  }

  private async validatePermissionKeys(keys: string[]): Promise<void> {
    if (keys.length === 0) return;
    const found = await this.prisma.db.permission.findMany({
      where: { key: { in: keys } },
      select: { key: true },
    });
    const foundSet = new Set(found.map((p) => p.key));
    const missing = keys.filter((k) => !foundSet.has(k));
    if (missing.length > 0) {
      throw new BadRequestException({
        code: "role.unknown_permissions",
        meta: { missing },
      } as object);
    }
  }
}
