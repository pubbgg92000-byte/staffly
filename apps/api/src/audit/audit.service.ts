import { Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "../infra/prisma/prisma.service";
import { currentTenant } from "../tenant/tenant-context";

export interface AuditWrite {
  action: string; // e.g. "employee.create"
  resourceType: string; // e.g. "employee"
  resourceId?: string | null;
  before?: unknown;
  after?: unknown;
  metadata?: Record<string, unknown>;
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
}
