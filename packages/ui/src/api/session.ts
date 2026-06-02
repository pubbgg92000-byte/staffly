"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "./client";
import { ApiError } from "./error";
import type { MeResponse, SignInInput } from "@staffly/types";

/** Reusable React Query keys for the auth surface. */
export const sessionKeys = {
  me: ["auth", "me"] as const,
};

/**
 * Reads /auth/me. Returns `null` (not an error) when the user is signed out
 * so consumers can branch on truthy without try/catch. Any other error
 * (network down, 5xx) still throws and trips the error boundary.
 */
export function useSession(): {
  data: MeResponse | null | undefined;
  isLoading: boolean;
  isError: boolean;
  refetch: () => void;
} {
  const q = useQuery({
    queryKey: sessionKeys.me,
    queryFn: async (): Promise<MeResponse | null> => {
      try {
        return await api.get<MeResponse>("/auth/me");
      } catch (e) {
        if (e instanceof ApiError && e.status === 401) return null;
        throw e;
      }
    },
    staleTime: 60_000,
    retry: false,
  });
  return {
    data: q.data,
    isLoading: q.isLoading,
    isError: q.isError,
    refetch: () => q.refetch(),
  };
}

export function useSignIn(): ReturnType<
  typeof useMutation<{ user: MeResponse["user"] }, ApiError, SignInInput>
> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: SignInInput) =>
      api.post<{ user: MeResponse["user"] }>("/auth/signin", input),
    onSuccess: (res) => {
      // Prime the session cache so the next render has data immediately.
      qc.setQueryData(sessionKeys.me, { user: res.user });
    },
  });
}

export function useSignOut(): ReturnType<
  typeof useMutation<void, ApiError, void>
> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.post<void>("/auth/logout"),
    onSuccess: () => {
      qc.setQueryData(sessionKeys.me, null);
      qc.clear();
    },
  });
}
