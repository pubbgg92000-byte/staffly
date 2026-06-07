import { Injectable, Logger, NotFoundException } from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import { PrismaService } from "../infra/prisma/prisma.service";
import { currentTenant } from "../tenant/tenant-context";
import { pageOf, skipTake, type Page } from "../common/pagination";
import { redact } from "./redact";
import type { AuditLogListQueryT } from "./dto";

export interface AuditWrite {
  action: string; // e.g. "employee.create"
  resourceType: string; // e.g. "employee"
  resourceId?: string | null;
  before?: unknown;
  after?: unknown;
  metadata?: Record<string, unknown>;
}

interface AuditLogSummary {
  id: string;
  action: string;
  resourceType: string;
  resourceId: string | null;
  actorUserId: string | null;
  actorIp: string | null;
  actorName: string | null;
  actorEmail: string | null;
  createdAt: Date;
}

interface AuditLogDetail extends AuditLogSummary {
  before: unknown;
  after: unknown;
  metadata: unknown;
}

/**
 * Writes audit_logs rows scoped to the active tenant. Tolerates failures —
 * an audit write must never block a domain operation in v0.3 (later we can
 * make critical actions hard-fail on audit failure).
 */
@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(private readonly prisma: PrismaService) {}

  async record(w: AuditWrite, ip?: string | null): Promise<void> {
    const ctx = currentTenant();
    if (!ctx?.organizationId) return; // unauth flow — nothing to scope to
    try {
      await this.prisma.db.auditLog.create({
        data: {
          organizationId: ctx.organizationId,
          actorUserId: ctx.userId ?? null,
          actorIp: ip ?? null,
          action: w.action,
          resourceType: w.resourceType,
          resourceId: w.resourceId ?? null,
          before: w.before === undefined ? undefined : (w.before as object),
          after: w.after === undefined ? undefined : (w.after as object),
          metadata: (w.metadata ?? {}) as object,
        },
      });
    } catch (err) {
      this.logger.warn(
        `audit write failed for ${w.action}: ${(err as Error).message}`,
      );
    }
  }

  async list(q: AuditLogListQueryT): Promise<Page<AuditLogSummary>> {
    const where: Prisma.AuditLogWhereInput = {};
    if (q.action) where.action = q.action;
    if (q.resourceType) where.resourceType = q.resourceType;
    if (q.actorUserId) where.actorUserId = q.actorUserId;
    if (q.resourceId) where.resourceId = q.resourceId;
    if (q.from || q.to) {
      where.createdAt = {
        ...(q.from ? { gte: new Date(q.from) } : {}),
        ...(q.to ? { lte: new Date(q.to) } : {}),
      };
    }
    if (q.search) {
      where.OR = [
        { action: { contains: q.search, mode: "insensitive" } },
        { resourceType: { contains: q.search, mode: "insensitive" } },
      ];
    }

    const [rows, total] = await Promise.all([
      this.prisma.db.auditLog.findMany({
        where,
        orderBy: { createdAt: q.sortDir },
        ...skipTake(q),
        select: {
          id: true,
          action: true,
          resourceType: true,
          resourceId: true,
          actorUserId: true,
          actorIp: true,
          createdAt: true,
        },
      }),
      this.prisma.db.auditLog.count({ where }),
    ]);

    const actors = await this.resolveActors(
      rows.map((r) => r.actorUserId).filter((v): v is string => v !== null),
    );
    const items = rows.map((r) => ({
      ...r,
      actorName: r.actorUserId
        ? (actors.get(r.actorUserId)?.name ?? null)
        : null,
      actorEmail: r.actorUserId
        ? (actors.get(r.actorUserId)?.email ?? null)
        : null,
    }));
    return pageOf(items, total, q);
  }

  async get(id: string): Promise<AuditLogDetail> {
    const row = await this.prisma.db.auditLog.findFirst({
      where: { id },
      select: {
        id: true,
        action: true,
        resourceType: true,
        resourceId: true,
        actorUserId: true,
        actorIp: true,
        createdAt: true,
        before: true,
        after: true,
        metadata: true,
      },
    });
    if (!row) throw new NotFoundException({ code: "audit.not_found" });

    const actors = row.actorUserId
      ? await this.resolveActors([row.actorUserId])
      : new Map<string, { name: string | null; email: string }>();
    const actor = row.actorUserId ? actors.get(row.actorUserId) : undefined;

    return {
      id: row.id,
      action: row.action,
      resourceType: row.resourceType,
      resourceId: row.resourceId,
      actorUserId: row.actorUserId,
      actorIp: row.actorIp,
      createdAt: row.createdAt,
      actorName: actor?.name ?? null,
      actorEmail: actor?.email ?? null,
      before: redact(row.before),
      after: redact(row.after),
      metadata: redact(row.metadata),
    };
  }

  /**
   * actor_user_id has no FK/relation, so resolve names in a batch. Name comes
   * from the linked Employee (display_name); email from the User row.
   */
  private async resolveActors(
    userIds: string[],
  ): Promise<Map<string, { name: string | null; email: string }>> {
    const result = new Map<string, { name: string | null; email: string }>();
    const unique = [...new Set(userIds)];
    if (unique.length === 0) return result;

    const [users, employees] = await Promise.all([
      this.prisma.db.user.findMany({
        where: { id: { in: unique } },
        select: { id: true, email: true },
      }),
      this.prisma.db.employee.findMany({
        where: { userId: { in: unique } },
        select: { userId: true, displayName: true },
      }),
    ]);
    const nameByUserId = new Map(
      employees
        .filter((e): e is { userId: string; displayName: string } =>
          Boolean(e.userId),
        )
        .map((e) => [e.userId, e.displayName]),
    );
    for (const u of users) {
      result.set(u.id, {
        name: nameByUserId.get(u.id) ?? null,
        email: u.email,
      });
    }
    return result;
  }
}
