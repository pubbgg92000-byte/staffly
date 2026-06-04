"use client";

// TODO(v0.20): Replace hierarchical department implementation with dedicated Team entity.

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "./client";
import { ApiError } from "./error";
import type {
  CreateDepartmentInput,
  CreateDesignationInput,
  CreateLocationInput,
  EmployeeListResponse,
  MyEmployeeResponse,
  OrgDepartment,
  OrgDesignation,
  OrgLocation,
  UpdateDepartmentInput,
  UpdateDesignationInput,
  UpdateLocationInput,
} from "@staffly/types";
import type { PageMeta } from "@staffly/types";

export const orgKeys = {
  all: ["org-structure"] as const,
  departments: (params?: Record<string, unknown>) =>
    ["org", "departments", params ?? {}] as const,
  designations: (params?: Record<string, unknown>) =>
    ["org", "designations", params ?? {}] as const,
  locations: (params?: Record<string, unknown>) =>
    ["org", "locations", params ?? {}] as const,
  employeesByManager: (managerId: string | null) =>
    ["org", "employees-by-manager", managerId ?? "root"] as const,
  me: ["org", "me"] as const,
};

interface PageResponse<T> {
  items: T[];
  meta: PageMeta;
}

function qs(params?: Record<string, unknown>): string {
  if (!params) return "";
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== "") {
      sp.set(k, String(v));
    }
  }
  const q = sp.toString();
  return q ? `?${q}` : "";
}

// ─── Queries ──────────────────────────────────────────────────────────

export function useOrgDepartments(params?: Record<string, unknown>): {
  data: PageResponse<OrgDepartment> | undefined;
  isLoading: boolean;
} {
  const q = useQuery({
    queryKey: orgKeys.departments(params),
    queryFn: () =>
      api.get<PageResponse<OrgDepartment>>(`/departments${qs(params)}`),
    staleTime: 30_000,
    retry: 1,
  });
  return { data: q.data, isLoading: q.isLoading };
}

export function useOrgDesignations(params?: Record<string, unknown>): {
  data: PageResponse<OrgDesignation> | undefined;
  isLoading: boolean;
} {
  const q = useQuery({
    queryKey: orgKeys.designations(params),
    queryFn: () =>
      api.get<PageResponse<OrgDesignation>>(`/designations${qs(params)}`),
    staleTime: 30_000,
    retry: 1,
  });
  return { data: q.data, isLoading: q.isLoading };
}

export function useOrgLocations(params?: Record<string, unknown>): {
  data: PageResponse<OrgLocation> | undefined;
  isLoading: boolean;
} {
  const q = useQuery({
    queryKey: orgKeys.locations(params),
    queryFn: () =>
      api.get<PageResponse<OrgLocation>>(`/locations${qs(params)}`),
    staleTime: 30_000,
    retry: 1,
  });
  return { data: q.data, isLoading: q.isLoading };
}

// ─── Departments ──────────────────────────────────────────────────────

export function useCreateDepartment(): ReturnType<
  typeof useMutation<OrgDepartment, ApiError, CreateDepartmentInput>
> {
  const qc = useQueryClient();
  return useMutation<OrgDepartment, ApiError, CreateDepartmentInput>({
    mutationFn: (body) => api.post<OrgDepartment>("/departments", body),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: orgKeys.all });
    },
  });
}

export function useUpdateDepartment(): ReturnType<
  typeof useMutation<
    OrgDepartment,
    ApiError,
    { id: string; body: UpdateDepartmentInput }
  >
> {
  const qc = useQueryClient();
  return useMutation<
    OrgDepartment,
    ApiError,
    { id: string; body: UpdateDepartmentInput }
  >({
    mutationFn: ({ id, body }) =>
      api.patch<OrgDepartment>(`/departments/${id}`, body),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: orgKeys.all });
    },
  });
}

export function useDeleteDepartment(): ReturnType<
  typeof useMutation<void, ApiError, string>
> {
  const qc = useQueryClient();
  return useMutation<void, ApiError, string>({
    mutationFn: (id) => api.delete(`/departments/${id}`),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: orgKeys.all });
    },
  });
}

