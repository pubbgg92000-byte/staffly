import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { randomUUID } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { PrismaService } from "../infra/prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import { currentOrganizationId } from "../tenant/tenant-context";
import { pageOf, skipTake, type Page } from "../common/pagination";
import { StorageService, objectKey } from "../storage/storage.module";
import {
  DocumentAudienceResolverService,
  type DocumentAudienceRule,
} from "./document-audience-resolver.service";
import type {
  AcknowledgementsQueryT,
  AudienceItemT,
  AudiencePreviewBodyT,
  CreateDocumentBodyT,
  DocumentListQueryT,
  FileMetaT,
  MyDocumentsQueryT,
  PresignUploadBodyT,
  ReplaceFileBodyT,
  UpdateDocumentBodyT,
} from "./dto";

interface ActorCtx {
  userId: string;
  organizationId: string;
  ipAddress?: string | null;
  userAgent?: string | null;
}

function requireOrg(): string {
  const id = currentOrganizationId();
  if (!id) throw new Error("no active tenant context");
  return id;
}

function itemsToRules(items: AudienceItemT[]): DocumentAudienceRule[] {
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
 * Documents & Compliance service — see docs/02 §2.6 and docs/03 §9.
 *
 * Lifecycle (matches Announcements but adds replace-version):
 *   draft → published (publishNow=true on create, or POST /publish)
 *   published → archived (POST /archive)
 *
 * Files live in MinIO under `uploads/{orgId}/document/{token}/{filename}`.
 * The upload flow is the standard two-step pre-sign pattern (docs/03 §14):
 *
 *   1. Client → `POST /documents/files/presign-upload` → server returns
 *      `{ url, key, ...}`. Client PUTs the file directly to MinIO.
 *   2. Client → `POST /documents` (or `POST /documents/:id/replace`) with
 *      the returned key + metadata. Server creates a DocumentVersion row.
 *
 * Replace bumps version_no and points `current_version_id` at the new row.
 * Old versions are retained (full history; never deleted). The storage
 * objects of superseded versions stay in the bucket for now — phase 2 adds
 * an orphan-cleanup cron once retention policy is decided (docs/08 §6).
 */
@Injectable()
export class DocumentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly storage: StorageService,
    private readonly resolver: DocumentAudienceResolverService,
  ) {}

  // ─── Presign ────────────────────────────────────────────────────────

  async presignUpload(
    body: PresignUploadBodyT,
  ): Promise<{ url: string; key: string; expiresIn: number }> {
    const orgId = requireOrg();
    const token = randomUUID();
    const key = objectKey(orgId, "document", token, body.fileName);
    const { url, expiresIn } = await this.storage.presignUpload(key);
    return { url, key, expiresIn };
  }

  // ─── Read ───────────────────────────────────────────────────────────

  async list(q: DocumentListQueryT): Promise<Page<unknown>> {
    const where: Prisma.DocumentWhereInput = { deletedAt: null };
    if (q.categoryId) where.categoryId = q.categoryId;
    if (q.isRequired !== undefined) where.isRequired = q.isRequired;
    if (q.isPersonal !== undefined) where.isPersonal = q.isPersonal;
    if (q.subjectEmployeeId) where.subjectEmployeeId = q.subjectEmployeeId;
    if (q.search) where.title = { contains: q.search, mode: "insensitive" };
    if (q.status === "draft") {
      where.publishedAt = null;
      where.archivedAt = null;
    } else if (q.status === "published") {
      where.publishedAt = { not: null };
      where.archivedAt = null;
    } else if (q.status === "archived") {
      where.archivedAt = { not: null };
    }
    if (q.expiringInDays !== undefined) {
      const cutoff = new Date(Date.now() + q.expiringInDays * 86_400_000);
      where.expiresAt = { not: null, lte: cutoff, gte: new Date() };
    }
    const [items, total] = await Promise.all([
      this.prisma.db.document.findMany({
        where,
        orderBy: { [q.sortBy]: q.sortDir },
        ...skipTake(q),
        include: {
          category: { select: { id: true, name: true, color: true } },
          currentVersion: true,
          _count: {
            select: { acknowledgements: true, versions: true, audiences: true },
          },
        },
      }),
      this.prisma.db.document.count({ where }),
    ]);
    return pageOf(items, total, q);
  }

  async get(id: string): Promise<unknown> {
    const row = await this.prisma.db.document.findFirst({
      where: { id, deletedAt: null },
      include: {
        category: true,
        currentVersion: true,
        versions: { orderBy: { versionNo: "desc" } },
        audiences: true,
        _count: { select: { acknowledgements: true } },
      },
    });
    if (!row) throw new NotFoundException({ code: "document.not_found" });
    return row;
  }

  // ─── Create / update / replace ──────────────────────────────────────

  async create(actor: ActorCtx, body: CreateDocumentBodyT): Promise<unknown> {
    const orgId = requireOrg();

    const category = await this.prisma.db.documentCategory.findFirst({
      where: { id: body.categoryId, deletedAt: null },
    });
    if (!category)
      throw new NotFoundException({ code: "document.category.not_found" });
    if (!category.isActive)
      throw new BadRequestException({ code: "document.category.inactive" });
    if (
      body.isPersonal !== undefined &&
      body.isPersonal !== category.isPersonal
    ) {
      throw new BadRequestException({
        code: "document.category_personal_mismatch",
        message: "isPersonal must match the category's isPersonal flag",
      });
    }
    if (body.subjectEmployeeId) {
      const employee = await this.prisma.db.employee.findFirst({
        where: { id: body.subjectEmployeeId, deletedAt: null },
        select: { id: true },
      });
      if (!employee)
        throw new NotFoundException({ code: "employee.not_found" });
    }

    const row = await this.prisma.db.$transaction(
      async (tx: Prisma.TransactionClient) => {
        const doc = await tx.document.create({
          data: {
            organizationId: orgId,
            categoryId: body.categoryId,
            title: body.title,
            description: body.description ?? null,
            isRequired: body.isRequired ?? false,
            isPersonal: body.isPersonal ?? category.isPersonal,
            subjectEmployeeId: body.subjectEmployeeId ?? null,
            dueBy: body.dueBy ? new Date(body.dueBy) : null,
            expiresAt: body.expiresAt ? new Date(body.expiresAt) : null,
            publishedAt: body.publishNow ? new Date() : null,
            createdBy: actor.userId,
            updatedBy: actor.userId,
          },
        });
        const v = await this.writeVersion(
          tx,
          orgId,
          doc.id,
          1,
          body.file,
          actor.userId,
        );
        await tx.document.update({
          where: { id: doc.id },
          data: { currentVersionId: v.id },
        });
        if (!doc.isPersonal && body.audiences && body.audiences.length > 0) {
          await this.writeAudiences(tx, orgId, doc.id, body.audiences);
        }
        return tx.document.findFirstOrThrow({
          where: { id: doc.id },
          include: {
            category: true,
            currentVersion: true,
            versions: { orderBy: { versionNo: "desc" } },
            audiences: true,
            _count: { select: { acknowledgements: true } },
          },
        });
      },
    );
    await this.audit.record({
      action: body.publishNow
        ? "document.create_and_publish"
        : "document.create",
      resourceType: "document",
      resourceId: row.id,
      after: row,
    });
    return row;
  }

  async update(
    actor: ActorCtx,
    id: string,
    body: UpdateDocumentBodyT,
  ): Promise<unknown> {
    const before = await this.prisma.db.document.findFirst({
      where: { id, deletedAt: null },
      include: { audiences: true },
    });
    if (!before) throw new NotFoundException({ code: "document.not_found" });
    if (before.archivedAt)
      throw new ConflictException({ code: "document.archived" });

    // Published docs: only title / description / expiresAt / dueBy editable.
    const isPublished = before.publishedAt !== null;
    if (isPublished) {
      if (body.isRequired !== undefined || body.audiences !== undefined) {
        throw new BadRequestException({
          code: "document.published_locked_fields",
          message:
            "isRequired and audiences are locked once a document is published",
        });
      }
    }
    if (before.isPersonal && body.audiences !== undefined) {
      throw new BadRequestException({
        code: "document.personal_no_audiences",
      });
    }

    const orgId = requireOrg();
    const row = await this.prisma.db.$transaction(
      async (tx: Prisma.TransactionClient) => {
        const data: Prisma.DocumentUpdateInput = { updatedBy: actor.userId };
        if (body.title !== undefined) data.title = body.title;
        if (body.description !== undefined) data.description = body.description;
        if (body.isRequired !== undefined) data.isRequired = body.isRequired;
        if (body.dueBy !== undefined)
          data.dueBy = body.dueBy ? new Date(body.dueBy) : null;
        if (body.expiresAt !== undefined)
          data.expiresAt = body.expiresAt ? new Date(body.expiresAt) : null;
        await tx.document.update({ where: { id }, data });
        if (body.audiences) {
          await tx.documentAudience.deleteMany({ where: { documentId: id } });
          await this.writeAudiences(tx, orgId, id, body.audiences);
        }
        return tx.document.findFirstOrThrow({
          where: { id },
          include: {
            category: true,
            currentVersion: true,
            versions: { orderBy: { versionNo: "desc" } },
            audiences: true,
            _count: { select: { acknowledgements: true } },
          },
        });
      },
    );
    await this.audit.record({
      action: "document.update",
      resourceType: "document",
      resourceId: id,
      before,
      after: row,
    });
    return row;
  }

  /**
   * Upload a new file → bumps version, swaps current pointer. Existing
   * acknowledgements stay attached to the document (their `versionNo` field
   * records which version they ack'd, so we can show a "needs re-ack since
   * v2" indicator later).
   */
  async replaceFile(
    actor: ActorCtx,
    id: string,
    body: ReplaceFileBodyT,
  ): Promise<unknown> {
    const before = await this.prisma.db.document.findFirst({
      where: { id, deletedAt: null },
      include: { currentVersion: true },
    });
    if (!before) throw new NotFoundException({ code: "document.not_found" });
    if (before.archivedAt)
      throw new ConflictException({ code: "document.archived" });

    const orgId = requireOrg();
    const row = await this.prisma.db.$transaction(
      async (tx: Prisma.TransactionClient) => {
        const last = await tx.documentVersion.findFirst({
          where: { documentId: id },
          orderBy: { versionNo: "desc" },
          select: { versionNo: true },
        });
        const nextVersionNo = (last?.versionNo ?? 0) + 1;
        const v = await this.writeVersion(
          tx,
          orgId,
          id,
          nextVersionNo,
          body.file,
          actor.userId,
        );
        await tx.document.update({
          where: { id },
          data: { currentVersionId: v.id, updatedBy: actor.userId },
        });
        return tx.document.findFirstOrThrow({
          where: { id },
          include: {
            category: true,
            currentVersion: true,
            versions: { orderBy: { versionNo: "desc" } },
            audiences: true,
            _count: { select: { acknowledgements: true } },
          },
        });
      },
    );
    await this.audit.record({
      action: "document.replace_file",
      resourceType: "document",
      resourceId: id,
      before,
      after: row,
    });
    return row;
  }

  // ─── Publish / archive / soft delete ────────────────────────────────

  async publish(actor: ActorCtx, id: string): Promise<unknown> {
    const before = await this.prisma.db.document.findFirst({
      where: { id, deletedAt: null },
    });
    if (!before) throw new NotFoundException({ code: "document.not_found" });
    if (before.archivedAt)
      throw new ConflictException({ code: "document.archived" });
    if (before.publishedAt) return before;
    if (!before.currentVersionId)
      throw new BadRequestException({ code: "document.no_file" });

    const row = await this.prisma.db.document.update({
      where: { id },
      data: { publishedAt: new Date(), updatedBy: actor.userId },
    });
    await this.audit.record({
      action: "document.publish",
      resourceType: "document",
      resourceId: id,
      before,
      after: row,
    });
    return row;
  }

  async archive(actor: ActorCtx, id: string): Promise<unknown> {
    const before = await this.prisma.db.document.findFirst({
      where: { id, deletedAt: null },
    });
    if (!before) throw new NotFoundException({ code: "document.not_found" });
    if (before.archivedAt) return before;
    const row = await this.prisma.db.document.update({
      where: { id },
      data: { archivedAt: new Date(), updatedBy: actor.userId },
    });
    await this.audit.record({
      action: "document.archive",
      resourceType: "document",
      resourceId: id,
      before,
      after: row,
    });
    return row;
  }

  async softDelete(actor: ActorCtx, id: string): Promise<void> {
    const before = await this.prisma.db.document.findFirst({
      where: { id, deletedAt: null },
    });
    if (!before) throw new NotFoundException({ code: "document.not_found" });
    await this.prisma.db.document.update({
      where: { id },
      data: { deletedAt: new Date(), updatedBy: actor.userId },
    });
    await this.audit.record({
      action: "document.delete",
      resourceType: "document",
      resourceId: id,
      before,
    });
  }

  // ─── Download (presigned GET) ───────────────────────────────────────

  /**
   * Resolves the storage key for the document's current version (or a
   * specific version if requested) and returns a short-lived signed URL.
   * Authorization is enforced by the caller — controllers gate on either
   * admin perm (document.read) or membership in the audience.
   */
  async getDownloadUrlForVersion(
    documentId: string,
    versionNo?: number,
  ): Promise<{ url: string; expiresIn: number; fileName: string }> {
    const doc = await this.prisma.db.document.findFirst({
      where: { id: documentId, deletedAt: null },
      include: { currentVersion: true },
    });
    if (!doc) throw new NotFoundException({ code: "document.not_found" });
    let version = doc.currentVersion;
    if (versionNo !== undefined) {
      const v = await this.prisma.db.documentVersion.findFirst({
        where: { documentId, versionNo },
      });
      if (!v)
        throw new NotFoundException({ code: "document.version.not_found" });
      version = v;
    }
    if (!version) throw new BadRequestException({ code: "document.no_file" });
    const { url, expiresIn } = await this.storage.presignDownload(
      version.storageKey,
      version.fileName,
    );
    return { url, expiresIn, fileName: version.fileName };
  }

  // ─── Acknowledgements ───────────────────────────────────────────────

  async acknowledge(actor: ActorCtx, id: string): Promise<unknown> {
    const doc = await this.prisma.db.document.findFirst({
      where: { id, deletedAt: null },
      include: { currentVersion: true },
    });
    if (!doc) throw new NotFoundException({ code: "document.not_found" });
    if (!doc.publishedAt)
      throw new ConflictException({ code: "document.not_published" });
    if (doc.archivedAt)
      throw new ConflictException({ code: "document.archived" });

    const employee = await this.prisma.db.employee.findFirst({
      where: { userId: actor.userId, deletedAt: null },
      select: { id: true },
    });
    if (!employee) throw new NotFoundException({ code: "employee.not_found" });

    const inAudience = await this.isEmployeeInAudience(doc.id, employee.id, {
      isPersonal: doc.isPersonal,
      subjectEmployeeId: doc.subjectEmployeeId,
      organizationId: doc.organizationId,
    });
    if (!inAudience)
      throw new ForbiddenException({ code: "document.not_in_audience" });

    const existing = await this.prisma.db.documentAcknowledgement.findUnique({
      where: {
        documentId_employeeId: { documentId: id, employeeId: employee.id },
      },
    });
    if (existing) return existing;

    const row = await this.prisma.db.documentAcknowledgement.create({
      data: {
        organizationId: doc.organizationId,
        documentId: id,
        employeeId: employee.id,
        versionNo: doc.currentVersion?.versionNo ?? 1,
        ipAddress: actor.ipAddress ?? null,
        userAgent: actor.userAgent ?? null,
      },
    });
    await this.audit.record({
      action: "document.acknowledge",
      resourceType: "document",
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
    const doc = await this.prisma.db.document.findFirst({
      where: { id, deletedAt: null },
      select: { id: true },
    });
    if (!doc) throw new NotFoundException({ code: "document.not_found" });
    const where: Prisma.DocumentAcknowledgementWhereInput = { documentId: id };
    const [items, total] = await Promise.all([
      this.prisma.db.documentAcknowledgement.findMany({
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
      this.prisma.db.documentAcknowledgement.count({ where }),
    ]);
    return pageOf(items, total, q);
  }

  /**
   * Returns the set of employees who SHOULD have acknowledged (audience or
   * subject employee) but have not. Used by the reminder cron and admin
   * compliance dashboard.
   */
  async listPendingAckEmployees(id: string): Promise<string[]> {
    const doc = await this.prisma.db.document.findFirst({
      where: {
        id,
        deletedAt: null,
        publishedAt: { not: null },
        archivedAt: null,
      },
      include: { audiences: true },
    });
    if (!doc) return [];
    if (!doc.isRequired) return [];

    let memberIds: string[];
    if (doc.isPersonal) {
      memberIds = doc.subjectEmployeeId ? [doc.subjectEmployeeId] : [];
    } else {
      memberIds = await this.resolver.resolveEmployeeIds(
        doc.organizationId,
        doc.audiences,
      );
    }
    if (memberIds.length === 0) return [];
    const acked = await this.prisma.db.documentAcknowledgement.findMany({
      where: { documentId: id, employeeId: { in: memberIds } },
      select: { employeeId: true },
    });
    const ackedSet = new Set(acked.map((a) => a.employeeId));
    return memberIds.filter((id_) => !ackedSet.has(id_));
  }

  // ─── Audience preview ───────────────────────────────────────────────

  async previewAudience(body: AudiencePreviewBodyT): Promise<{
    count: number;
    sample: { id: string; displayName: string; employeeCode: string }[];
  }> {
    const orgId = requireOrg();
    const rules = itemsToRules(body.audiences);
    const ids = await this.resolver.resolveEmployeeIds(orgId, rules);
    const sample =
      ids.length === 0
        ? []
        : await this.prisma.db.employee.findMany({
            where: { id: { in: ids.slice(0, 10) } },
            select: { id: true, displayName: true, employeeCode: true },
            orderBy: { displayName: "asc" },
          });
    return { count: ids.length, sample };
  }

  // ─── Employee feed ──────────────────────────────────────────────────

  async myDocuments(
    actor: ActorCtx,
    q: MyDocumentsQueryT,
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

    const audienceMatch: Prisma.DocumentAudienceWhereInput = {
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
        { audienceType: "specific_employees", employeeId: employee.id },
      ],
    };

    const where: Prisma.DocumentWhereInput = {
      deletedAt: null,
      publishedAt: { not: null },
      archivedAt: null,
      OR: [
        { isPersonal: true, subjectEmployeeId: employee.id },
        { isPersonal: false, audiences: { some: audienceMatch } },
      ],
    };

    if (q.unacknowledgedOnly) {
      where.isRequired = true;
      where.acknowledgements = { none: { employeeId: employee.id } };
    }

    const [items, total] = await Promise.all([
      this.prisma.db.document.findMany({
        where,
        orderBy: [{ isRequired: "desc" }, { publishedAt: "desc" }],
        ...skipTake(q),
        include: {
          category: { select: { id: true, name: true, color: true } },
          currentVersion: true,
          acknowledgements: {
            where: { employeeId: employee.id },
            select: { acknowledgedAt: true, versionNo: true },
          },
        },
      }),
      this.prisma.db.document.count({ where }),
    ]);
    return pageOf(items, total, q);
  }

  /**
   * Download URL for a document the calling employee is entitled to view.
   * Reuses the same audience filter as myDocuments — if the document doesn't
   * appear in the employee's feed it's treated as not found (403-equivalent).
   */
  async myDocumentDownloadUrl(
    actor: ActorCtx,
    documentId: string,
  ): Promise<{ url: string; expiresIn: number; fileName: string }> {
    const employee = await this.prisma.db.employee.findFirst({
      where: { userId: actor.userId, deletedAt: null },
      select: {
        id: true,
        departmentId: true,
        designationId: true,
        locationId: true,
        employmentType: true,
      },
    });
    if (!employee) throw new NotFoundException({ code: "employee.not_found" });

    const audienceMatch: Prisma.DocumentAudienceWhereInput = {
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
        { audienceType: "specific_employees", employeeId: employee.id },
      ],
    };

    const doc = await this.prisma.db.document.findFirst({
      where: {
        id: documentId,
        deletedAt: null,
        publishedAt: { not: null },
        archivedAt: null,
        OR: [
          { isPersonal: true, subjectEmployeeId: employee.id },
          { isPersonal: false, audiences: { some: audienceMatch } },
        ],
      },
    });
    if (!doc) throw new NotFoundException({ code: "document.not_found" });

    return this.getDownloadUrlForVersion(documentId);
  }

  // ─── Internals ──────────────────────────────────────────────────────

  private async writeVersion(
    tx: Prisma.TransactionClient,
    organizationId: string,
    documentId: string,
    versionNo: number,
    file: FileMetaT,
    uploadedBy: string,
  ): Promise<{ id: string; versionNo: number }> {
    return tx.documentVersion.create({
      data: {
        organizationId,
        documentId,
        versionNo,
        storageKey: file.storageKey,
        fileName: file.fileName,
        mimeType: file.mimeType,
        sizeBytes: BigInt(file.sizeBytes),
        uploadedBy,
      },
      select: { id: true, versionNo: true },
    });
  }

  private async writeAudiences(
    tx: Prisma.TransactionClient,
    organizationId: string,
    documentId: string,
    items: AudienceItemT[],
  ): Promise<void> {
    if (items.length === 0) return;
    await tx.documentAudience.createMany({
      data: items.map((i) => ({
        organizationId,
        documentId,
        audienceType: i.type,
        departmentId: i.departmentId ?? null,
        designationId: i.designationId ?? null,
        locationId: i.locationId ?? null,
        employmentType: i.employmentType ?? null,
        employeeId: i.employeeId ?? null,
      })),
    });
  }

  private async isEmployeeInAudience(
    documentId: string,
    employeeId: string,
    doc: {
      isPersonal: boolean;
      subjectEmployeeId: string | null;
      organizationId: string;
    },
  ): Promise<boolean> {
    if (doc.isPersonal) return doc.subjectEmployeeId === employeeId;
    const audiences = await this.prisma.db.documentAudience.findMany({
      where: { documentId },
    });
    const ids = await this.resolver.resolveEmployeeIds(
      doc.organizationId,
      audiences,
    );
    return ids.includes(employeeId);
  }
}
