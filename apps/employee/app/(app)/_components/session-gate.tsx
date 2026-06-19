"use client";

import { useEffect, type ReactNode } from "react";
import { useSession } from "@staffly/ui";

const SIGN_IN_PATH = "/auth/sign-in";

/**
 * Protect employee routes using the API-backed session instead of checking for
 * API-domain cookies in Next middleware. In split-domain demo deployments the
 * browser sends sf_access to the API, but never to the Vercel portal request.
 */
export function SessionGate({ children }: { children: ReactNode }): ReactNode {
  const { data: session, isLoading, isError, refetch } = useSession();

  useEffect(() => {
    if (isLoading || isError || session !== null) return;

    const from = encodeURIComponent(
      window.location.pathname + window.location.search,
    );
    window.location.replace(`${SIGN_IN_PATH}?from=${from}`);
  }, [isError, isLoading, session]);

  if (isLoading || session === null) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background text-sm text-muted-foreground">
        Checking your session…
      </div>
    );
  }

  if (isError || session === undefined) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-background px-4 text-center">
        <p className="text-sm text-muted-foreground">
          We could not verify your session. Check your connection and try again.
        </p>
        <button
          type="button"
          className="rounded-md border border-border px-3 py-1.5 text-sm font-medium hover:bg-muted"
          onClick={refetch}
        >
          Try again
        </button>
      </div>
    );
  }

  return children;
}
