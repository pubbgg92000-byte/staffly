import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { createHash, randomBytes } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { PrismaService } from "../infra/prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import { pageOf, skipTake, type Page } from "../common/pagination";
import { currentOrganizationId } from "../tenant/tenant-context";
import { loadEnv } from "../infra/config/env";
import type { CreateInviteBodyT, InviteListQueryT } from "./dto";

function sha256(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}
function urlSafeToken(): string {
  return randomBytes(32).toString("base64url");
}
function requireOrg(): string {
  const id = currentOrganizationId();
  if (!id) throw new Error("no active tenant context");
  return id;
}

@Injectable()
export class InvitesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async create(body: CreateInviteBodyT, actorUserId: string): Promise<unknown> {
    const orgId = requireOrg();
    const env = loadEnv();

    // Validate role key exists in this org.
    const role = await this.prisma.db.role.findFirst({
      where: { organizationId: orgId, key: body.roleKey, deletedAt: null },
      select: { id: true, key: true, name: true },
    });
    if (!role) throw new BadRequestException({ code: "role.not_found" });

    // Block issuing a super_admin invite — super_admin is created at org bootstrap only.
    if (body.roleKey === "super_admin") {
      throw new BadRequestException({ code: "invite.super_admin_protected" });
    }

    // Check for an active pending invite for the same email.
    const existing = await this.prisma.db.invite.findFirst({
      where: {
        organizationId: orgId,
        email: body.email,
        status: "pending",
      },
    });
    if (existing) {
      throw new ConflictException({ code: "invite.already_pending" });
    }

    const raw = urlSafeToken();
    const expiresAt = new Date(
      Date.now() + env.INVITE_TOKEN_TTL_SECONDS * 1000,
    );

    const invite = await this.prisma.db.invite.create({
      data: {
        organizationId: orgId,
        email: body.email,
        roleKey: body.roleKey,
        tokenHash: sha256(raw),
        expiresAt,
        createdBy: actorUserId,
      },
    });

    await this.audit.record({
      action: "invite.create",
      resourceType: "invite",
      resourceId: invite.id,
      after: { email: invite.email, roleKey: invite.roleKey },
    });

    // In dev, return the raw token so the UI can display a link. In production
    // this would be sent via email instead; for now we return it always.
    const env2 = loadEnv();
    const inviteUrl = `${env2.APP_BASE_URL}/auth/accept-invite?token=${raw}`;

    return {
      id: invite.id,
      email: invite.email,
      roleKey: invite.roleKey,
      status: invite.status,
      expiresAt: invite.expiresAt,
      inviteUrl,
    };
  }

  async list(q: InviteListQueryT): Promise<Page<unknown>> {
    const where: Prisma.InviteWhereInput = {};
    if (q.status) where.status = q.status;

    const [items, total] = await Promise.all([
      this.prisma.db.invite.findMany({
        where,
        orderBy: { createdAt: "desc" },
        ...skipTake(q),
        select: {
          id: true,
          email: true,
          roleKey: true,
          status: true,
          expiresAt: true,
          acceptedAt: true,
          revokedAt: true,
          createdAt: true,
          createdBy: true,
        },
      }),
      this.prisma.db.invite.count({ where }),
    ]);

    return pageOf(items, total, q);
  }

  async revoke(id: string): Promise<void> {
    const orgId = requireOrg();
    const invite = await this.prisma.db.invite.findFirst({
      where: { id, organizationId: orgId },
    });
    if (!invite) throw new NotFoundException({ code: "invite.not_found" });
    if (invite.status !== "pending") {
      throw new BadRequestException({ code: "invite.not_revokable" });
    }

    await this.prisma.db.invite.update({
      where: { id },
      data: { status: "revoked", revokedAt: new Date() },
    });

    await this.audit.record({
      action: "invite.revoke",
      resourceType: "invite",
      resourceId: id,
      before: invite,
    });
  }

  async resend(id: string, actorUserId: string): Promise<unknown> {
    const orgId = requireOrg();
    const old = await this.prisma.db.invite.findFirst({
      where: { id, organizationId: orgId },
    });
    if (!old) throw new NotFoundException({ code: "invite.not_found" });
    if (old.status === "accepted") {
      throw new BadRequestException({ code: "invite.already_accepted" });
    }
    if (old.status === "revoked") {
      throw new BadRequestException({ code: "invite.revoked" });
    }

    // Expire the old token and issue a fresh one.
    const env = loadEnv();
    const raw = urlSafeToken();
    const expiresAt = new Date(
      Date.now() + env.INVITE_TOKEN_TTL_SECONDS * 1000,
    );

    await this.prisma.db.$transaction(async (tx) => {
      // Mark old invite as expired so it can't be accepted.
      await tx.invite.update({
        where: { id },
        data: { status: "expired" },
      });

      // Create a new invite row for the same email + role.
      await tx.invite.create({
        data: {
          organizationId: orgId,
          email: old.email,
          roleKey: old.roleKey,
          tokenHash: sha256(raw),
          expiresAt,
          createdBy: actorUserId,
        },
      });
    });

    await this.audit.record({
      action: "invite.resend",
      resourceType: "invite",
      resourceId: id,
      after: { email: old.email, roleKey: old.roleKey },
    });

    const env2 = loadEnv();
    const inviteUrl = `${env2.APP_BASE_URL}/auth/accept-invite?token=${raw}`;

    return {
      email: old.email,
      roleKey: old.roleKey,
      expiresAt,
      inviteUrl,
    };
  }
}
