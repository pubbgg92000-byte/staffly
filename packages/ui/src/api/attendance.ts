"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "./client";
import { ApiError } from "./error";
import { dashboardKeys } from "./dashboard";
import type {
  AttendanceListParams,
  AttendanceListResponse,
  AttendanceMeResponse,
  AttendanceRecord,
  AttendanceRegularization,
  CreateRegularizationInput,
  DecideRegularizationInput,
  RegularizationsListParams,
  RegularizationsListResponse,
} from "@staffly/types";

export const attendanceKeys = {
  all: ["attendance"] as const,
  me: ["attendance", "me"] as const,
  list: (params?: AttendanceListParams) =>
    ["attendance", "list", params ?? {}] as const,
  detail: (id: string) => ["attendance", "detail", id] as const,
  regularizations: (params?: RegularizationsListParams) =>
    ["attendance", "regularizations", params ?? {}] as const,
};

function listQs(params?: AttendanceListParams): string {
  if (!params) return "";
  const sp = new URLSearchParams();
  if (params.page) sp.set("page", String(params.page));
  if (params.pageSize) sp.set("pageSize", String(params.pageSize));
  if (params.employeeId) sp.set("employeeId", params.employeeId);
  if (params.from) sp.set("from", params.from);
  if (params.to) sp.set("to", params.to);
  if (params.status) sp.set("status", params.status);
  if (params.sortBy) sp.set("sortBy", params.sortBy);
  if (params.sortDir) sp.set("sortDir", params.sortDir);
  const qs = sp.toString();
  return qs ? `?${qs}` : "";
}

function regQs(params?: RegularizationsListParams): string {
  if (!params) return "";
  const sp = new URLSearchParams();
  if (params.page) sp.set("page", String(params.page));
  if (params.pageSize) sp.set("pageSize", String(params.pageSize));
  if (params.status) sp.set("status", params.status);
  if (params.employeeId) sp.set("employeeId", params.employeeId);
  const qs = sp.toString();
  return qs ? `?${qs}` : "";
}

export function useMyAttendance(): {
  data: AttendanceMeResponse | undefined;
  isLoading: boolean;
  isError: boolean;
  error: ApiError | null;
  refetch: () => void;
} {
  const q = useQuery({
    queryKey: attendanceKeys.me,
    queryFn: () => api.get<AttendanceMeResponse>("/attendance/me"),
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

export function useAttendanceList(params?: AttendanceListParams): {
  data: AttendanceListResponse | undefined;
  isLoading: boolean;
  isError: boolean;
  error: ApiError | null;
  refetch: () => void;
} {
  const q = useQuery({
    queryKey: attendanceKeys.list(params),
    queryFn: () =>
      api.get<AttendanceListResponse>(`/attendance${listQs(params)}`),
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

export function useAttendanceRecord(id: string | undefined): {
  data: AttendanceRecord | undefined;
  isLoading: boolean;
  isError: boolean;
  error: ApiError | null;
  refetch: () => void;
} {
  const q = useQuery({
    queryKey: attendanceKeys.detail(id ?? ""),
    queryFn: () => api.get<AttendanceRecord>(`/attendance/${id}`),
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

export function useRegularizations(params?: RegularizationsListParams): {
  data: RegularizationsListResponse | undefined;
  isLoading: boolean;
  isError: boolean;
  error: ApiError | null;
  refetch: () => void;
} {
  const q = useQuery({
    queryKey: attendanceKeys.regularizations(params),
    queryFn: () =>
      api.get<RegularizationsListResponse>(
        `/attendance/regularizations${regQs(params)}`,
      ),
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

export function useCreateRegularization(): ReturnType<
  typeof useMutation<
    AttendanceRegularization,
    ApiError,
    CreateRegularizationInput
  >
> {
  const qc = useQueryClient();
  return useMutation<
    AttendanceRegularization,
    ApiError,
    CreateRegularizationInput
  >({
    mutationFn: (body) =>
      api.post<AttendanceRegularization>("/attendance/regularizations", body),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: attendanceKeys.all });
      void qc.invalidateQueries({ queryKey: dashboardKeys.employee });
    },
  });
}

export function useDecideRegularization(): ReturnType<
  typeof useMutation<
    AttendanceRegularization,
    ApiError,
    { id: string; body: DecideRegularizationInput }
  >
> {
  const qc = useQueryClient();
  return useMutation<
    AttendanceRegularization,
    ApiError,
    { id: string; body: DecideRegularizationInput }
  >({
    mutationFn: ({ id, body }) =>
      api.post<AttendanceRegularization>(
        `/attendance/regularizations/${id}/decide`,
        body,
      ),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: attendanceKeys.all });
      void qc.invalidateQueries({ queryKey: dashboardKeys.admin });
    },
  });
}
