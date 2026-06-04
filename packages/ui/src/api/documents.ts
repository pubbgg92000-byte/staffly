"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "./client";
import { ApiError } from "./error";
import { dashboardKeys } from "./dashboard";
import type {
  CreateDocumentInput,
  DocumentAcknowledgementsResponse,
  DocumentAudiencePreviewResult,
  DocumentCategoryListParams,
  DocumentCategoryListResponse,
  DocumentDetail,
  DocumentListParams,
  DocumentListResponse,
  DownloadUrlResult,
  MyDocumentsParams,
  MyDocumentsResponse,
  PresignUploadResult,
  UpdateDocumentInput,
  DocumentAudienceType,
} from "@staffly/types";

export const documentKeys = {
  all: ["documents"] as const,
  categories: (params?: DocumentCategoryListParams) =>
    ["documents", "categories", params ?? {}] as const,
  list: (params?: DocumentListParams) =>
    ["documents", "list", params ?? {}] as const,
  detail: (id: string) => ["documents", "detail", id] as const,
  myDocs: (params?: MyDocumentsParams) =>
    ["documents", "me", params ?? {}] as const,
  downloadUrl: (id: string, versionNo?: number) =>
    ["documents", "download-url", id, versionNo ?? "current"] as const,
  acks: (id: string) => ["documents", "acks", id] as const,
  pending: (id: string) => ["documents", "pending", id] as const,
};

function categoriesQs(params?: DocumentCategoryListParams): string {
  if (!params) return "";
  const sp = new URLSearchParams();
  if (params.page) sp.set("page", String(params.page));
  if (params.pageSize) sp.set("pageSize", String(params.pageSize));
  if (params.search) sp.set("search", params.search);
  if (params.isActive !== undefined)
    sp.set("isActive", String(params.isActive));
  if (params.isPersonal !== undefined)
    sp.set("isPersonal", String(params.isPersonal));
  const qs = sp.toString();
  return qs ? `?${qs}` : "";
}

function listQs(params?: DocumentListParams): string {
  if (!params) return "";
  const sp = new URLSearchParams();
  if (params.page) sp.set("page", String(params.page));
  if (params.pageSize) sp.set("pageSize", String(params.pageSize));
  if (params.categoryId) sp.set("categoryId", params.categoryId);
  if (params.isRequired !== undefined)
    sp.set("isRequired", String(params.isRequired));
  if (params.isPersonal !== undefined)
    sp.set("isPersonal", String(params.isPersonal));
  if (params.subjectEmployeeId)
    sp.set("subjectEmployeeId", params.subjectEmployeeId);
  if (params.status) sp.set("status", params.status);
  if (params.expiringInDays)
    sp.set("expiringInDays", String(params.expiringInDays));
  if (params.search) sp.set("search", params.search);
  if (params.sortBy) sp.set("sortBy", params.sortBy);
  if (params.sortDir) sp.set("sortDir", params.sortDir);
  const qs = sp.toString();
  return qs ? `?${qs}` : "";
}

function myQs(params?: MyDocumentsParams): string {
  if (!params) return "";
  const sp = new URLSearchParams();
  if (params.page) sp.set("page", String(params.page));
  if (params.pageSize) sp.set("pageSize", String(params.pageSize));
  if (params.unacknowledgedOnly) sp.set("unacknowledgedOnly", "true");
  const qs = sp.toString();
  return qs ? `?${qs}` : "";
}

// ─── Queries ────────────────────────────────────────────────────────────

export function useDocumentCategories(params?: DocumentCategoryListParams): {
  data: DocumentCategoryListResponse | undefined;
  isLoading: boolean;
  isError: boolean;
  refetch: () => void;
} {
  const q = useQuery({
    queryKey: documentKeys.categories(params),
    queryFn: () =>
      api.get<DocumentCategoryListResponse>(
        `/documents/categories${categoriesQs(params)}`,
      ),
    staleTime: 60_000,
    retry: 1,
  });
  return {
    data: q.data,
    isLoading: q.isLoading,
    isError: q.isError,
    refetch: () => q.refetch(),
  };
}

