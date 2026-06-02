import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import { PrismaService } from "../infra/prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import { currentOrganizationId } from "../tenant/tenant-context";
import { pageOf, skipTake, type Page } from "../common/pagination";
import {
  AudienceResolverService,
  type AudienceRule,
} from "./audience-resolver.service";
import type {
  AcknowledgementsQueryT,
  AnnouncementListQueryT,
  AudienceItemT,
  AudiencePreviewBodyT,
  CreateAnnouncementBodyT,
  MyAnnouncementsQueryT,
  PublishAnnouncementBodyT,
  UpdateAnnouncementBodyT,
} from "./dto";

interface ActorCtx {
  userId: string;
  organizationId: string;
}

function requireOrg(): string {
  const id = currentOrganizationId();
  if (!id) throw new Error("no active tenant context");
  return id;
}

function audienceItemsToRules(items: AudienceItemT[]): AudienceRule[] {
  return items.map((i) => ({
    audienceType: i.type,
    departmentId: i.departmentId ?? null,
    designationId: i.designationId ?? null,
    locationId: i.locationId ?? null,
    employmentType: i.employmentType ?? null,
    employeeId: i.employeeId ?? null,
  }));
}

/**
 * Service for the Announcements module — see docs/03 §10.
 *
 * Lifecycle:
 *   draft → published (immediate) | scheduled (deferred)
 *   scheduled → published (cron flips on/after scheduledFor) | draft (un-schedule)
 *   any → archived (soft hide)
 *
 * Audience is resolved at *publish* time and notifications are fanned out
 * synchronously. The roadmap calls for a BullMQ worker for emails later;
 * the in-app `Notification` rows are written here so the bell counter works
 * the moment publish returns.
 */