// ─── Designations ─────────────────────────────────────────────────────

export function useCreateDesignation(): ReturnType<
  typeof useMutation<OrgDesignation, ApiError, CreateDesignationInput>
> {
  const qc = useQueryClient();
  return useMutation<OrgDesignation, ApiError, CreateDesignationInput>({
    mutationFn: (body) => api.post<OrgDesignation>("/designations", body),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: orgKeys.all });
    },
  });
}

export function useUpdateDesignation(): ReturnType<
  typeof useMutation<
    OrgDesignation,
    ApiError,
    { id: string; body: UpdateDesignationInput }
  >
> {
  const qc = useQueryClient();
  return useMutation<
    OrgDesignation,
    ApiError,
    { id: string; body: UpdateDesignationInput }
  >({
    mutationFn: ({ id, body }) =>
      api.patch<OrgDesignation>(`/designations/${id}`, body),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: orgKeys.all });
    },
  });
}

export function useDeleteDesignation(): ReturnType<
  typeof useMutation<void, ApiError, string>
> {
  const qc = useQueryClient();
  return useMutation<void, ApiError, string>({
    mutationFn: (id) => api.delete(`/designations/${id}`),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: orgKeys.all });
    },
  });
}

// ─── Locations ─────────────────────────────────────────────────────────

export function useCreateLocation(): ReturnType<
  typeof useMutation<OrgLocation, ApiError, CreateLocationInput>
> {
  const qc = useQueryClient();
  return useMutation<OrgLocation, ApiError, CreateLocationInput>({
    mutationFn: (body) => api.post<OrgLocation>("/locations", body),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: orgKeys.all });
    },
  });
}

export function useUpdateLocation(): ReturnType<
  typeof useMutation<
    OrgLocation,
    ApiError,
    { id: string; body: UpdateLocationInput }
  >
> {
  const qc = useQueryClient();
  return useMutation<
    OrgLocation,
    ApiError,
    { id: string; body: UpdateLocationInput }
  >({
    mutationFn: ({ id, body }) =>
      api.patch<OrgLocation>(`/locations/${id}`, body),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: orgKeys.all });
    },
  });
}

export function useDeleteLocation(): ReturnType<
  typeof useMutation<void, ApiError, string>
> {
  const qc = useQueryClient();
  return useMutation<void, ApiError, string>({
    mutationFn: (id) => api.delete(`/locations/${id}`),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: orgKeys.all });
    },
  });
}

// ─── Hierarchy / Me ───────────────────────────────────────────────────

/**
 * Fetches all direct reports of an employee. Used by the org-chart tree to
 * lazy-load children as nodes are expanded. Disabled when managerId is null
 * (the tree's roots are fetched explicitly via useEmployees + client filter).
 */
export function useOrgEmployeesByManager(managerId: string | null): {
  data: EmployeeListResponse | undefined;
  isLoading: boolean;
  isError: boolean;
} {
  const q = useQuery({
    queryKey: orgKeys.employeesByManager(managerId),
    queryFn: () =>
      api.get<EmployeeListResponse>(
        `/employees?managerId=${encodeURIComponent(managerId ?? "")}&pageSize=100&sortBy=displayName`,
      ),
    enabled: !!managerId,
    staleTime: 30_000,
    retry: 1,
  });
  return { data: q.data, isLoading: q.isLoading, isError: q.isError };
}

/**
 * GET /employees/me — the current user's Employee record with dept/team/manager
 * joined. Returns 404 when the user has no employee row (e.g. super_admin who
 * never onboarded as an employee). Callers should branch on isError + the
 * ApiError.status === 404 case.
 */
export function useMyEmployee(): {
  data: MyEmployeeResponse | undefined;
  isLoading: boolean;
  isError: boolean;
  error: ApiError | null;
} {
  const q = useQuery({
    queryKey: orgKeys.me,
    queryFn: () => api.get<MyEmployeeResponse>("/employees/me"),
    staleTime: 60_000,
    retry: false,
  });
  return {
    data: q.data,
    isLoading: q.isLoading,
    isError: q.isError,
    error: q.error instanceof ApiError ? q.error : null,
  };
}
