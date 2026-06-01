import { Injectable } from "@nestjs/common";
import { PrismaService } from "../infra/prisma/prisma.service";

/**
 * Resolves a user's effective permission set from `user_roles → role_permissions`.
 * Queries the raw (non-tenant-scoped) Prisma client because the `user_roles`
 * table is tenant-scoped at the row level and we're loading by `userId` (PK is
 * unique). The tenant extension's where-merge does not interfere with the
 * compound primary key lookups we use here.
 */
@Injectable()
export class PermissionsService {
  constructor(private readonly prisma: PrismaService) {}

  async loadUserPermissions(userId: string): Promise<Set<string>> {
    const userRoles = await this.prisma.db.userRole.findMany({
      where: { userId },
      select: {
        role: {
          select: {
            rolePermissions: { select: { permissionKey: true } },
          },
        },
      },
    });
    const keys = new Set<string>();
    for (const ur of userRoles) {
      for (const rp of ur.role.rolePermissions) keys.add(rp.permissionKey);
    }
    return keys;
  }

  async loadUserRoles(userId: string): Promise<string[]> {
    const userRoles = await this.prisma.db.userRole.findMany({
      where: { userId },
      select: { role: { select: { key: true } } },
    });
    return userRoles.map((ur) => ur.role.key);
  }
}
