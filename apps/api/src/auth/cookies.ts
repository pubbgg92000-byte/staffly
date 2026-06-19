import type { Response } from "express";
import type { IssuedTokens } from "./tokens.service";
import { loadEnv } from "../infra/config/env";

export const ACCESS_COOKIE = "sf_access";
export const REFRESH_COOKIE = "sf_refresh";
export const CSRF_COOKIE = "sf_csrf";
export const CSRF_HEADER = "x-csrf-token";

/** Path scope for the refresh cookie — only sent to /auth/refresh and /auth/logout. */
const REFRESH_PATH = "/auth";

function baseOptions(): {
  domain?: string;
  secure: boolean;
  sameSite: "none" | "lax";
  path: string;
} {
  const env = loadEnv();

  return {
    domain: env.COOKIE_DOMAIN || undefined,
    secure: env.NODE_ENV === "production",
    sameSite: env.NODE_ENV === "production" ? "none" : "lax",
    path: "/",
  };
}

export function setAuthCookies(res: Response, tokens: IssuedTokens): void {
  const base = baseOptions();

  res.cookie(ACCESS_COOKIE, tokens.accessToken, {
    ...base,
    httpOnly: true,
    maxAge: tokens.accessTokenTtlSeconds * 1000,
  });

  res.cookie(REFRESH_COOKIE, tokens.refreshToken, {
    ...base,
    path: REFRESH_PATH,
    httpOnly: true,
    maxAge: tokens.refreshTokenTtlSeconds * 1000,
  });

  res.cookie(CSRF_COOKIE, tokens.csrfToken, {
    ...base,
    httpOnly: false,
    maxAge: tokens.refreshTokenTtlSeconds * 1000,
  });
}

export function clearAuthCookies(res: Response): void {
  const base = baseOptions();
  res.clearCookie(ACCESS_COOKIE, { ...base, httpOnly: true });
  res.clearCookie(REFRESH_COOKIE, {
    ...base,
    path: REFRESH_PATH,
    httpOnly: true,
  });
  res.clearCookie(CSRF_COOKIE, { ...base, httpOnly: false });
}
