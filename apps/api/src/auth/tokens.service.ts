import { Injectable, UnauthorizedException, Logger } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { randomBytes, createHash, randomUUID } from "node:crypto";
import { PrismaService } from "../infra/prisma/prisma.service";
import { loadEnv } from "../infra/config/env";

export interface AccessTokenClaims {
  sub: string;
  org: string;
  jti: string;
  iat: number;
  exp: number;
}

export interface IssuedTokens {
  accessToken: string;
  accessTokenTtlSeconds: number;
  refreshToken: string;
  refreshTokenTtlSeconds: number;
  csrfToken: string;
}

export interface RefreshContext {
  userAgent?: string | null;
  ipAddress?: string | null;
}

function sha256(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

function urlSafe(bytes: Buffer): string {
  return bytes.toString("base64url");
}

@Injectable()
export class TokensService {
  private readonly logger = new Logger(TokensService.name);
  private readonly env = loadEnv();

  constructor(
    private readonly jwt: JwtService,
    private readonly prisma: PrismaService,
  ) {}

  signAccessToken(
    userId: string,
    organizationId: string,
  ): {
    token: string;
    ttlSeconds: number;
  } {
    const ttlSeconds = this.env.ACCESS_TOKEN_TTL_SECONDS;
    const token = this.jwt.sign(
      { sub: userId, org: organizationId, jti: randomUUID() },
      { expiresIn: ttlSeconds, secret: this.env.JWT_SECRET },
    );
    return { token, ttlSeconds };
  }

  verifyAccessToken(token: string): AccessTokenClaims {
    try {
      return this.jwt.verify<AccessTokenClaims>(token, {
        secret: this.env.JWT_SECRET,
      });
    } catch {
      throw new UnauthorizedException({ code: "auth.unauthenticated" });
    }
  }

  /** Generates a new opaque refresh token and persists its hash. */
  async issueRefreshToken(
    userId: string,
    organizationId: string,
    ctx: RefreshContext = {},
    parentId: string | null = null,
  ): Promise<{ token: string; ttlSeconds: number }> {
    const raw = urlSafe(randomBytes(32));
    const ttlSeconds = this.env.REFRESH_TOKEN_TTL_SECONDS;
    const expiresAt = new Date(Date.now() + ttlSeconds * 1000);
    await this.prisma.db.refreshToken.create({
      data: {
        organizationId,
        userId,
        tokenHash: sha256(raw),
        parentId,
        userAgent: ctx.userAgent ?? null,
        ipAddress: ctx.ipAddress ?? null,
        expiresAt,
      },
    });
    return { token: raw, ttlSeconds };
  }

  newCsrfToken(): string {
    return urlSafe(randomBytes(32));
  }

  /**
   * Rotate a refresh token. Returns the newly issued (access, refresh, csrf)
   * triple. On reuse of an already-revoked token, revokes the entire chain
   * (descendants reachable via `parent_id`) and throws 401.
   */
  async rotate(
    presentedToken: string,
    ctx: RefreshContext = {},
  ): Promise<IssuedTokens> {
    const tokenHash = sha256(presentedToken);
    const row = await this.prisma.db.refreshToken.findUnique({
      where: { tokenHash },
    });

    if (!row) {
      throw new UnauthorizedException({ code: "auth.unauthenticated" });
    }

    if (row.revokedAt) {
      // Reuse detected — invalidate the entire chain rooted at this token.
      await this.revokeChain(row.id, "reuse_detected");
      this.logger.warn(
        `Refresh token reuse detected for user=${row.userId}; chain revoked`,
      );
      throw new UnauthorizedException({ code: "auth.unauthenticated" });
    }

    if (row.expiresAt.getTime() <= Date.now()) {
      throw new UnauthorizedException({ code: "auth.unauthenticated" });
    }

    const access = this.signAccessToken(row.userId, row.organizationId);
    const refresh = await this.issueRefreshToken(
      row.userId,
      row.organizationId,
      ctx,
      row.id,
    );
    await this.prisma.db.refreshToken.update({
      where: { id: row.id },
      data: { revokedAt: new Date(), revokeReason: "rotated" },
    });

    return {
      accessToken: access.token,
      accessTokenTtlSeconds: access.ttlSeconds,
      refreshToken: refresh.token,
      refreshTokenTtlSeconds: refresh.ttlSeconds,
      csrfToken: this.newCsrfToken(),
    };
  }

  /** Revoke a single presented refresh token (logout). */
  async revokeByToken(presentedToken: string): Promise<void> {
    const tokenHash = sha256(presentedToken);
    await this.prisma.db.refreshToken.updateMany({
      where: { tokenHash, revokedAt: null },
      data: { revokedAt: new Date(), revokeReason: "logout" },
    });
  }

  /** Revoke a token and every descendant reachable via `parent_id`. */
  async revokeChain(rootId: string, reason: string): Promise<void> {
    const seen = new Set<string>();
    const queue: string[] = [rootId];
    while (queue.length > 0) {
      const id = queue.shift() as string;
      if (seen.has(id)) continue;
      seen.add(id);
      const children = await this.prisma.db.refreshToken.findMany({
        where: { parentId: id },
        select: { id: true },
      });
      for (const c of children) queue.push(c.id);
    }
    await this.prisma.db.refreshToken.updateMany({
      where: { id: { in: Array.from(seen) }, revokedAt: null },
      data: { revokedAt: new Date(), revokeReason: reason },
    });
  }

  /** Used by signup/signin to mint the first triple for a session. */
  async issueInitialTokens(
    userId: string,
    organizationId: string,
    ctx: RefreshContext = {},
  ): Promise<IssuedTokens> {
    const access = this.signAccessToken(userId, organizationId);
    const refresh = await this.issueRefreshToken(userId, organizationId, ctx);
    return {
      accessToken: access.token,
      accessTokenTtlSeconds: access.ttlSeconds,
      refreshToken: refresh.token,
      refreshTokenTtlSeconds: refresh.ttlSeconds,
      csrfToken: this.newCsrfToken(),
    };
  }
}
