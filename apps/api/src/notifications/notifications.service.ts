import { Injectable, NotFoundException } from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import { PrismaService } from "../infra/prisma/prisma.service";
import { pageOf, skipTake, type Page } from "../common/pagination";
import type { MyNotificationsQueryT } from "./dto";

export interface NotificationSummary {
  id: string;
  templateId: string;
  payload: unknown;
  linkTo: string | null;
  priority: "low" | "normal" | "high";
  readAt: Date | null;
  createdAt: Date;
}

/**
 * Reads a user's own in-app notifications.
 *
 * The Prisma tenant extension already scopes every query to the active
 * organization; this service ALSO filters by `userId` on every read and
 * mutation so a user can never see or touch another user's notifications
 * within the same tenant. All endpoints are self-scoped — there is no
 * notification.* permission.
 */
@Injectable()
export class NotificationsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(
    userId: string,
    q: MyNotificationsQueryT,
  ): Promise<Page<NotificationSummary>> {
    const where: Prisma.NotificationWhereInput = { userId };
    if (q.unreadOnly) where.readAt = null;

    const [items, total] = await Promise.all([
      this.prisma.db.notification.findMany({
        where,
        orderBy: { createdAt: q.sortDir },
        ...skipTake(q),
        select: {
          id: true,
          templateId: true,
          payload: true,
          linkTo: true,
          priority: true,
          readAt: true,
          createdAt: true,
        },
      }),
      this.prisma.db.notification.count({ where }),
    ]);
    return pageOf(items, total, q);
  }

  async unreadCount(userId: string): Promise<{ count: number }> {
    const count = await this.prisma.db.notification.count({
      where: { userId, readAt: null },
    });
    return { count };
  }

  /**
   * Mark a single notification read. 404 if it does not exist, belongs to
   * another user, or belongs to another tenant — the latter two are
   * indistinguishable from "not found" by design (no cross-user probing).
   * Idempotent: re-reading an already-read notification preserves its
   * original `readAt`.
   */
  async markRead(userId: string, id: string): Promise<void> {
    const row = await this.prisma.db.notification.findFirst({
      where: { id, userId },
      select: { id: true },
    });
    if (!row) throw new NotFoundException({ code: "notification.not_found" });
    // Atomic + idempotent: a zero-row update (already read, or deleted in the
    // gap after the existence check) is a silent no-op, so there is no P2025
    // race that would surface as a 500. The `readAt: null` guard preserves the
    // original read time on repeat calls, and `userId` keeps the mutation
    // self-scoped on top of the tenant extension.
    await this.prisma.db.notification.updateMany({
      where: { id, userId, readAt: null },
      data: { readAt: new Date() },
    });
  }

  /** Mark all of the user's unread notifications read. Idempotent. */
  async markAllRead(userId: string): Promise<void> {
    await this.prisma.db.notification.updateMany({
      where: { userId, readAt: null },
      data: { readAt: new Date() },
    });
  }
}
