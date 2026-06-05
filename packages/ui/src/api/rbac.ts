"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "./client";
import { ApiError } from "./error";
import type {
  AssignRoleInput,
  CreateInviteInput,
  CreateRoleInput,
  InviteIssuedResponse,
  InviteListParams,
  InviteListResponse,
  PermissionListResponse,
  RbacUserListParams,
  RbacUserListResponse,
  RoleDetail,
  RoleListItem,
  RoleListParams,
  RoleListResponse,
  UpdateRoleInput,
} from "@staffly/types";

export const rbacKeys = {
  roles: {
    list: (params?: RoleListParams) =>
      ["rbac", "roles", "list", params ?? {}] as const,
    detail: (id: string) => ["rbac", "roles", "detail", id] as const,
  },
  permissions: ["rbac", "permissions"] as const,
  users: {
    list: (params?: RbacUserListParams) =>
      ["rbac", "users", "list", params ?? {}] as const,
  },
  invites: {
    list: (params?: InviteListParams) =>
      ["rbac", "invites", "list", params ?? {}] as const,
  },
};

// ─── Roles ────────────────────────────────────────────────────────────────────

function rolesQp(params?: RoleListParams): string {
  if (!params) return "";
  const sp = new URLSearchParams();
  if (params.page) sp.set("page", String(params.page));
  if (params.pageSize) sp.set("pageSize", String(params.pageSize));
  if (params.search) sp.set("search", params.search);
  if (params.includeArchived) sp.set("includeArchived", "true");
  const qs = sp.toString();
  return qs ? `?${qs}` : "";
}

export function useRoles(params?: RoleListParams): {
  data: RoleListResponse | undefined;
  isLoading: boolean;
  isError: boolean;
  error: ApiError | null;
  refetch: () => void;
} {
  const q = useQuery({
    queryKey: rbacKeys.roles.list(params),
    queryFn: () => api.get<RoleListResponse>(`/roles${rolesQp(params)}`),
    staleTime: 30_000,
    retry: 1,
  });
  return {
    data: q.data,
    isLoading: q.isLoading,
    isError: q.isError,
    error: q.error instanceof ApiError ? q.error : null,
    refetch: () => q.refetch(),
  };
}

export function useRole(id: string | undefined): {
  data: RoleDetail | undefined;
  isLoading: boolean;
  isError: boolean;
  error: ApiError | null;
  refetch: () => void;
} {
  const q = useQuery({
    queryKey: rbacKeys.roles.detail(id ?? ""),
    queryFn: () => api.get<RoleDetail>(`/roles/${id}`),
    staleTime: 30_000,
    enabled: !!id,
    retry: 1,
  });
  return {
    data: q.data,
    isLoading: q.isLoading,
    isError: q.isError,
    error: q.error instanceof ApiError ? q.error : null,
    refetch: () => q.refetch(),
  };
}

export function useCreateRole(): ReturnType<
  typeof useMutation<RoleDetail, ApiError, CreateRoleInput>
> {
  const qc = useQueryClient();
  return useMutation<RoleDetail, ApiError, CreateRoleInput>({
    mutationFn: (body) => api.post<RoleDetail>("/roles", body),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["rbac", "roles"] });
    },
  });
}

export function useUpdateRole(
  id: string,
): ReturnType<typeof useMutation<RoleDetail, ApiError, UpdateRoleInput>> {
  const qc = useQueryClient();
  return useMutation<RoleDetail, ApiError, UpdateRoleInput>({
    mutationFn: (body) => api.patch<RoleDetail>(`/roles/${id}`, body),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["rbac", "roles"] });
    },
  });
}

export function useDeleteRole(): ReturnType<
  typeof useMutation<void, ApiError, string>
> {
  const qc = useQueryClient();
  return useMutation<void, ApiError, string>({
    mutationFn: (id) => api.delete(`/roles/${id}`),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["rbac", "roles"] });
    },
  });
}

export function useRestoreRole(): ReturnType<
  typeof useMutation<RoleDetail, ApiError, string>
> {
  const qc = useQueryClient();
  return useMutation<RoleDetail, ApiError, string>({
    mutationFn: (id) => api.post<RoleDetail>(`/roles/${id}/restore`),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["rbac", "roles"] });
    },
  });
}

// ─── Permissions catalog ──────────────────────────────────────────────────────

export function usePermissions(): {
  data: PermissionListResponse | undefined;
  isLoading: boolean;
  isError: boolean;
  error: ApiError | null;
} {
  const q = useQuery({
    queryKey: rbacKeys.permissions,
    queryFn: () => api.get<PermissionListResponse>("/permissions"),
    staleTime: 5 * 60_000,
    retry: 1,
  });
  return {
    data: q.data,
    isLoading: q.isLoading,
    isError: q.isError,
    error: q.error instanceof ApiError ? q.error : null,
  };
}

