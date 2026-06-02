import {
  BadRequestException,
  ConflictException,
  HttpException,
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from "@nestjs/common";
import { createHash, randomBytes, randomInt } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { PrismaService } from "../infra/prisma/prisma.service";
import { PasswordService } from "./password.service";
import { TokensService, type RefreshContext } from "./tokens.service";
import { OrgBootstrapService } from "../rbac/org-bootstrap.service";
import { PermissionsService } from "../rbac/permissions.service";
import { highestRole, type RoleKey } from "../rbac/system-roles";
import { loadEnv } from "../infra/config/env";
import type { SignupBodyT } from "./dto/signup.dto";
import type { SigninBodyT } from "./dto/signin.dto";
import type { ForgotPasswordBodyT } from "./dto/forgot-password.dto";
import type { ResetPasswordBodyT } from "./dto/reset-password.dto";
import type { VerifyTwoFactorBodyT } from "./dto/verify-2fa.dto";
import type { AcceptInviteBodyT } from "./dto/accept-invite.dto";
import type { IssuedTokens } from "./tokens.service";

const FAILED_LOGIN_LIMIT = 10;
const LOCK_DURATION_MS = 15 * 60 * 1000;
const MAX_2FA_ATTEMPTS = 5;

function sha256(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}
function urlSafeToken(): string {
  return randomBytes(32).toString("base64url");
}
function generateDevOtp(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, "0");
}

export type AdminPortal = "admin" | "employee";
const ADMIN_ROLES: ReadonlySet<RoleKey> = new Set([
  "super_admin",
  "hr_admin",
  "manager",
]);
function defaultPortalForRole(role: RoleKey): AdminPortal {
  return ADMIN_ROLES.has(role) ? "admin" : "employee";
}

export interface AuthResult {
  user: { id: string; email: string; role: RoleKey };
  organization: { id: string; slug: string; name: string };
  tokens: IssuedTokens;
  defaultPortal: AdminPortal;
}

/** Returned by signin when the user has 2FA enabled. No cookies are set. */
export interface TwoFactorChallengeResult {
  challenge: {
    id: string;
    kind: "totp" | "dev_otp";
    expiresAt: string;
  };
}

export type SigninOutcome = AuthResult | TwoFactorChallengeResult;

export function isChallenge(
  outcome: SigninOutcome,
): outcome is TwoFactorChallengeResult {
  return "challenge" in outcome;
}

export interface MeResult {
  user: {
    id: string;
    email: string;
    role: RoleKey;
    organizationId: string;
    defaultPortal: AdminPortal;
  };
}

export interface InvitePeek {
  email: string;
  organization: { id: string; slug: string; name: string };
  roleKey: RoleKey;
  expiresAt: string;
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  private readonly env = loadEnv();

  constructor(
    private readonly prisma: PrismaService,
    private readonly passwords: PasswordService,
    private readonly tokens: TokensService,
    private readonly bootstrap: OrgBootstrapService,
    private readonly permissions: PermissionsService,
  ) {}

  // ─── Signup (org bootstrap) ──────────────────────────────────────────

  async signup(body: SignupBodyT, ctx: RefreshContext): Promise<AuthResult> {
    const passwordHash = await this.passwords.hash(body.password);

    const result = await this.prisma.db.$transaction(
      async (tx: Prisma.TransactionClient) => {
        const existingEmail = await tx.user.findUnique({
          where: { email: body.email },
          select: { id: true },
        });
        if (existingEmail) {
          throw new ConflictException({ code: "conflict.email_taken" });
        }
        const existingSlug = await tx.organization.findUnique({
          where: { slug: body.slug },
          select: { id: true },
        });
        if (existingSlug) {
          throw new ConflictException({ code: "conflict.slug_taken" });
        }

        const org = await tx.organization.create({
          data: { name: body.organizationName, slug: body.slug },
        });

        const user = await tx.user.create({
          data: {
            organizationId: org.id,
            email: body.email,
            passwordHash,
            status: "active",
            emailVerifiedAt: null,
            defaultPortal: "admin",
          },
        });

        const roleIds = await this.bootstrap.bootstrap(tx, org.id);

        await tx.userRole.create({
          data: {
            organizationId: org.id,
            userId: user.id,
            roleId: roleIds.super_admin,
          },
        });

        return { org, user };
      },
    );

    const tokens = await this.tokens.issueInitialTokens(
      result.user.id,
      result.org.id,
      ctx,
    );

    return {
      user: {
        id: result.user.id,
        email: result.user.email,
        role: "super_admin",
      },
      organization: {
        id: result.org.id,
        slug: result.org.slug,
        name: result.org.name,
      },
      tokens,
      defaultPortal: "admin",
    };
  }