@Injectable()
export class AnnouncementsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly resolver: AudienceResolverService,
  ) {}

  // ─── Read ───────────────────────────────────────────────────────────

  async list(q: AnnouncementListQueryT): Promise<Page<unknown>> {
    const where: Prisma.AnnouncementWhereInput = { deletedAt: null };
    if (q.status) where.status = q.status;
    if (q.search) where.title = { contains: q.search, mode: "insensitive" };

    const orderBy: Prisma.AnnouncementOrderByWithRelationInput[] = [];
    if (q.pinnedFirst) orderBy.push({ pinned: "desc" });
    orderBy.push({ [q.sortBy]: q.sortDir });

    const [items, total] = await Promise.all([
      this.prisma.db.announcement.findMany({
        where,
        orderBy,
        ...skipTake(q),
        include: {
          audiences: true,
          _count: { select: { acknowledgements: true } },
        },
      }),
      this.prisma.db.announcement.count({ where }),
    ]);
    return pageOf(items, total, q);
  }

  async get(id: string): Promise<unknown> {
    const row = await this.prisma.db.announcement.findFirst({
      where: { id, deletedAt: null },
      include: {
        audiences: true,
        _count: { select: { acknowledgements: true } },
      },
    });
    if (!row) throw new NotFoundException({ code: "announcement.not_found" });
    return row;
  }

  // ─── Create / update ────────────────────────────────────────────────

  async create(
    actor: ActorCtx,
    body: CreateAnnouncementBodyT,
  ): Promise<unknown> {
    this.assertSchedulingCoherent(body.scheduledFor, body.expiresAt);
    const orgId = requireOrg();

    const row = await this.prisma.db.$transaction(
      async (tx: Prisma.TransactionClient) => {
        const ann = await tx.announcement.create({
          data: {
            organizationId: orgId,
            title: body.title,
            bodyHtml: body.bodyHtml,
            coverImageUrl: body.coverImageUrl ?? null,
            pinned: body.pinned ?? false,
            requiresAcknowledgment: body.requiresAcknowledgment ?? false,
            priority: body.priority ?? "normal",
            scheduledFor: body.scheduledFor
              ? new Date(body.scheduledFor)
              : null,
            expiresAt: body.expiresAt ? new Date(body.expiresAt) : null,
            createdBy: actor.userId,
            updatedBy: actor.userId,
            status: "draft",
          },
        });
        await this.writeAudiences(tx, orgId, ann.id, body.audiences);
        return tx.announcement.findFirstOrThrow({
          where: { id: ann.id },
          include: {
            audiences: true,
            _count: { select: { acknowledgements: true } },
          },
        });
      },
    );
    await this.audit.record({
      action: "announcement.create",
      resourceType: "announcement",
      resourceId: row.id,
      after: row,
    });
    return row;
  }

  async update(
    actor: ActorCtx,
    id: string,
    body: UpdateAnnouncementBodyT,
  ): Promise<unknown> {
    const before = await this.prisma.db.announcement.findFirst({
      where: { id, deletedAt: null },
      include: { audiences: true },
    });
    if (!before)
      throw new NotFoundException({ code: "announcement.not_found" });
    if (before.status === "archived")
      throw new ConflictException({ code: "announcement.archived" });

    if (body.scheduledFor !== undefined || body.expiresAt !== undefined) {
      this.assertSchedulingCoherent(
        body.scheduledFor === undefined
          ? before.scheduledFor?.toISOString()
          : body.scheduledFor,
        body.expiresAt === undefined
          ? before.expiresAt?.toISOString()
          : body.expiresAt,
      );
    }

    const orgId = requireOrg();
    const row = await this.prisma.db.$transaction(
      async (tx: Prisma.TransactionClient) => {
        const data: Prisma.AnnouncementUpdateInput = {
          updatedBy: actor.userId,
        };
        if (body.title !== undefined) data.title = body.title;
        if (body.bodyHtml !== undefined) data.bodyHtml = body.bodyHtml;
        if (body.coverImageUrl !== undefined)
          data.coverImageUrl = body.coverImageUrl;
        if (body.pinned !== undefined) data.pinned = body.pinned;
        if (body.requiresAcknowledgment !== undefined)
          data.requiresAcknowledgment = body.requiresAcknowledgment;
        if (body.priority !== undefined) data.priority = body.priority;
        if (body.scheduledFor !== undefined)
          data.scheduledFor = body.scheduledFor
            ? new Date(body.scheduledFor)
            : null;
        if (body.expiresAt !== undefined)
          data.expiresAt = body.expiresAt ? new Date(body.expiresAt) : null;

        // If the announcement was already in "scheduled" state and someone
        // clears scheduledFor, drop back to draft.
        if (
          body.scheduledFor === null &&
          before.status === "scheduled" &&
          before.publishedAt === null
        ) {
          data.status = "draft";
        }

        await tx.announcement.update({ where: { id }, data });
        if (body.audiences) {
          await tx.announcementAudience.deleteMany({
            where: { announcementId: id },
          });
          await this.writeAudiences(tx, orgId, id, body.audiences);
        }
        return tx.announcement.findFirstOrThrow({
          where: { id },
          include: {
            audiences: true,
            _count: { select: { acknowledgements: true } },
          },
        });
      },
    );
    await this.audit.record({
      action: "announcement.update",
      resourceType: "announcement",
      resourceId: id,
      before,
      after: row,
    });
    return row;
  }

  // ─── Publish / schedule / archive ───────────────────────────────────

  /**
   * `scheduledFor` in body → set state to `scheduled` (deferred publish).
   * Otherwise publish immediately.
   *
   * On immediate publish: audience is resolved and a `Notification` row is
   * created for each recipient that has a linked user account. Re-publishing
   * an already-published announcement is a no-op (returns the current row).
   */
  async publish(
    actor: ActorCtx,
    id: string,
    body: PublishAnnouncementBodyT,
  ): Promise<unknown> {
    const before = await this.prisma.db.announcement.findFirst({
      where: { id, deletedAt: null },
      include: { audiences: true },
    });
    if (!before)
      throw new NotFoundException({ code: "announcement.not_found" });
    if (before.status === "archived")
      throw new ConflictException({ code: "announcement.archived" });

    if (body?.scheduledFor) {
      const when = new Date(body.scheduledFor);
      this.assertSchedulingCoherent(
        body.scheduledFor,
        before.expiresAt?.toISOString(),
      );
      const row = await this.prisma.db.announcement.update({
        where: { id },
        data: {
          status: "scheduled",
          scheduledFor: when,
          publishedAt: null,
          updatedBy: actor.userId,
        },
        include: {
          audiences: true,
          _count: { select: { acknowledgements: true } },
        },
      });
      await this.audit.record({
        action: "announcement.schedule",
        resourceType: "announcement",
        resourceId: id,
        before,
        after: row,
        metadata: { scheduledFor: when.toISOString() },
      });
      return row;
    }

    if (before.status === "published") return this.get(id);

    return this.publishNow(actor, id);
  }

  async archive(actor: ActorCtx, id: string): Promise<unknown> {
    const before = await this.prisma.db.announcement.findFirst({
      where: { id, deletedAt: null },
    });
    if (!before)
      throw new NotFoundException({ code: "announcement.not_found" });
    if (before.status === "archived") return before;

    const row = await this.prisma.db.announcement.update({
      where: { id },
      data: { status: "archived", updatedBy: actor.userId },
    });
    await this.audit.record({
      action: "announcement.archive",
      resourceType: "announcement",
      resourceId: id,
      before,
      after: row,
    });
    return row;
  }

  // ─── Acknowledgements ───────────────────────────────────────────────

  /**
   * Idempotent: a second call by the same employee for the same announcement
   * returns the existing row instead of throwing.
   */
  async acknowledge(actor: ActorCtx, id: string): Promise<unknown> {
    const ann = await this.prisma.db.announcement.findFirst({
      where: { id, deletedAt: null },
      select: {
        id: true,
        organizationId: true,
        status: true,
        requiresAcknowledgment: true,
        publishedAt: true,
      },
    });
    if (!ann) throw new NotFoundException({ code: "announcement.not_found" });
    if (ann.status !== "published")
      throw new ConflictException({ code: "announcement.not_published" });

    const employee = await this.prisma.db.employee.findFirst({
      where: { userId: actor.userId, deletedAt: null },
      select: { id: true },
    });
    if (!employee) throw new NotFoundException({ code: "employee.not_found" });

    // Membership check: employee must be in the resolved audience.
    const audiences = await this.prisma.db.announcementAudience.findMany({
      where: { announcementId: id },
    });
    const memberIds = await this.resolver.resolveEmployeeIds(
      ann.organizationId,
      audiences,
    );
    if (!memberIds.includes(employee.id))
      throw new ForbiddenException({ code: "announcement.not_in_audience" });

    const existing =
      await this.prisma.db.announcementAcknowledgement.findUnique({
        where: {
          announcementId_employeeId: {
            announcementId: id,
            employeeId: employee.id,
          },
        },
      });
    if (existing) return existing;

    const row = await this.prisma.db.announcementAcknowledgement.create({
      data: {
        organizationId: ann.organizationId,
        announcementId: id,
        employeeId: employee.id,
      },
    });
    await this.audit.record({
      action: "announcement.acknowledge",
      resourceType: "announcement",
      resourceId: id,
      after: row,
      metadata: { employeeId: employee.id },
    });
    return row;
  }

  async listAcknowledgements(
    id: string,
    q: AcknowledgementsQueryT,
  ): Promise<Page<unknown>> {
    const ann = await this.prisma.db.announcement.findFirst({
      where: { id, deletedAt: null },
      select: { id: true, organizationId: true },
    });
    if (!ann) throw new NotFoundException({ code: "announcement.not_found" });

    const where: Prisma.AnnouncementAcknowledgementWhereInput = {
      announcementId: id,
    };
    const [items, total] = await Promise.all([
      this.prisma.db.announcementAcknowledgement.findMany({
        where,
        orderBy: { acknowledgedAt: "desc" },
        include: {
          employee: {
            select: {
              id: true,
              displayName: true,
              employeeCode: true,
              workEmail: true,
            },
          },
        },
        ...skipTake(q),
      }),
      this.prisma.db.announcementAcknowledgement.count({ where }),
    ]);
    return pageOf(items, total, q);
  }

  // ─── Audience preview ───────────────────────────────────────────────

  async previewAudience(body: AudiencePreviewBodyT): Promise<{
    count: number;
    sample: { id: string; displayName: string; employeeCode: string }[];
  }> {
    const orgId = requireOrg();
    const rules = audienceItemsToRules(body.audiences);
    const ids = await this.resolver.resolveEmployeeIds(orgId, rules);
    const sample =
      ids.length === 0
        ? []
        : await this.prisma.db.employee.findMany({
            where: { id: { in: ids.slice(0, 10) } },
            select: {
              id: true,
              displayName: true,
              employeeCode: true,
            },
            orderBy: { displayName: "asc" },
          });
    return { count: ids.length, sample };
  }

  // ─── Employee feed ──────────────────────────────────────────────────

  /**
   * Per docs/03 §10.10 — published, non-expired announcements where the
   * calling employee is in the audience. Sort: pinned desc, then publishedAt
   * desc. `unacknowledgedOnly=true` filters to ones the user still owes.
   */
  async myFeed(
    actor: ActorCtx,
    q: MyAnnouncementsQueryT,
  ): Promise<Page<unknown>> {
    const employee = await this.prisma.db.employee.findFirst({
      where: { userId: actor.userId, deletedAt: null },
      select: {
        id: true,
        departmentId: true,
        designationId: true,
        locationId: true,
        employmentType: true,
        organizationId: true,
      },
    });
    if (!employee) throw new NotFoundException({ code: "employee.not_found" });

    const now = new Date();
    // Visible: published, not expired, where any audience row matches.
    const audienceMatch: Prisma.AnnouncementAudienceWhereInput = {
      OR: [
        { audienceType: "all_employees" },
        ...(employee.departmentId
          ? [
              {
                audienceType: "department" as const,
                departmentId: employee.departmentId,
              },
            ]
          : []),
        ...(employee.designationId
          ? [
              {
                audienceType: "designation" as const,
                designationId: employee.designationId,
              },
            ]
          : []),
        ...(employee.locationId
          ? [
              {
                audienceType: "location" as const,
                locationId: employee.locationId,
              },
            ]
          : []),
        {
          audienceType: "employment_type",
          employmentType: employee.employmentType,
        },
        {
          audienceType: "specific_employees",
          employeeId: employee.id,
        },
      ],
    };
    const where: Prisma.AnnouncementWhereInput = {
      deletedAt: null,
      status: "published",
      OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
      audiences: { some: audienceMatch },
    };

    if (q.unacknowledgedOnly) {
      where.requiresAcknowledgment = true;
      where.acknowledgements = { none: { employeeId: employee.id } };
    }

    const [items, total] = await Promise.all([
      this.prisma.db.announcement.findMany({
        where,
        orderBy: [{ pinned: "desc" }, { publishedAt: "desc" }],
        ...skipTake(q),
        include: {
          acknowledgements: {
            where: { employeeId: employee.id },
            select: { acknowledgedAt: true },
          },
        },
      }),
      this.prisma.db.announcement.count({ where }),
    ]);
    return pageOf(items, total, q);
  }

  // ─── Scheduled-publish driver ───────────────────────────────────────

  /**
   * Promote every announcement whose `scheduledFor` is in the past from
   * `scheduled` → `published`. Audience fan-out runs for each. Returns the
   * IDs that were promoted (useful for tests and the cron tick log).
   */
  async runScheduledPublishTick(now: Date = new Date()): Promise<string[]> {
    const due = await this.prisma.db.announcement.findMany({
      where: {
        deletedAt: null,
        status: "scheduled",
        scheduledFor: { lte: now },
      },
      select: { id: true, organizationId: true },
    });
    const promoted: string[] = [];
    for (const a of due) {
      await this.publishNowInternal(a.id, a.organizationId, null);
      promoted.push(a.id);
    }
    return promoted;
  }

  // ─── Internals ──────────────────────────────────────────────────────

  private async publishNow(actor: ActorCtx, id: string): Promise<unknown> {
    const before = await this.prisma.db.announcement.findFirst({
      where: { id, deletedAt: null },
    });
    if (!before)
      throw new NotFoundException({ code: "announcement.not_found" });
    const row = await this.publishNowInternal(
      id,
      before.organizationId,
      actor.userId,
    );
    await this.audit.record({
      action: "announcement.publish",
      resourceType: "announcement",
      resourceId: id,
      before,
      after: row,
    });
    return row;
  }

  /**
   * Shared publish path used by both manual publish and the scheduled tick.
   * Flips status to `published`, sets `publishedAt`, then fans out
   * `Notification` rows in the same transaction.
   */
  private async publishNowInternal(
    id: string,
    organizationId: string,
    updatedBy: string | null,
  ): Promise<unknown> {
    const now = new Date();

    const audiences = await this.prisma.db.announcementAudience.findMany({
      where: { announcementId: id },
    });
    const employeeIds = await this.resolver.resolveEmployeeIds(
      organizationId,
      audiences,
    );

    // Map employees → users for notification rows. Skip employees with no
    // user (invite not yet accepted) — they'll see the announcement on
    // login via /me/announcements anyway.
    const recipients =
      employeeIds.length === 0
        ? []
        : await this.prisma.db.employee.findMany({
            where: {
              id: { in: employeeIds },
              userId: { not: null },
            },
            select: { id: true, userId: true },
          });

    const row = await this.prisma.db.$transaction(
      async (tx: Prisma.TransactionClient) => {
        const updated = await tx.announcement.update({
          where: { id },
          data: {
            status: "published",
            publishedAt: now,
            scheduledFor: null,
            updatedBy: updatedBy ?? undefined,
          },
          include: {
            audiences: true,
            _count: { select: { acknowledgements: true } },
          },
        });
        if (recipients.length > 0) {
          await tx.notification.createMany({
            data: recipients.map((r) => ({
              organizationId,
              userId: r.userId!,
              templateId: "announcement.published",
              payload: {
                announcementId: id,
                title: updated.title,
                priority: updated.priority,
                requiresAcknowledgment: updated.requiresAcknowledgment,
              },
              linkTo: `/announcements/${id}`,
              priority: updated.priority,
            })),
          });
        }
        return updated;
      },
    );
    return row;
  }

  private async writeAudiences(
    tx: Prisma.TransactionClient,
    organizationId: string,
    announcementId: string,
    items: AudienceItemT[],
  ): Promise<void> {
    if (items.length === 0) return;
    await tx.announcementAudience.createMany({
      data: items.map((i) => ({
        organizationId,
        announcementId,
        audienceType: i.type,
        departmentId: i.departmentId ?? null,
        designationId: i.designationId ?? null,
        locationId: i.locationId ?? null,
        employmentType: i.employmentType ?? null,
        employeeId: i.employeeId ?? null,
      })),
    });
  }

  private assertSchedulingCoherent(
    scheduledFor: string | null | undefined,
    expiresAt: string | null | undefined,
  ): void {
    if (scheduledFor && expiresAt) {
      if (new Date(scheduledFor) >= new Date(expiresAt)) {
        throw new BadRequestException({
          code: "announcement.invalid_schedule",
          message: "expiresAt must be after scheduledFor",
        });
      }
    }
  }
}
