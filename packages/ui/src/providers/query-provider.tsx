"use client";

import {
  QueryClient,
  QueryClientProvider,
  isServer,
} from "@tanstack/react-query";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import { useState, type ReactNode } from "react";

function makeClient(): QueryClient {
  return new QueryClient({
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
