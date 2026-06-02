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
 * Auth gate based on the *presence* of the access cookie (not its validity —
 * the API enforces that). This just keeps unauthenticated users out of
 * authenticated routes and authenticated users away from sign-in.
 *
 * Edge runtime — no Node deps.
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
  // Match everything except Next internals, the Sonner/Devtools static files,
  // and the local stub route handler.
  matcher: ["/((?!_next|favicon.ico|api/stub).*)"],
};
