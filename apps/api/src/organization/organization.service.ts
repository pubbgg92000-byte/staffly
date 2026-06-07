import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { PrismaService } from "../infra/prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import { StorageService, objectKey } from "../storage/storage.module";
import { currentOrganizationId } from "../tenant/tenant-context";
import type {
  LogoPresignBodyT,
  UpdateOrganizationBodyT,
  UpdateOrgSettingsBodyT,
} from "./dto";

function requireOrg(): string {
  const id = currentOrganizationId();
  if (!id) throw new Error("no active tenant context");
  return id;
}

/** Columns returned by the org profile endpoints (logoUrl re-presigned on read). */
const ORG_PROFILE_SELECT = {
  id: true,
  name: true,
  slug: true,
  legalName: true,
  domain: true,
  logoUrl: true,
  primaryColor: true,
  timezone: true,
  locale: true,
  currency: true,
  weekStart: true,
  billingEmail: true,
  plan: true,
  status: true,
  trialEndsAt: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.OrganizationSelect;

type OrgRow = Prisma.OrganizationGetPayload<{
  select: typeof ORG_PROFILE_SELECT;
}>;

/**
 * Organization profile, branding, and key/value settings (A-SET-001/002).
 *
 * The Organization row IS the tenant root, so it is excluded from the Prisma
 * tenant extension (see TENANT_OPT_OUT). Every query here scopes explicitly by
 * `id: requireOrg()`, which is always the caller's own org (derived from the
 * JWT-backed tenant context) — there is no path to another tenant's row.
 *
 * `logoUrl` stores the storage object KEY; reads re-presign it to a short-lived
 * GET URL (or null). Runtime theming from `primaryColor` is intentionally
 * deferred — v0.23 persists + exposes only.
 */
@Injectable()
export class OrganizationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly storage: StorageService,
  ) {}

  private async toProfile(row: OrgRow): Promise<
    Omit<OrgRow, "logoUrl"> & {
      logoUrl: string | null;
    }
  > {
    return { ...row, logoUrl: await this.storage.presignOrNull(row.logoUrl) };
  }

  async get(): Promise<unknown> {
    const row = await this.prisma.db.organization.findUnique({
      where: { id: requireOrg() },
      select: ORG_PROFILE_SELECT,
    });
    if (!row) throw new NotFoundException({ code: "organization.not_found" });
    return this.toProfile(row);
  }

  async update(
    actorUserId: string,
    body: UpdateOrganizationBodyT,
  ): Promise<unknown> {
    const id = requireOrg();
    const before = await this.prisma.db.organization.findUnique({
      where: { id },
      select: ORG_PROFILE_SELECT,
    });
    if (!before)
      throw new NotFoundException({ code: "organization.not_found" });
    const row = await this.prisma.db.organization.update({
      where: { id },
      data: { ...body, updatedBy: actorUserId },
      select: ORG_PROFILE_SELECT,
    });
    await this.audit.record({
      action: "organization.update",
      resourceType: "organization",
      resourceId: id,
      before,
      after: row,
    });
    return this.toProfile(row);
  }

  async presignLogoUpload(
    body: LogoPresignBodyT,
  ): Promise<{ url: string; key: string; expiresIn: number }> {
    const id = requireOrg();
    const key = objectKey(id, "logo", randomUUID(), body.fileName);
    const { url, expiresIn } = await this.storage.presignUpload(key);
    return { url, key, expiresIn };
  }

  async confirmLogo(actorUserId: string, key: string): Promise<unknown> {
    const id = requireOrg();
    // The key must be one we just handed out for THIS org's logo — never let a
    // caller point logoUrl at an arbitrary object (another tenant's, say).
    if (!key.startsWith(`uploads/${id}/logo/`)) {
      throw new BadRequestException({ code: "organization.logo_key_invalid" });
    }
    const before = await this.prisma.db.organization.findUnique({
      where: { id },
      select: ORG_PROFILE_SELECT,
    });
    if (!before)
      throw new NotFoundException({ code: "organization.not_found" });
    const row = await this.prisma.db.organization.update({
      where: { id },
      data: { logoUrl: key, updatedBy: actorUserId },
      select: ORG_PROFILE_SELECT,
    });
    await this.audit.record({
      action: "organization.logo.update",
      resourceType: "organization",
      resourceId: id,
      before,
      after: row,
    });
    return this.toProfile(row);
  }

  async getSettings(): Promise<Record<string, unknown>> {
    const rows = await this.prisma.db.orgSetting.findMany({
      where: { organizationId: requireOrg() },
      select: { key: true, value: true },
    });
    const out: Record<string, unknown> = {};
    for (const r of rows) out[r.key] = r.value;
    return out;
  }

  async updateSettings(
    actorUserId: string,
    patch: UpdateOrgSettingsBodyT,
  ): Promise<Record<string, unknown>> {
    const organizationId = requireOrg();
    const before = await this.getSettings();
    await this.prisma.db.$transaction(
      Object.entries(patch).map(([key, value]) =>
        this.prisma.db.orgSetting.upsert({
          where: { organizationId_key: { organizationId, key } },
          create: {
            organizationId,
            key,
            value:
              value === null
                ? Prisma.JsonNull
                : (value as Prisma.InputJsonValue),
          },
          update: {
            value:
              value === null
                ? Prisma.JsonNull
                : (value as Prisma.InputJsonValue),
          },
        }),
      ),
    );
    const after = await this.getSettings();
    await this.audit.record({
      action: "organization.settings.update",
      resourceType: "organization",
      resourceId: organizationId,
      before,
      after,
      metadata: { keys: Object.keys(patch) },
    });
    return after;
  }
}
