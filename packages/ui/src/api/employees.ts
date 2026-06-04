"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "./client";
import { ApiError } from "./error";
import type {
  EmployeeListResponse,
  EmployeeDetail,
  EmployeeListParams,
  CreateEmployeeInput,
  UpdateEmployeeInput,
  OrgListResponse,
} from "@staffly/types";

export const employeeKeys = {
  list: (params?: EmployeeListParams) =>
    ["employees", "list", params ?? {}] as const,
  detail: (id: string) => ["employees", "detail", id] as const,
  departments: ["org", "departments"] as const,
  designations: ["org", "designations"] as const,
  locations: ["org", "locations"] as const,
};

function qp(params?: EmployeeListParams): string {
  if (!params) return "";
  const sp = new URLSearchParams();
  if (params.page) sp.set("page", String(params.page));
  if (params.pageSize) sp.set("pageSize", String(params.pageSize));
  if (params.search) sp.set("search", params.search);
  if (params.status) sp.set("status", params.status);
  if (params.departmentId) sp.set("departmentId", params.departmentId);
  if (params.designationId) sp.set("designationId", params.designationId);
  if (params.locationId) sp.set("locationId", params.locationId);
  if (params.managerId) sp.set("managerId", params.managerId);
  if (params.employmentType) sp.set("employmentType", params.employmentType);
  if (params.sortBy) sp.set("sortBy", params.sortBy);
  if (params.sortDir) sp.set("sortDir", params.sortDir);
  const qs = sp.toString();
  return qs ? `?${qs}` : "";
}

export function useEmployees(params?: EmployeeListParams): {
  data: EmployeeListResponse | undefined;
  isLoading: boolean;
  isError: boolean;
  error: ApiError | null;
  refetch: () => void;
} {
  const q = useQuery({
    queryKey: employeeKeys.list(params),
    queryFn: () => api.get<EmployeeListResponse>(`/employees${qp(params)}`),
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

export function useEmployee(id: string | undefined): {
  data: EmployeeDetail | undefined;
  isLoading: boolean;
  isError: boolean;
  error: ApiError | null;
  refetch: () => void;
} {
  const q = useQuery({
    queryKey: employeeKeys.detail(id ?? ""),
    queryFn: () => api.get<EmployeeDetail>(`/employees/${id}`),
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

export function useCreateEmployee(): ReturnType<
  typeof useMutation<EmployeeDetail, ApiError, CreateEmployeeInput>
> {
  const qc = useQueryClient();
  return useMutation<EmployeeDetail, ApiError, CreateEmployeeInput>({
    mutationFn: (body) => api.post<EmployeeDetail>("/employees", body),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["employees"] });
    },
  });
}

export function useUpdateEmployee(
  id: string,
): ReturnType<
  typeof useMutation<EmployeeDetail, ApiError, UpdateEmployeeInput>
> {
  const qc = useQueryClient();
  return useMutation<EmployeeDetail, ApiError, UpdateEmployeeInput>({
    mutationFn: (body) => api.patch<EmployeeDetail>(`/employees/${id}`, body),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["employees"] });
    },
  });
}

export function useDeleteEmployee(): ReturnType<
  typeof useMutation<void, ApiError, string>
> {
  const qc = useQueryClient();
  return useMutation<void, ApiError, string>({
    mutationFn: (id) => api.delete(`/employees/${id}`),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["employees"] });
    },
  });
}

export function useDepartments(): {
  data: OrgListResponse | undefined;
  isLoading: boolean;
} {
  const q = useQuery({
    queryKey: employeeKeys.departments,
    queryFn: () => api.get<OrgListResponse>("/departments?pageSize=100"),
    staleTime: 300_000,
  });
  return { data: q.data, isLoading: q.isLoading };
}

export function useDesignations(): {
  data: OrgListResponse | undefined;
  isLoading: boolean;
} {
  const q = useQuery({
    queryKey: employeeKeys.designations,
    queryFn: () => api.get<OrgListResponse>("/designations?pageSize=100"),
    staleTime: 300_000,
  });
  return { data: q.data, isLoading: q.isLoading };
}

export function useLocations(): {
  data: OrgListResponse | undefined;
  isLoading: boolean;
} {
  const q = useQuery({
    queryKey: employeeKeys.locations,
    queryFn: () => api.get<OrgListResponse>("/locations?pageSize=100"),
    staleTime: 300_000,
  });
  return { data: q.data, isLoading: q.isLoading };
}
