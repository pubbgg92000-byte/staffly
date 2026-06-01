import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  Res,
  UnauthorizedException,
  UseGuards,
} from "@nestjs/common";
import type { Request, Response } from "express";
import { AuthService, type AuthResult, type MeResult } from "./auth.service";
import { SignupBody, type SignupBodyT } from "./dto/signup.dto";
import { SigninBody, type SigninBodyT } from "./dto/signin.dto";
import { ZodBody } from "../common/zod-validation.pipe";
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

@Controller("auth")
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @Post("signup")
  async signup(
    @Body(new ZodBody(SignupBody)) body: SignupBodyT,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<Omit<AuthResult, "tokens">> {
    const result = await this.auth.signup(body, this.ctx(req));
    setAuthCookies(res, result.tokens);
    res.status(HttpStatus.CREATED);
    return { user: result.user, organization: result.organization };
  }

  @Public()
  @Post("signin")
  @HttpCode(HttpStatus.OK)
  async signin(
    @Body(new ZodBody(SigninBody)) body: SigninBodyT,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<{ user: AuthResult["user"] }> {
    const result = await this.auth.signin(body, this.ctx(req));
    setAuthCookies(res, result.tokens);
    return { user: result.user };
  }

  /**
   * Refresh is "public" w.r.t. the access JWT — it authenticates via the
   * refresh cookie. CSRF still applies (cookie-borne state-changing call).
   */
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

  @Get("me")
  async me(@CurrentUser() user: RequestUser): Promise<MeResult> {
    return this.auth.me(user.userId);
  }

  private ctx(req: Request): { userAgent?: string; ipAddress?: string } {
    const ua = req.headers["user-agent"];
    return {
      userAgent: typeof ua === "string" ? ua : undefined,
      ipAddress: req.ip,
    };
  }
}