  // ─── Signin (password) ───────────────────────────────────────────────

  async signin(body: SigninBodyT, ctx: RefreshContext): Promise<SigninOutcome> {
    const invalid = new UnauthorizedException({ code: "auth.unauthenticated" });

    const user = await this.prisma.db.user.findUnique({
      where: { email: body.email },
      include: {
        organization: { select: { id: true, slug: true, name: true } },
      },
    });
    if (!user || !user.passwordHash) throw invalid;

    if (user.lockedUntil && user.lockedUntil.getTime() > Date.now()) {
      throw new HttpException({ code: "account.locked" }, 423);
    }
    if (user.status !== "active") {
      // invited / disabled users may not sign in until they accept / are re-enabled
      throw invalid;
    }

    const ok = await this.passwords.verify(user.passwordHash, body.password);
    if (!ok) {
      const nextFailed = user.failedLoginCount + 1;
      const lock =
        nextFailed >= FAILED_LOGIN_LIMIT
          ? new Date(Date.now() + LOCK_DURATION_MS)
          : null;
      await this.prisma.db.user.update({
        where: { id: user.id },
        data: {
          failedLoginCount: nextFailed,
          lockedUntil: lock,
        },
      });
      throw invalid;
    }

    // Password OK. If the user has 2FA enabled, issue a challenge *instead*
    // of completing the sign-in. The caller (controller) must NOT set auth
    // cookies in this branch.
    if (user.twoFactorEnabled) {
      // Dev mode: generate a 6-digit OTP and log it.
      const otp = generateDevOtp();
      const expiresAt = new Date(
        Date.now() + this.env.TWO_FACTOR_CHALLENGE_TTL_SECONDS * 1000,
      );
      const ch = await this.prisma.db.twoFactorChallenge.create({
        data: {
          organizationId: user.organizationId,
          userId: user.id,
          kind: "dev_otp",
          devOtp: otp,
          expiresAt,
        },
        select: { id: true },
      });
      this.logger.warn(
        `[dev-2fa] OTP for ${user.email} (challenge=${ch.id}): ${otp}`,
      );
      return {
        challenge: {
          id: ch.id,
          kind: "dev_otp",
          expiresAt: expiresAt.toISOString(),
        },
      };
    }

    return this.finalizeSignin(user.id, user.organizationId, ctx, {
      rememberMe: body.rememberMe === true,
    });
  }

  // ─── Verify 2FA ──────────────────────────────────────────────────────

  async verifyTwoFactor(
    body: VerifyTwoFactorBodyT,
    ctx: RefreshContext,
  ): Promise<AuthResult> {
    const ch = await this.prisma.db.twoFactorChallenge.findUnique({
      where: { id: body.challengeId },
      include: { user: true },
    });
    if (!ch || ch.consumedAt) {
      throw new UnauthorizedException({ code: "two_factor.invalid" });
    }
    if (ch.expiresAt.getTime() <= Date.now()) {
      throw new UnauthorizedException({ code: "two_factor.expired" });
    }
    if (ch.attempts >= MAX_2FA_ATTEMPTS) {
      throw new UnauthorizedException({ code: "two_factor.too_many_attempts" });
    }

    // Dev mode: compare against stored devOtp. TODO: in prod, derive code
    // from the user's TOTP secret (users.twoFactorSecretEnc).
    if (ch.kind !== "dev_otp" || ch.devOtp !== body.code) {
      await this.prisma.db.twoFactorChallenge.update({
        where: { id: ch.id },
        data: { attempts: { increment: 1 } },
      });
      throw new UnauthorizedException({ code: "two_factor.invalid" });
    }

    await this.prisma.db.twoFactorChallenge.update({
      where: { id: ch.id },
      data: { consumedAt: new Date() },
    });

    return this.finalizeSignin(ch.userId, ch.organizationId, ctx, {
      rememberMe: body.rememberMe === true,
    });
  }

  // ─── Refresh / logout / me ──────────────────────────────────────────

  async refresh(presented: string, ctx: RefreshContext): Promise<IssuedTokens> {
    return this.tokens.rotate(presented, ctx);
  }

  async logout(presentedRefresh: string | undefined): Promise<void> {
    if (presentedRefresh) {
      await this.tokens.revokeByToken(presentedRefresh);
    }
  }

