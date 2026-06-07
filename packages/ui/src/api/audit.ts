"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "./client";
import { ApiError } from "./error";
import type {
  AuditLogDetail,
  AuditLogListParams,
  AuditLogListResponse,
} from "@staffly/types";

export const auditKeys = {
  all: ["audit"] as const,
  list: (params?: AuditLogListParams) =>
    ["audit", "list", params ?? {}] as const,
  detail: (id: string) => ["audit", "detail", id] as const,
};

function listQs(params?: AuditLogListParams): string {
  if (!params) return "";
  const sp = new URLSearchParams();
  if (params.page) sp.set("page", String(params.page));
  if (params.pageSize) sp.set("pageSize", String(params.pageSize));
  if (params.action) sp.set("action", params.action);
  if (params.resourceType) sp.set("resourceType", params.resourceType);
  if (params.actorUserId) sp.set("actorUserId", params.actorUserId);
  if (params.resourceId) sp.set("resourceId", params.resourceId);
  if (params.from) sp.set("from", params.from);
  if (params.to) sp.set("to", params.to);
  if (params.search) sp.set("search", params.search);
  if (params.sortDir) sp.set("sortDir", params.sortDir);
  const qs = sp.toString();
  return qs ? `?${qs}` : "";
}

export function useAuditLogs(params?: AuditLogListParams): {
  data: AuditLogListResponse | undefined;
  isLoading: boolean;
  isError: boolean;
  error: ApiError | null;
  refetch: () => void;
} {
  const q = useQuery({
    queryKey: auditKeys.list(params),
    queryFn: () =>
      api.get<AuditLogListResponse>(`/audit-logs${listQs(params)}`),
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

export function useAuditLog(id: string | undefined): {
  data: AuditLogDetail | undefined;
  isLoading: boolean;
  isError: boolean;
  error: ApiError | null;
} {
  const q = useQuery({
    queryKey: auditKeys.detail(id ?? ""),
    queryFn: () => api.get<AuditLogDetail>(`/audit-logs/${id}`),
    staleTime: 30_000,
    enabled: !!id,
    retry: 1,
  });
  return {
    data: q.data,
    isLoading: q.isLoading,
    isError: q.isError,
    error: q.error instanceof ApiError ? q.error : null,
  };
}
