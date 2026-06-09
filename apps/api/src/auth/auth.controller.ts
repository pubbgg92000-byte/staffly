import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Query,
  Req,
  Res,
  UnauthorizedException,
  UseGuards,
} from "@nestjs/common";
import type { Request, Response } from "express";
import { Throttle } from "@nestjs/throttler";
import {
  AuthService,
  isChallenge,
  type AuthResult,
  type InvitePeek,
  type MeResult,
  type SigninOutcome,
  type TwoFactorChallengeResult,
} from "./auth.service";

/**
 * Strict per-IP limits for credential / token endpoints — tighter than the
 * global 120/min default. Keyed on the real client IP by
 * ThrottlerBehindProxyGuard. Blunts brute-force + enumeration on the public
 * demo (defence-in-depth alongside the Cloudflare WAF rule).
 */
const AUTH_THROTTLE = { default: { limit: 10, ttl: 60_000 } } as const;
import { SignupBody, type SignupBodyT } from "./dto/signup.dto";
import { SigninBody, type SigninBodyT } from "./dto/signin.dto";
import {
  ForgotPasswordBody,
  type ForgotPasswordBodyT,
} from "./dto/forgot-password.dto";
import {
  ResetPasswordBody,
  type ResetPasswordBodyT,
} from "./dto/reset-password.dto";
import {
  VerifyTwoFactorBody,
  type VerifyTwoFactorBodyT,
} from "./dto/verify-2fa.dto";
import {
  AcceptInviteBody,
  PeekInviteQuery,
  type AcceptInviteBodyT,
  type PeekInviteQueryT,
} from "./dto/accept-invite.dto";
import { ZodBody } from "../common/zod-validation.pipe";
import { ZodQuery } from "../common/zod-query.pipe";
import { Public } from "./decorators/public.decorator";
import {
  CurrentUser,
  type RequestUser,
} from "./decorators/current-user.decorator";
import { setAuthCookies, clearAuthCookies, REFRESH_COOKIE } from "./cookies";
import { CsrfGuard } from "./guards/csrf.guard";

interface CookieBag {
  [name: string]: string | undefined;
}

type SignInPublic =
  | (Omit<AuthResult, "tokens"> & { challenge?: undefined })
  | TwoFactorChallengeResult;

