"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "./client";
import { ApiError } from "./error";
import type {
  AdminDashboardResponse,
  EmployeeDashboardResponse,
} from "@staffly/types";

export const dashboardKeys = {
  admin: ["dashboard", "admin"] as const,
  employee: ["dashboard", "employee"] as const,
};

export function useAdminDashboard(): {
  data: AdminDashboardResponse | undefined;
  isLoading: boolean;
  isError: boolean;
  error: ApiError | null;
  refetch: () => void;
} {
  const q = useQuery({
    queryKey: dashboardKeys.admin,
    queryFn: () => api.get<AdminDashboardResponse>("/dashboard/admin"),
    staleTime: 30_000,
    refetchInterval: 60_000,
    refetchIntervalInBackground: false,
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

export function useEmployeeDashboard(): {
  data: EmployeeDashboardResponse | undefined;
  isLoading: boolean;
  isError: boolean;
  error: ApiError | null;
  refetch: () => void;
} {
  const q = useQuery({
    queryKey: dashboardKeys.employee,
    queryFn: () => api.get<EmployeeDashboardResponse>("/dashboard/employee"),
    staleTime: 30_000,
    refetchInterval: 60_000,
    refetchIntervalInBackground: false,
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

export function useCheckIn(): ReturnType<
  typeof useMutation<unknown, ApiError, void>
> {
  const qc = useQueryClient();
  return useMutation<unknown, ApiError, void>({
    mutationFn: () => api.post("/attendance/check-in", {}),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: dashboardKeys.employee });
      void qc.invalidateQueries({ queryKey: dashboardKeys.admin });
      void qc.invalidateQueries({ queryKey: ["attendance"] });
    },
  });
}

export function useCheckOut(): ReturnType<
  typeof useMutation<unknown, ApiError, void>
> {
  const qc = useQueryClient();
  return useMutation<unknown, ApiError, void>({
    mutationFn: () => api.post("/attendance/check-out", {}),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: dashboardKeys.employee });
      void qc.invalidateQueries({ queryKey: dashboardKeys.admin });
      void qc.invalidateQueries({ queryKey: ["attendance"] });
    },
  });
}