export function useDocuments(params?: DocumentListParams): {
  data: DocumentListResponse | undefined;
  isLoading: boolean;
  isError: boolean;
  error: ApiError | null;
  refetch: () => void;
} {
  const q = useQuery({
    queryKey: documentKeys.list(params),
    queryFn: () => api.get<DocumentListResponse>(`/documents${listQs(params)}`),
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

export function useDocument(id: string | undefined): {
  data: DocumentDetail | undefined;
  isLoading: boolean;
  isError: boolean;
  error: ApiError | null;
  refetch: () => void;
} {
  const q = useQuery({
    queryKey: documentKeys.detail(id ?? ""),
    queryFn: () => api.get<DocumentDetail>(`/documents/${id}`),
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

export function useMyDocuments(params?: MyDocumentsParams): {
  data: MyDocumentsResponse | undefined;
  isLoading: boolean;
  isError: boolean;
  error: ApiError | null;
  refetch: () => void;
} {
  const q = useQuery({
    queryKey: documentKeys.myDocs(params),
    queryFn: () => api.get<MyDocumentsResponse>(`/me/documents${myQs(params)}`),
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

export function useDocumentAcknowledgements(id: string | undefined): {
  data: DocumentAcknowledgementsResponse | undefined;
  isLoading: boolean;
  refetch: () => void;
} {
  const q = useQuery({
    queryKey: documentKeys.acks(id ?? ""),
    queryFn: () =>
      api.get<DocumentAcknowledgementsResponse>(
        `/documents/${id}/acknowledgements?pageSize=100`,
      ),
    staleTime: 30_000,
    enabled: !!id,
    retry: 1,
  });
  return {
    data: q.data,
    isLoading: q.isLoading,
    refetch: () => q.refetch(),
  };
}

export function usePendingAck(id: string | undefined): {
  data: { pendingEmployeeIds: string[] } | undefined;
  isLoading: boolean;
} {
  const q = useQuery({
    queryKey: documentKeys.pending(id ?? ""),
    queryFn: () =>
      api.get<{ pendingEmployeeIds: string[] }>(`/documents/${id}/pending`),
    staleTime: 30_000,
    enabled: !!id,
    retry: 1,
  });
  return { data: q.data, isLoading: q.isLoading };
}

// ─── Mutations ──────────────────────────────────────────────────────────

export function usePresignUpload(): ReturnType<
  typeof useMutation<
    PresignUploadResult,
    ApiError,
    { fileName: string; mimeType: string; sizeBytes: number }
  >
> {
  return useMutation<
    PresignUploadResult,
    ApiError,
    { fileName: string; mimeType: string; sizeBytes: number }
  >({
    mutationFn: (body) =>
      api.post<PresignUploadResult>("/documents/files/presign-upload", body),
  });
}

export async function uploadToPresignedUrl(
  url: string,
  file: File,
): Promise<void> {
  const res = await fetch(url, {
    method: "PUT",
    body: file,
    headers: { "Content-Type": file.type },
  });
  if (!res.ok) throw new Error(`Upload failed: HTTP ${res.status}`);
}

export function useCreateDocument(): ReturnType<
  typeof useMutation<DocumentDetail, ApiError, CreateDocumentInput>
> {
  const qc = useQueryClient();
  return useMutation<DocumentDetail, ApiError, CreateDocumentInput>({
    mutationFn: (body) => api.post<DocumentDetail>("/documents", body),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: documentKeys.all });
      void qc.invalidateQueries({ queryKey: dashboardKeys.admin });
    },
  });
}

export function useUpdateDocument(): ReturnType<
  typeof useMutation<
    DocumentDetail,
    ApiError,
    { id: string; body: UpdateDocumentInput }
  >
> {
  const qc = useQueryClient();
  return useMutation<
    DocumentDetail,
    ApiError,
    { id: string; body: UpdateDocumentInput }
  >({
    mutationFn: ({ id, body }) =>
      api.patch<DocumentDetail>(`/documents/${id}`, body),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: documentKeys.all });
      void qc.invalidateQueries({ queryKey: dashboardKeys.admin });
    },
  });
}

export function useReplaceFile(): ReturnType<
  typeof useMutation<
    DocumentDetail,
    ApiError,
    {
      id: string;
      file: {
        storageKey: string;
        fileName: string;
        mimeType: string;
        sizeBytes: number;
      };
    }
  >
> {
  const qc = useQueryClient();
  return useMutation<
    DocumentDetail,
    ApiError,
    {
      id: string;
      file: {
        storageKey: string;
        fileName: string;
        mimeType: string;
        sizeBytes: number;
      };
    }
  >({
    mutationFn: ({ id, file }) =>
      api.post<DocumentDetail>(`/documents/${id}/replace`, { file }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: documentKeys.all });
      void qc.invalidateQueries({ queryKey: dashboardKeys.admin });
    },
  });
}

export function usePublishDocument(): ReturnType<
  typeof useMutation<DocumentDetail, ApiError, string>
> {
  const qc = useQueryClient();
  return useMutation<DocumentDetail, ApiError, string>({
    mutationFn: (id) =>
      api.post<DocumentDetail>(`/documents/${id}/publish`, {}),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: documentKeys.all });
      void qc.invalidateQueries({ queryKey: dashboardKeys.admin });
      void qc.invalidateQueries({ queryKey: dashboardKeys.employee });
    },
  });
}

