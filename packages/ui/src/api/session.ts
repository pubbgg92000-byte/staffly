"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "./client";
import { ApiError } from "./error";
import type {
  AcceptInviteInput,
  AuthSuccess,
  ForgotPasswordInput,
  ForgotPasswordResponse,
  InvitePeekResponse,
  MeResponse,
  ResetPasswordInput,
  ResetPasswordResponse,
  SignInInput,
  SignInResponse,
  TwoFactorInput,
  VerifyTwoFactorResponse,
} from "@staffly/types";

/** Reusable React Query keys for the auth surface. */
export const sessionKeys = {
  me: ["auth", "me"] as const,
  invite: (token: string) => ["auth", "invite", token] as const,
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
  typeof useMutation<SignInResponse, ApiError, SignInInput>
> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: SignInInput) =>
      api.post<SignInResponse>("/auth/signin", input),
    onSuccess: (res) => {
      // Only prime the session cache if the user is fully signed in.
      // 2FA challenge returns a `challenge` payload — no cookies yet.
      if ("user" in res) {
        qc.setQueryData(sessionKeys.me, {
          user: {
            ...res.user,
            organizationId: res.organization.id,
            defaultPortal: res.defaultPortal,
          },
          permissions: [],
        } satisfies MeResponse);
        void qc.invalidateQueries({ queryKey: sessionKeys.me });
      }
    },
  });
}

export function useVerifyTwoFactor(): ReturnType<
  typeof useMutation<VerifyTwoFactorResponse, ApiError, TwoFactorInput>
> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: TwoFactorInput) =>
      api.post<VerifyTwoFactorResponse>("/auth/verify-2fa", input),
    onSuccess: (res) => {
      qc.setQueryData(sessionKeys.me, {
        user: {
          ...res.user,
          organizationId: res.organization.id,
          defaultPortal: res.defaultPortal,
        },
        permissions: [],
      } satisfies MeResponse);
      void qc.invalidateQueries({ queryKey: sessionKeys.me });
    },
  });
}

export function useForgotPassword(): ReturnType<
  typeof useMutation<ForgotPasswordResponse, ApiError, ForgotPasswordInput>
> {
  return useMutation({
    mutationFn: (input) =>
      api.post<ForgotPasswordResponse>("/auth/forgot-password", input),
  });
}

export function useResetPassword(): ReturnType<
  typeof useMutation<ResetPasswordResponse, ApiError, ResetPasswordInput>
> {
  return useMutation({
    mutationFn: ({ token, password }) =>
      api.post<ResetPasswordResponse>("/auth/reset-password", {
        token,
        password,
      }),
  });
}

export function useInvitePeek(token: string | null): {
  data: InvitePeekResponse | undefined;
  isLoading: boolean;
  error: ApiError | null;
} {
  const q = useQuery({
    queryKey: sessionKeys.invite(token ?? ""),
    queryFn: () =>
      api.get<InvitePeekResponse>(
        `/auth/invite?token=${encodeURIComponent(token ?? "")}`,
      ),
    enabled: !!token,
    retry: false,
    staleTime: 5 * 60_000,
  });
  return {
    data: q.data,
    isLoading: q.isLoading,
    error: q.error instanceof ApiError ? q.error : null,
  };
}

export function useAcceptInvite(): ReturnType<
  typeof useMutation<AuthSuccess, ApiError, AcceptInviteInput>
> {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input) => api.post<AuthSuccess>("/auth/accept-invite", input),
    onSuccess: (res) => {
      qc.setQueryData(sessionKeys.me, {
        user: {
          ...res.user,
          organizationId: res.organization.id,
          defaultPortal: res.defaultPortal,
        },
        permissions: [],
      } satisfies MeResponse);
      void qc.invalidateQueries({ queryKey: sessionKeys.me });
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

/**
 * React hook returning a `has(permission)` checker for the current user.
 *
 * `super_admin` short-circuits to `true` for any check — defensive belt; the
 * backend already expands the `"*"` sentinel into a full permission list, so
 * `data?.permissions` will contain every permission, but the role check keeps
 * us safe if the server response ever omits the array.
 */
export function usePermissionCheck(): {
  has: (permission: string) => boolean;
  isLoading: boolean;
} {
  const { data, isLoading } = useSession();
  const perms = data?.permissions;
  const isSuperAdmin = data?.user.role === "super_admin";
  const has = (permission: string): boolean => {
    if (isSuperAdmin) return true;
    if (!perms) return false;
    return perms.includes(permission);
  };
  return { has, isLoading };
}
