import { NextResponse, type NextRequest } from "next/server";

const ACCESS_COOKIE = "sf_access";

const PUBLIC_PATHS = [
  "/auth/sign-in",
  "/auth/forgot-password",
  "/auth/reset-password",
  "/auth/two-factor",
  "/auth/accept-invite",
];

/**
 * Same cookie-presence gate as the admin app. The validity of the access
 * token is enforced server-side by every API call.
 */
export function middleware(req: NextRequest): NextResponse {
  const { pathname, search } = req.nextUrl;
  const hasAccess = req.cookies.has(ACCESS_COOKIE);
  const isPublic = PUBLIC_PATHS.some((p) => pathname.startsWith(p));

  if (isPublic && hasAccess) {
    const url = req.nextUrl.clone();
    url.pathname = "/dashboard";
    url.search = "";
    return NextResponse.redirect(url);
  }
  if (!isPublic && !hasAccess) {
    const url = req.nextUrl.clone();
    url.pathname = "/auth/sign-in";
    url.search = `?from=${encodeURIComponent(pathname + search)}`;
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next|favicon.ico|api/stub).*)"],
};