export function useArchiveDocument(): ReturnType<
  typeof useMutation<DocumentDetail, ApiError, string>
> {
  const qc = useQueryClient();
  return useMutation<DocumentDetail, ApiError, string>({
    mutationFn: (id) =>
      api.post<DocumentDetail>(`/documents/${id}/archive`, {}),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: documentKeys.all });
      void qc.invalidateQueries({ queryKey: dashboardKeys.admin });
      void qc.invalidateQueries({ queryKey: dashboardKeys.employee });
    },
  });
}

export function useDeleteDocument(): ReturnType<
  typeof useMutation<void, ApiError, string>
> {
  const qc = useQueryClient();
  return useMutation<void, ApiError, string>({
    mutationFn: (id) => api.delete(`/documents/${id}`),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: documentKeys.all });
      void qc.invalidateQueries({ queryKey: dashboardKeys.admin });
    },
  });
}

export function useAcknowledgeDocument(): ReturnType<
  typeof useMutation<unknown, ApiError, string>
> {
  const qc = useQueryClient();
  return useMutation<unknown, ApiError, string>({
    mutationFn: (id) => api.post(`/documents/${id}/acknowledge`, undefined),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: documentKeys.all });
      void qc.invalidateQueries({ queryKey: dashboardKeys.employee });
    },
  });
}

export function useDocumentAudiencePreview(): ReturnType<
  typeof useMutation<
    DocumentAudiencePreviewResult,
    ApiError,
    {
      audiences: {
        type: DocumentAudienceType;
        departmentId?: string;
        designationId?: string;
        locationId?: string;
        employmentType?: string;
        employeeId?: string;
      }[];
    }
  >
> {
  return useMutation<
    DocumentAudiencePreviewResult,
    ApiError,
    {
      audiences: {
        type: DocumentAudienceType;
        departmentId?: string;
        designationId?: string;
        locationId?: string;
        employmentType?: string;
        employeeId?: string;
      }[];
    }
  >({
    mutationFn: (body) =>
      api.post<DocumentAudiencePreviewResult>(
        "/documents/audience/preview",
        body,
      ),
  });
}

export function useGetDownloadUrl(): ReturnType<
  typeof useMutation<
    DownloadUrlResult,
    ApiError,
    { id: string; versionNo?: number }
  >
> {
  return useMutation<
    DownloadUrlResult,
    ApiError,
    { id: string; versionNo?: number }
  >({
    mutationFn: ({ id, versionNo }) => {
      const path =
        versionNo !== undefined
          ? `/documents/${id}/versions/${versionNo}/download-url`
          : `/documents/${id}/download-url`;
      return api.get<DownloadUrlResult>(path);
    },
  });
}