  async me(userId: string): Promise<MeResult> {
    const user = await this.prisma.db.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        organizationId: true,
      },
    });
    if (!user) {
      throw new UnauthorizedException({ code: "auth.unauthenticated" });
    }
    const roles = await this.permissions.loadUserRoles(userId);
    const role = highestRole(roles) ?? "employee";
    return {
      user: {
        id: user.id,
        email: user.email,
        role,
        organizationId: user.organizationId,
        defaultPortal: defaultPortalForRole(role),
      },
    };
  }

  // ─── Forgot password ─────────────────────────────────────────────────

  /**
   * Always returns success — never leak whether the email exists.
   *
   * Dev mode: when a user does exist, we log the reset URL to the API logs
   * so a developer can copy it into the browser without configuring SMTP.
   */
  async forgotPassword(
    body: ForgotPasswordBodyT,
    ctx: RefreshContext,
  ): Promise<{ ok: true; devResetUrl?: string }> {
    const user = await this.prisma.db.user.findUnique({
      where: { email: body.email },
      select: { id: true, email: true, organizationId: true, status: true },
    });
    if (!user || user.status !== "active") {
      // Equal-time-ish: still wait for one hash op to discourage user
      // enumeration via response time. (Best-effort; not a constant.)
      await this.passwords.hash("staffly-dummy-timing-probe");
      return { ok: true };
    }
    const raw = urlSafeToken();
    const expiresAt = new Date(
      Date.now() + this.env.PASSWORD_RESET_TTL_SECONDS * 1000,
    );
    await this.prisma.db.passwordResetToken.create({
      data: {
        organizationId: user.organizationId,
        userId: user.id,
        tokenHash: sha256(raw),
        requestedIp: ctx.ipAddress ?? null,
        expiresAt,
      },
    });
    const devResetUrl = `${this.env.APP_BASE_URL}/auth/reset-password?token=${raw}`;
    this.logger.warn(
      `[dev-password-reset] reset URL for ${user.email}: ${devResetUrl}`,
    );
    // Return the URL only outside of production for ergonomics. In prod the
    // endpoint MUST return `{ ok: true }` only — see docs/03 §2.8.
    if (this.env.NODE_ENV !== "production") {
      return { ok: true, devResetUrl };
    }
    return { ok: true };
  }

  // ─── Reset password ──────────────────────────────────────────────────

  async resetPassword(body: ResetPasswordBodyT): Promise<{ ok: true }> {
    const tokenHash = sha256(body.token);
    const row = await this.prisma.db.passwordResetToken.findUnique({
      where: { tokenHash },
    });
    if (!row || row.usedAt) {
      throw new UnauthorizedException({ code: "reset.invalid" });
    }
    if (row.expiresAt.getTime() <= Date.now()) {
      throw new UnauthorizedException({ code: "reset.expired" });
    }
    const passwordHash = await this.passwords.hash(body.password);
    await this.prisma.db.$transaction(async (tx: Prisma.TransactionClient) => {
      await tx.user.update({
        where: { id: row.userId },
        data: {
          passwordHash,
          failedLoginCount: 0,
          lockedUntil: null,
        },
      });
      await tx.passwordResetToken.update({
        where: { id: row.id },
        data: { usedAt: new Date() },
      });
      // Revoke every active refresh token — force sign-in everywhere.
      await tx.refreshToken.updateMany({
        where: { userId: row.userId, revokedAt: null },
        data: { revokedAt: new Date(), revokeReason: "password_reset" },
      });
    });
    return { ok: true };
  }

  // ─── Accept invite ──────────────────────────────────────────────────

  /**
   * Inspect an invite by token. Used by the UI to render the email + org
   * name + role before asking for the password. Does not consume the token.
   */
  async peekInvite(token: string): Promise<InvitePeek> {
    const invite = await this.findUsableInvite(token);
    const org = await this.prisma.db.organization.findUniqueOrThrow({
      where: { id: invite.organizationId },
      select: { id: true, slug: true, name: true },
    });
    return {
      email: invite.email,
      organization: org,
      roleKey: invite.roleKey as RoleKey,
      expiresAt: invite.expiresAt.toISOString(),
    };
  }

  /**
   * Accept an invite — finalize the user account with the chosen password,
   * mark the invite consumed, and auto-sign-in the user.
   */
  async acceptInvite(
    body: AcceptInviteBodyT,
    ctx: RefreshContext,
  ): Promise<AuthResult> {
    const invite = await this.findUsableInvite(body.token);
    const passwordHash = await this.passwords.hash(body.password);

    const result = await this.prisma.db.$transaction(
      async (tx: Prisma.TransactionClient) => {
        // Resolve or create the user row. An invite may target a user that
        // already exists (status=invited) — typical when HR runs an invite
        // alongside an employee record creation.
        const existing = await tx.user.findUnique({
          where: { email: invite.email },
        });
        const user = existing
          ? await tx.user.update({
              where: { id: existing.id },
              data: {
                passwordHash,
                status: "active",
                inviteTokenHash: null,
                inviteTokenExpiresAt: null,
                emailVerifiedAt: new Date(),
              },
            })
          : await tx.user.create({
              data: {
                organizationId: invite.organizationId,
                email: invite.email,
                passwordHash,
                status: "active",
                emailVerifiedAt: new Date(),
                defaultPortal:
                  invite.roleKey === "employee" ? "employee" : "admin",
              },
            });

        // Attach the role from the invite.
        const role = await tx.role.findFirstOrThrow({
          where: {
            organizationId: invite.organizationId,
            key: invite.roleKey,
            deletedAt: null,
          },
        });
        await tx.userRole.upsert({
          where: { userId_roleId: { userId: user.id, roleId: role.id } },
          create: {
            organizationId: invite.organizationId,
            userId: user.id,
            roleId: role.id,
          },
          update: {},
        });

        await tx.invite.update({
          where: { id: invite.id },
          data: { status: "accepted", acceptedAt: new Date() },
        });

        // Best-effort: stamp first/last on the employee row if one exists
        // for this user. We do not create one here — employee records are
        // managed via the Employees module.
        await tx.employee.updateMany({
          where: { userId: user.id, organizationId: invite.organizationId },
          data: { firstName: body.firstName, lastName: body.lastName },
        });

        return user;
      },
    );

    return this.finalizeSignin(result.id, result.organizationId, ctx, {
      rememberMe: true,
    });
  }

  // ─── Internals ───────────────────────────────────────────────────────

  private async findUsableInvite(token: string): Promise<{
    id: string;
    organizationId: string;
    email: string;
    roleKey: string;
    expiresAt: Date;
  }> {
    const tokenHash = sha256(token);
    const invite = await this.prisma.db.invite.findUnique({
      where: { tokenHash },
    });
    if (!invite) throw new NotFoundException({ code: "invite.invalid" });
    if (invite.status === "revoked") {
      throw new UnauthorizedException({ code: "invite.revoked" });
    }
    if (invite.status === "accepted") {
      throw new ConflictException({ code: "invite.already_accepted" });
    }
    if (invite.expiresAt.getTime() <= Date.now()) {
      // Lazy expiry — mark and reject.
      if (invite.status !== "expired") {
        await this.prisma.db.invite.update({
          where: { id: invite.id },
          data: { status: "expired" },
        });
      }
      throw new UnauthorizedException({ code: "invite.expired" });
    }
    return invite;
  }

  private async finalizeSignin(
    userId: string,
    organizationId: string,
    ctx: RefreshContext,
    options: { rememberMe?: boolean },
  ): Promise<AuthResult> {
    await this.prisma.db.user.update({
      where: { id: userId },
      data: {
        failedLoginCount: 0,
        lockedUntil: null,
        lastLoginAt: new Date(),
        lastLoginIp: ctx.ipAddress ?? null,
      },
    });

    const [roles, user] = await Promise.all([
      this.permissions.loadUserRoles(userId),
      this.prisma.db.user.findUniqueOrThrow({
        where: { id: userId },
        include: {
          organization: { select: { id: true, slug: true, name: true } },
        },
      }),
    ]);
    const role = highestRole(roles) ?? "employee";

    const tokens = await this.tokens.issueInitialTokens(
      userId,
      organizationId,
      ctx,
      { rememberMe: options.rememberMe === true },
    );

    return {
      user: { id: user.id, email: user.email, role },
      organization: user.organization,
      tokens,
      defaultPortal: defaultPortalForRole(role),
    };
  }

  // ─── Helpers used by the dev-seed script + tests ─────────────────────

  /** Issue an invite for an email in an organization. Returns the raw token. */
  async createInvite(input: {
    organizationId: string;
    email: string;
    roleKey: RoleKey;
    createdBy?: string;
  }): Promise<{ token: string; inviteId: string; expiresAt: Date }> {
    const raw = urlSafeToken();
    const expiresAt = new Date(
      Date.now() + this.env.INVITE_TOKEN_TTL_SECONDS * 1000,
    );
    const row = await this.prisma.db.invite.create({
      data: {
        organizationId: input.organizationId,
        email: input.email.toLowerCase(),
        roleKey: input.roleKey,
        tokenHash: sha256(raw),
        expiresAt,
        createdBy: input.createdBy ?? null,
      },
      select: { id: true },
    });
    return { token: raw, inviteId: row.id, expiresAt };
  }
}
