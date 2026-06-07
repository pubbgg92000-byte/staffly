"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "./client";
import { ApiError } from "./error";
import type {
  NotificationListParams,
  NotificationListResponse,
  UnreadCountResponse,
} from "@staffly/types";

export const notificationKeys = {
  all: ["notifications"] as const,
  list: (params?: NotificationListParams) =>
    ["notifications", "list", params ?? {}] as const,
  unreadCount: ["notifications", "unread-count"] as const,
};

function listQs(params?: NotificationListParams): string {
  if (!params) return "";
  const sp = new URLSearchParams();
  if (params.page) sp.set("page", String(params.page));
  if (params.pageSize) sp.set("pageSize", String(params.pageSize));
  if (params.unreadOnly) sp.set("unreadOnly", "true");
  if (params.sortDir) sp.set("sortDir", params.sortDir);
  const qs = sp.toString();
  return qs ? `?${qs}` : "";
}

export function useNotifications(
  params?: NotificationListParams,
  opts?: { enabled?: boolean },
): {
  data: NotificationListResponse | undefined;
  isLoading: boolean;
  isError: boolean;
  error: ApiError | null;
  refetch: () => void;
} {
  const q = useQuery({
    queryKey: notificationKeys.list(params),
    queryFn: () =>
      api.get<NotificationListResponse>(`/me/notifications${listQs(params)}`),
    staleTime: 15_000,
    enabled: opts?.enabled ?? true,
    retry: 1,
  });
  return {
    data: q.data,
    isLoading: q.isLoading,
    isError: q.isError,
    error: q.error instanceof ApiError ? q.error : null,
    // Return react-query's stable refetch directly (not wrapped in a new
    // closure each render) so effects that depend on it don't re-fire — e.g.
    // the inbox's error toast would otherwise repeat on every poll tick.
    refetch: q.refetch,
  };
}

/**
 * Unread badge count. Polls every 30s while the tab is focused (never in the
 * background, per the v0.22 spec). Shares its query key with every consumer,
 * so the topbar bell and the inbox filter stay in sync from one request.
 */
export function useUnreadCount(opts?: { enabled?: boolean }): {
  data: UnreadCountResponse | undefined;
  isLoading: boolean;
} {
  const q = useQuery({
    queryKey: notificationKeys.unreadCount,
    queryFn: () =>
      api.get<UnreadCountResponse>("/me/notifications/unread-count"),
    staleTime: 30_000,
    refetchInterval: 30_000,
    refetchIntervalInBackground: false,
    enabled: opts?.enabled ?? true,
    retry: 1,
  });
  return { data: q.data, isLoading: q.isLoading };
}

export function useMarkNotificationRead(): ReturnType<
  typeof useMutation<void, ApiError, string>
> {
  const qc = useQueryClient();
  return useMutation<void, ApiError, string>({
    mutationFn: (id: string) => api.post<void>(`/me/notifications/${id}/read`),
    // notificationKeys.all is a prefix of both list and unread-count keys,
    // so a single invalidate refreshes the feed and the badge together.
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: notificationKeys.all });
    },
  });
}

export function useMarkAllRead(): ReturnType<
  typeof useMutation<void, ApiError, void>
> {
  const qc = useQueryClient();
  return useMutation<void, ApiError, void>({
    mutationFn: () => api.post<void>("/me/notifications/read-all"),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: notificationKeys.all });
    },
  });
}
