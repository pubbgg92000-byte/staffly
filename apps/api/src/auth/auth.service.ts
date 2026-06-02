import {
  ConflictException,
  HttpException,
  Injectable,
  Logger,
  UnauthorizedException,
} from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import { PrismaService } from "../infra/prisma/prisma.service";
import { PasswordService } from "./password.service";
import { TokensService, type RefreshContext } from "./tokens.service";
import { OrgBootstrapService } from "../rbac/org-bootstrap.service";
import { PermissionsService } from "../rbac/permissions.service";
import { highestRole, type RoleKey } from "../rbac/system-roles";
import type { SignupBodyT } from "./dto/signup.dto";
import type { SigninBodyT } from "./dto/signin.dto";
import type { IssuedTokens } from "./tokens.service";

const FAILED_LOGIN_LIMIT = 10;
const LOCK_DURATION_MS = 15 * 60 * 1000;

export interface AuthResult {
  user: { id: string; email: string; role: RoleKey };
  organization: { id: string; slug: string; name: string };
  tokens: IssuedTokens;
}

export interface MeResult {
  user: { id: string; email: string; role: RoleKey };
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly passwords: PasswordService,
    private readonly tokens: TokensService,
    private readonly bootstrap: OrgBootstrapService,
    private readonly permissions: PermissionsService,
  ) {}

  async signup(body: SignupBodyT, ctx: RefreshContext): Promise<AuthResult> {
    const passwordHash = await this.passwords.hash(body.password);

    // Single transaction so a partial signup never leaves dangling rows.
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
    };
  }

  async signin(body: SigninBodyT, ctx: RefreshContext): Promise<AuthResult> {
    const invalid = new UnauthorizedException({ code: "auth.unauthenticated" });

    const user = await this.prisma.db.user.findUnique({
      where: { email: body.email },
      include: {
        organization: { select: { id: true, slug: true, name: true } },
      },
    });
    if (!user || !user.passwordHash) {
      throw invalid;
    }

    if (user.lockedUntil && user.lockedUntil.getTime() > Date.now()) {
      // HttpStatus enum omits 423 in @nestjs/common v10. Use the raw code.
      throw new HttpException({ code: "account.locked" }, 423);
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

    await this.prisma.db.user.update({
      where: { id: user.id },
      data: {
        failedLoginCount: 0,
        lockedUntil: null,
        lastLoginAt: new Date(),
        lastLoginIp: ctx.ipAddress ?? null,
      },
    });

    const roles = await this.permissions.loadUserRoles(user.id);
    const role = highestRole(roles) ?? "employee";

    const tokens = await this.tokens.issueInitialTokens(
      user.id,
      user.organizationId,
      ctx,
    );

    return {
      user: { id: user.id, email: user.email, role },
      organization: user.organization,
      tokens,
    };
  }

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
      select: { id: true, email: true },
    });
    if (!user) {
      throw new UnauthorizedException({ code: "auth.unauthenticated" });
    }
    const roles = await this.permissions.loadUserRoles(userId);
    const role = highestRole(roles) ?? "employee";
    return { user: { id: user.id, email: user.email, role } };
  }
}
