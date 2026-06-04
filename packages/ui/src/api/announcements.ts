"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "./client";
import { ApiError } from "./error";
import { dashboardKeys } from "./dashboard";
import type {
  AcknowledgementsListParams,
  AcknowledgementsListResponse,
  Announcement,
  AnnouncementsListParams,
  AnnouncementsListResponse,
  AudienceItem,
  AudiencePreviewResult,
  CreateAnnouncementInput,
  MyAnnouncementsParams,
  MyAnnouncementsResponse,
  UpdateAnnouncementInput,
} from "@staffly/types";

export const announcementKeys = {
  all: ["announcements"] as const,
  list: (params?: AnnouncementsListParams) =>
    ["announcements", "list", params ?? {}] as const,
  detail: (id: string) => ["announcements", "detail", id] as const,
  myFeed: (params?: MyAnnouncementsParams) =>
    ["announcements", "me", params ?? {}] as const,
  acks: (id: string, params?: AcknowledgementsListParams) =>
    ["announcements", "acks", id, params ?? {}] as const,
};

function listQs(params?: AnnouncementsListParams): string {
  if (!params) return "";
  const sp = new URLSearchParams();
  if (params.page) sp.set("page", String(params.page));
  if (params.pageSize) sp.set("pageSize", String(params.pageSize));
  if (params.status) sp.set("status", params.status);
  if (params.search) sp.set("search", params.search);
  if (params.pinnedFirst) sp.set("pinnedFirst", "true");
  if (params.sortBy) sp.set("sortBy", params.sortBy);
  if (params.sortDir) sp.set("sortDir", params.sortDir);
  const qs = sp.toString();
  return qs ? `?${qs}` : "";
}

function myFeedQs(params?: MyAnnouncementsParams): string {
  if (!params) return "";
  const sp = new URLSearchParams();
  if (params.page) sp.set("page", String(params.page));
  if (params.pageSize) sp.set("pageSize", String(params.pageSize));
  if (params.unacknowledgedOnly) sp.set("unacknowledgedOnly", "true");
  const qs = sp.toString();
  return qs ? `?${qs}` : "";
}

function acksQs(params?: AcknowledgementsListParams): string {
  if (!params) return "";
  const sp = new URLSearchParams();
  if (params.page) sp.set("page", String(params.page));
  if (params.pageSize) sp.set("pageSize", String(params.pageSize));
  const qs = sp.toString();
  return qs ? `?${qs}` : "";
}

// ─── Queries ────────────────────────────────────────────────────────────

export function useAnnouncements(params?: AnnouncementsListParams): {
  data: AnnouncementsListResponse | undefined;
  isLoading: boolean;
  isError: boolean;
  error: ApiError | null;
  refetch: () => void;
} {
  const q = useQuery({
    queryKey: announcementKeys.list(params),
    queryFn: () =>
      api.get<AnnouncementsListResponse>(`/announcements${listQs(params)}`),
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

export function useAnnouncement(id: string | undefined): {
  data: Announcement | undefined;
  isLoading: boolean;
  isError: boolean;
  error: ApiError | null;
  refetch: () => void;
} {
  const q = useQuery({
    queryKey: announcementKeys.detail(id ?? ""),
    queryFn: () => api.get<Announcement>(`/announcements/${id}`),
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

export function useMyAnnouncements(params?: MyAnnouncementsParams): {
  data: MyAnnouncementsResponse | undefined;
  isLoading: boolean;
  isError: boolean;
  error: ApiError | null;
  refetch: () => void;
} {
  const q = useQuery({
    queryKey: announcementKeys.myFeed(params),
    queryFn: () =>
      api.get<MyAnnouncementsResponse>(`/me/announcements${myFeedQs(params)}`),
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

export function useAcknowledgements(
  id: string | undefined,
  params?: AcknowledgementsListParams,
): {
  data: AcknowledgementsListResponse | undefined;
  isLoading: boolean;
  isError: boolean;
  refetch: () => void;
} {
  const q = useQuery({
    queryKey: announcementKeys.acks(id ?? "", params),
    queryFn: () =>
      api.get<AcknowledgementsListResponse>(
        `/announcements/${id}/acknowledgements${acksQs(params)}`,
      ),
    staleTime: 30_000,
    enabled: !!id,
    retry: 1,
  });
  return {
    data: q.data,
    isLoading: q.isLoading,
    isError: q.isError,
    refetch: () => q.refetch(),
  };
}

// ─── Mutations ──────────────────────────────────────────────────────────

export function useCreateAnnouncement(): ReturnType<
  typeof useMutation<Announcement, ApiError, CreateAnnouncementInput>
> {
  const qc = useQueryClient();
  return useMutation<Announcement, ApiError, CreateAnnouncementInput>({
    mutationFn: (body) => api.post<Announcement>("/announcements", body),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: announcementKeys.all });
      void qc.invalidateQueries({ queryKey: dashboardKeys.admin });
    },
  });
}

export function useUpdateAnnouncement(): ReturnType<
  typeof useMutation<
    Announcement,
    ApiError,
    { id: string; body: UpdateAnnouncementInput }
  >
> {
  const qc = useQueryClient();
  return useMutation<
    Announcement,
    ApiError,
    { id: string; body: UpdateAnnouncementInput }
  >({
    mutationFn: ({ id, body }) =>
      api.patch<Announcement>(`/announcements/${id}`, body),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: announcementKeys.all });
      void qc.invalidateQueries({ queryKey: dashboardKeys.admin });
    },
  });
}

export function usePublishAnnouncement(): ReturnType<
  typeof useMutation<
    Announcement,
    ApiError,
    { id: string; scheduledFor?: string }
  >
> {
  const qc = useQueryClient();
  return useMutation<
    Announcement,
    ApiError,
    { id: string; scheduledFor?: string }
  >({
    mutationFn: ({ id, scheduledFor }) =>
      api.post<Announcement>(
        `/announcements/${id}/publish`,
        scheduledFor ? { scheduledFor } : {},
      ),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: announcementKeys.all });
      void qc.invalidateQueries({ queryKey: dashboardKeys.admin });
      void qc.invalidateQueries({ queryKey: dashboardKeys.employee });
    },
  });
}

export function useArchiveAnnouncement(): ReturnType<
  typeof useMutation<Announcement, ApiError, string>
> {
  const qc = useQueryClient();
  return useMutation<Announcement, ApiError, string>({
    mutationFn: (id) =>
      api.post<Announcement>(`/announcements/${id}/archive`, {}),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: announcementKeys.all });
      void qc.invalidateQueries({ queryKey: dashboardKeys.admin });
      void qc.invalidateQueries({ queryKey: dashboardKeys.employee });
    },
  });
}

export function useAcknowledgeAnnouncement(): ReturnType<
  typeof useMutation<unknown, ApiError, string>
> {
  const qc = useQueryClient();
  return useMutation<unknown, ApiError, string>({
    mutationFn: (id) => api.post(`/announcements/${id}/acknowledge`, undefined),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: announcementKeys.all });
      void qc.invalidateQueries({ queryKey: dashboardKeys.employee });
    },
  });
}

export function usePreviewAudience(): ReturnType<
  typeof useMutation<
    AudiencePreviewResult,
    ApiError,
    { audiences: AudienceItem[] }
  >
> {
  return useMutation<
    AudiencePreviewResult,
    ApiError,
    { audiences: AudienceItem[] }
  >({
    mutationFn: (body) =>
      api.post<AudiencePreviewResult>("/announcements/audience/preview", body),
  });
}
