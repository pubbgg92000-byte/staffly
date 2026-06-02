"use client";

import type { DefaultPortal } from "@staffly/types";

/**
 * Pick where to send the user after a successful sign-in. If their
 * `defaultPortal` matches the portal currently running, stay on this origin
 * (use the `?from=` query param when present). Otherwise hop to the other
 * portal's base URL — cookies live on the same `COOKIE_DOMAIN` so the
 * other portal sees them as authenticated.
 *
 * `current` is the portal the form is executing in. Determined by reading
 * `NEXT_PUBLIC_PORTAL` at build time, set by each app.
 */
export function resolveRedirect(input: {
  current: DefaultPortal;
  defaultPortal: DefaultPortal;
  from?: string | null;
}): string {
  const sameHost = input.current === input.defaultPortal;
  if (sameHost) {
    return safePath(input.from) ?? "/dashboard";
  }
  const base =
    input.defaultPortal === "admin"
      ? (envVar("NEXT_PUBLIC_ADMIN_BASE_URL") ?? "http://localhost:3000")
      : (envVar("NEXT_PUBLIC_EMPLOYEE_BASE_URL") ?? "http://localhost:3001");
  return `${base.replace(/\/+$/, "")}/dashboard`;
}

function envVar(name: string): string | undefined {
  if (typeof process === "undefined") return undefined;
  return process.env[name];
}

/**
 * Allow only relative paths starting with `/` for `?from=`. Drops anything
 * looking like an absolute URL or a protocol-relative path to defeat
 * open-redirect attempts.
 */
function safePath(value: string | null | undefined): string | null {
  if (!value) return null;
  if (!value.startsWith("/") || value.startsWith("//")) return null;
  return value;
}
