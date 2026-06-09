"use client";

import {
  QueryCache,
  MutationCache,
  QueryClient,
  QueryClientProvider,
  isServer,
} from "@tanstack/react-query";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import { useState, type ReactNode } from "react";
import { toast } from "sonner";
import { sessionKeys } from "../api/session";

const SIGN_IN_PATH = "/auth/sign-in";

/**
 * Global session-expiry handler. Any query/mutation that fails with 401 means
 * the session is no longer valid (access token expired AND refresh failed — the
 * client already attempts a single refresh first; see api/client.ts). We clear
 * cached data and hard-redirect to sign-in with a toast.
 *
 * Two guards:
 *  - The `/auth/me` query is exempt: a 401 there is the *normal* signed-out
 *    state (it resolves to `null`, not an error), and exempting it avoids
 *    redirect loops on the public sign-in page.
 *  - A module-level flag debounces concurrent 401s (a dashboard fires many
 *    queries at once) into a single redirect. It also short-circuits when
 *    already on the sign-in route.
 */
let handlingExpiry = false;

function handleSessionExpiry(
  error: unknown,
  queryKey: readonly unknown[] | undefined,
  client: QueryClient,
): void {
  if (isServer) return;
  const status = (error as { status?: number } | null)?.status;
  if (status !== 401) return;
  // Exempt auth/session probes (e.g. /auth/me, invite peek) — a 401 there is a
  // valid signed-out/public state, not a mid-session expiry, and exempting it
  // avoids redirect loops on the public sign-in page.
  if (queryKey && queryKey[0] === sessionKeys.me[0]) return;
  if (handlingExpiry) return;
  if (window.location.pathname.startsWith(SIGN_IN_PATH)) return;
  handlingExpiry = true;

  toast.error("Session expired", {
    description: "Please sign in again.",
  });
  client.clear();
  // Best-effort cookie clear (logout is @Public, so it works with an expired
  // token) so the cookie-presence middleware lets us land on sign-in instead
  // of bouncing back. Redirect regardless of whether it resolves.
  const done = (): void => {
    const from = encodeURIComponent(
      window.location.pathname + window.location.search,
    );
    window.location.assign(`${SIGN_IN_PATH}?from=${from}`);
  };
  void fetch(
    `${process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4000"}/auth/logout`,
    { method: "POST", credentials: "include" },
  )
    .catch(() => undefined)
    .finally(done);
}

function makeClient(): QueryClient {
  const client: QueryClient = new QueryClient({
    queryCache: new QueryCache({
      onError: (error, query) =>
        handleSessionExpiry(error, query.queryKey, client),
    }),
    mutationCache: new MutationCache({
      onError: (error) => handleSessionExpiry(error, undefined, client),
    }),
    defaultOptions: {
      queries: {
        // 30s aligns with the dashboard polling cadence in docs/03 §12.
        staleTime: 30_000,
        gcTime: 5 * 60_000,
        retry: (failureCount, error) => {
          // Auth/permission errors should fail fast — retry would hide them.
          const status = (error as { status?: number } | null)?.status;
          if (status === 401 || status === 403 || status === 404) return false;
          return failureCount < 1;
        },
        refetchOnWindowFocus: true,
      },
    },
  });
  return client;
}

let browserQueryClient: QueryClient | undefined;

function getClient(): QueryClient {
  if (isServer) return makeClient();
  if (!browserQueryClient) browserQueryClient = makeClient();
  return browserQueryClient;
}

export function QueryProvider({
  children,
}: {
  children: ReactNode;
}): ReactNode {
  // Use lazy initializer so the client survives Suspense boundaries — see
  // Tanstack Query's Next.js guide.
  const [client] = useState(() => getClient());
  return (
    <QueryClientProvider client={client}>
      {children}
      {process.env.NODE_ENV === "development" ? (
        <ReactQueryDevtools
          initialIsOpen={false}
          buttonPosition="bottom-left"
        />
      ) : null}
    </QueryClientProvider>
  );
}