@Controller("auth")
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  // ─── Signup (org bootstrap) ─────────────────────────────────────────

  @Public()
  @Throttle(AUTH_THROTTLE)
  @Post("signup")
  async signup(
    @Body(new ZodBody(SignupBody)) body: SignupBodyT,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<Omit<AuthResult, "tokens">> {
    const result = await this.auth.signup(body, this.ctx(req));
    setAuthCookies(res, result.tokens);
    res.status(HttpStatus.CREATED);
    return {
      user: result.user,
      organization: result.organization,
      defaultPortal: result.defaultPortal,
    };
  }

  // ─── Signin (password + optional 2FA challenge) ─────────────────────

  @Public()
  @Throttle(AUTH_THROTTLE)
  @Post("signin")
  @HttpCode(HttpStatus.OK)
  async signin(
    @Body(new ZodBody(SigninBody)) body: SigninBodyT,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<SignInPublic> {
    const result: SigninOutcome = await this.auth.signin(body, this.ctx(req));
    if (isChallenge(result)) {
      // Do NOT set auth cookies until 2FA verifies.
      return result;
    }
    setAuthCookies(res, result.tokens);
    return {
      user: result.user,
      organization: result.organization,
      defaultPortal: result.defaultPortal,
    };
  }

  // ─── Verify 2FA ─────────────────────────────────────────────────────

  @Public()
  @Throttle(AUTH_THROTTLE)
  @Post("verify-2fa")
  @HttpCode(HttpStatus.OK)
  async verifyTwoFactor(
    @Body(new ZodBody(VerifyTwoFactorBody)) body: VerifyTwoFactorBodyT,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<Omit<AuthResult, "tokens">> {
    const result = await this.auth.verifyTwoFactor(body, this.ctx(req));
    setAuthCookies(res, result.tokens);
    return {
      user: result.user,
      organization: result.organization,
      defaultPortal: result.defaultPortal,
    };
  }

  // ─── Refresh + logout + me ──────────────────────────────────────────

  @Public()
  @UseGuards(CsrfGuard)
  @Post("refresh")
  @HttpCode(HttpStatus.NO_CONTENT)
  async refresh(
    @Req() req: Request & { cookies?: CookieBag },
    @Res({ passthrough: true }) res: Response,
  ): Promise<void> {
    const presented = req.cookies?.[REFRESH_COOKIE];
    if (!presented) {
      throw new UnauthorizedException({ code: "auth.unauthenticated" });
    }
    const tokens = await this.auth.refresh(presented, this.ctx(req));
    setAuthCookies(res, tokens);
  }

  @Post("logout")
  @HttpCode(HttpStatus.NO_CONTENT)
  async logout(
    @Req() req: Request & { cookies?: CookieBag },
    @Res({ passthrough: true }) res: Response,
  ): Promise<void> {
    await this.auth.logout(req.cookies?.[REFRESH_COOKIE]);
    clearAuthCookies(res);
  }

  /**
   * Alias for clients that prefer the spelling `signout`. Same semantics as
   * `/auth/logout` — clears cookies and revokes the presented refresh.
   */
  @Post("signout")
  @HttpCode(HttpStatus.NO_CONTENT)
  signout(
    @Req() req: Request & { cookies?: CookieBag },
    @Res({ passthrough: true }) res: Response,
  ): Promise<void> {
    return this.logout(req, res);
  }

  @Get("me")
  me(@CurrentUser() user: RequestUser): Promise<MeResult> {
    return this.auth.me(user.userId);
  }

  // ─── Forgot / reset ─────────────────────────────────────────────────

  /**
   * Always returns 200 to avoid email enumeration. Dev mode includes the
   * generated reset URL in the response body so the developer can copy it
   * without setting up SMTP — production strips this field.
   */
  @Public()
  @Throttle(AUTH_THROTTLE)
  @Post("forgot-password")
  @HttpCode(HttpStatus.OK)
  forgotPassword(
    @Body(new ZodBody(ForgotPasswordBody)) body: ForgotPasswordBodyT,
    @Req() req: Request,
  ): Promise<{ ok: true; devResetUrl?: string }> {
    return this.auth.forgotPassword(body, this.ctx(req));
  }

  @Public()
  @Throttle(AUTH_THROTTLE)
  @Post("reset-password")
  @HttpCode(HttpStatus.OK)
  resetPassword(
    @Body(new ZodBody(ResetPasswordBody)) body: ResetPasswordBodyT,
  ): Promise<{ ok: true }> {
    return this.auth.resetPassword(body);
  }

  // ─── Invite ─────────────────────────────────────────────────────────

  @Public()
  @Get("invite")
  peekInvite(
    @Query(new ZodQuery(PeekInviteQuery)) q: PeekInviteQueryT,
  ): Promise<InvitePeek> {
    return this.auth.peekInvite(q.token);
  }

  @Public()
  @Throttle(AUTH_THROTTLE)
  @Post("accept-invite")
  @HttpCode(HttpStatus.OK)
  async acceptInvite(
    @Body(new ZodBody(AcceptInviteBody)) body: AcceptInviteBodyT,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<Omit<AuthResult, "tokens">> {
    const result = await this.auth.acceptInvite(body, this.ctx(req));
    setAuthCookies(res, result.tokens);
    return {
      user: result.user,
      organization: result.organization,
      defaultPortal: result.defaultPortal,
    };
  }

  // ─── Helpers ────────────────────────────────────────────────────────

  private ctx(req: Request): { userAgent?: string; ipAddress?: string } {
    const ua = req.headers["user-agent"];
    return {
      userAgent: typeof ua === "string" ? ua : undefined,
      ipAddress: req.ip,
    };
  }
}