// ─── Users ────────────────────────────────────────────────────────────────────

function usersQp(params?: RbacUserListParams): string {
  if (!params) return "";
  const sp = new URLSearchParams();
  if (params.page) sp.set("page", String(params.page));
  if (params.pageSize) sp.set("pageSize", String(params.pageSize));
  if (params.search) sp.set("search", params.search);
  const qs = sp.toString();
  return qs ? `?${qs}` : "";
}

export function useRbacUsers(params?: RbacUserListParams): {
  data: RbacUserListResponse | undefined;
  isLoading: boolean;
  isError: boolean;
  error: ApiError | null;
  refetch: () => void;
} {
  const q = useQuery({
    queryKey: rbacKeys.users.list(params),
    queryFn: () => api.get<RbacUserListResponse>(`/users${usersQp(params)}`),
    staleTime: 30_000,
    retry: 1,
  });
  return {
    data: q.data,
    isLoading: q.isLoading,
    isError: q.isError,
    error: q.error instanceof ApiError ? q.error : null,
    refetch: () => q.refetch(),
  };
}

export function useAssignUserRole(): ReturnType<
  typeof useMutation<
    unknown,
    ApiError,
    { userId: string; body: AssignRoleInput }
  >
> {
  const qc = useQueryClient();
  return useMutation<
    unknown,
    ApiError,
    { userId: string; body: AssignRoleInput }
  >({
    mutationFn: ({ userId, body }) => api.put(`/users/${userId}/roles`, body),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["rbac", "users"] });
      // Role counts on the roles list change too.
      void qc.invalidateQueries({ queryKey: ["rbac", "roles"] });
    },
  });
}

export function useDeactivateUser(): ReturnType<
  typeof useMutation<unknown, ApiError, string>
> {
  const qc = useQueryClient();
  return useMutation<unknown, ApiError, string>({
    mutationFn: (userId) => api.post(`/users/${userId}/deactivate`),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["rbac", "users"] });
    },
  });
}

export function useActivateUser(): ReturnType<
  typeof useMutation<unknown, ApiError, string>
> {
  const qc = useQueryClient();
  return useMutation<unknown, ApiError, string>({
    mutationFn: (userId) => api.post(`/users/${userId}/activate`),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["rbac", "users"] });
    },
  });
}

// ─── Invites ──────────────────────────────────────────────────────────────────

function invitesQp(params?: InviteListParams): string {
  if (!params) return "";
  const sp = new URLSearchParams();
  if (params.page) sp.set("page", String(params.page));
  if (params.pageSize) sp.set("pageSize", String(params.pageSize));
  if (params.status) sp.set("status", params.status);
  const qs = sp.toString();
  return qs ? `?${qs}` : "";
}

export function useInvites(params?: InviteListParams): {
  data: InviteListResponse | undefined;
  isLoading: boolean;
  isError: boolean;
  error: ApiError | null;
  refetch: () => void;
} {
  const q = useQuery({
    queryKey: rbacKeys.invites.list(params),
    queryFn: () => api.get<InviteListResponse>(`/invites${invitesQp(params)}`),
    staleTime: 15_000,
    retry: 1,
  });
  return {
    data: q.data,
    isLoading: q.isLoading,
    isError: q.isError,
    error: q.error instanceof ApiError ? q.error : null,
    refetch: () => q.refetch(),
  };
}

export function useCreateInvite(): ReturnType<
  typeof useMutation<InviteIssuedResponse, ApiError, CreateInviteInput>
> {
  const qc = useQueryClient();
  return useMutation<InviteIssuedResponse, ApiError, CreateInviteInput>({
    mutationFn: (body) => api.post<InviteIssuedResponse>("/invites", body),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["rbac", "invites"] });
    },
  });
}

export function useRevokeInvite(): ReturnType<
  typeof useMutation<void, ApiError, string>
> {
  const qc = useQueryClient();
  return useMutation<void, ApiError, string>({
    mutationFn: (id) => api.delete(`/invites/${id}`),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["rbac", "invites"] });
    },
  });
}

export function useResendInvite(): ReturnType<
  typeof useMutation<InviteIssuedResponse, ApiError, string>
> {
  const qc = useQueryClient();
  return useMutation<InviteIssuedResponse, ApiError, string>({
    mutationFn: (id) => api.post<InviteIssuedResponse>(`/invites/${id}/resend`),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["rbac", "invites"] });
    },
  });
}

// Re-export common shapes for convenience
export type { RoleListItem };
