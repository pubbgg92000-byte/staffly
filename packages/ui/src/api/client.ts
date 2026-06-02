/**
 * Shared fetch client for both portals.
 *
 * - Reads `NEXT_PUBLIC_API_BASE_URL` (defaults to http://localhost:4000).
 * - Sends `credentials: "include"` so the httpOnly auth cookies travel.
 * - For mutating verbs, reads the `sf_csrf` cookie (JS-readable) and sets
 *   the `X-CSRF-Token` header (matches apps/api/src/auth/cookies.ts).
 * - On a 401, attempts ONE refresh via POST /auth/refresh, then retries the
 *   original request. A second 401 throws — callers (or app-level error
 *   boundaries) decide whether to redirect to sign-in.
 *
 * Side-effect-free at module load: the actual `fetch` only happens when a
 * method is called, so this is safe to import from server components.
 */
import { ApiError } from "./error";

const CSRF_COOKIE = "sf_csrf";
const CSRF_HEADER = "x-csrf-token";

type Method = "GET" | "POST" | "PATCH" | "PUT" | "DELETE";

export interface ApiFetchOptions {
  /** Override the base URL — used by SSR helpers that route through Next. */
  baseUrl?: string;
  /** Forward cookie header explicitly (server-side fetch). */
  cookie?: string;
  /** Disable auto-retry on 401; rare. */
  skipRefresh?: boolean;
  /** Pass extra headers (e.g. Idempotency-Key). */
  headers?: Record<string, string>;
  /** Abort signal for cancellation. */
  signal?: AbortSignal;
}

function readCookie(name: string): string | undefined {
  if (typeof document === "undefined") return undefined;
  const target = `${name}=`;
  for (const part of document.cookie.split(";")) {
    const trimmed = part.trim();
    if (trimmed.startsWith(target)) return trimmed.slice(target.length);
  }
  return undefined;
}

function resolveBase(opts: ApiFetchOptions): string {
  if (opts.baseUrl) return opts.baseUrl.replace(/\/+$/, "");
  // `NEXT_PUBLIC_*` is inlined at build time on the client; on the server it
  // reads from process.env at request time.
  const fromEnv =
    typeof process !== "undefined"
      ? process.env.NEXT_PUBLIC_API_BASE_URL
      : undefined;
  return (fromEnv ?? "http://localhost:4000").replace(/\/+$/, "");
}

async function parseError(res: Response): Promise<ApiError> {
  let body: unknown;
  try {
    body = await res.json();
  } catch {
    return new ApiError({
      status: res.status,
      code: "http.error",
      message: res.statusText || `HTTP ${res.status}`,
    });
  }
  if (
    body &&
    typeof body === "object" &&
    "error" in body &&
    body.error &&
    typeof body.error === "object"
  ) {
    const e = body.error as { code?: string; message?: string };
    return new ApiError({
      status: res.status,
      code: e.code ?? "http.error",
      message: e.message ?? res.statusText ?? `HTTP ${res.status}`,
      details: body,
    });
  }
  return new ApiError({
    status: res.status,
    code: "http.error",
    message: res.statusText || `HTTP ${res.status}`,
    details: body,
  });
}

async function refreshOnce(
  base: string,
  cookie: string | undefined,
): Promise<boolean> {
  const headers: Record<string, string> = {};
  const csrf = readCookie(CSRF_COOKIE);
  if (csrf) headers[CSRF_HEADER] = csrf;
  if (cookie) headers["cookie"] = cookie;
  try {
    const res = await fetch(`${base}/auth/refresh`, {
      method: "POST",
      credentials: "include",
      headers,
    });
    return res.ok || res.status === 204;
  } catch {
    return false;
  }
}

async function call<T>(
  method: Method,
  path: string,
  body: unknown,
  opts: ApiFetchOptions,
): Promise<T> {
  const base = resolveBase(opts);
  const url = `${base}${path.startsWith("/") ? path : `/${path}`}`;
  const headers: Record<string, string> = {
    accept: "application/json",
    ...(opts.headers ?? {}),
  };
  if (body !== undefined) headers["content-type"] = "application/json";
  if (method !== "GET") {
    const csrf = readCookie(CSRF_COOKIE);
    if (csrf) headers[CSRF_HEADER] = csrf;
  }
  if (opts.cookie) headers["cookie"] = opts.cookie;

  const init: RequestInit = {
    method,
    credentials: "include",
    headers,
  };
  if (opts.signal) init.signal = opts.signal;
  if (body !== undefined) init.body = JSON.stringify(body);

  let res = await fetch(url, init);
  if (res.status === 401 && !opts.skipRefresh) {
    const refreshed = await refreshOnce(base, opts.cookie);
    if (refreshed) {
      // The refresh call rotates Set-Cookie on the browser; resend the
      // original request with the new cookie set.
      const retryHeaders: Record<string, string> = { ...headers };
      if (method !== "GET") {
        const newCsrf = readCookie(CSRF_COOKIE);
        if (newCsrf) retryHeaders[CSRF_HEADER] = newCsrf;
      }
      res = await fetch(url, { ...init, headers: retryHeaders });
    }
  }

  if (res.status === 204) return undefined as T;
  if (!res.ok) throw await parseError(res);

  // JSON 200 — empty body is uncommon but possible.
  const text = await res.text();
  if (!text) return undefined as T;
  return JSON.parse(text) as T;
}

export const api = {
  get: <T>(path: string, opts: ApiFetchOptions = {}): Promise<T> =>
    call<T>("GET", path, undefined, opts),
  post: <T>(
    path: string,
    body?: unknown,
    opts: ApiFetchOptions = {},
  ): Promise<T> => call<T>("POST", path, body, opts),
  patch: <T>(
    path: string,
    body?: unknown,
    opts: ApiFetchOptions = {},
  ): Promise<T> => call<T>("PATCH", path, body, opts),
  put: <T>(
    path: string,
    body?: unknown,
    opts: ApiFetchOptions = {},
  ): Promise<T> => call<T>("PUT", path, body, opts),
  delete: <T>(path: string, opts: ApiFetchOptions = {}): Promise<T> =>
    call<T>("DELETE", path, undefined, opts),
};

export type Api = typeof api;
