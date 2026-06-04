"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "./client";
import { ApiError } from "./error";
import { dashboardKeys } from "./dashboard";
import type {
  ApplyLeaveInput,
  DecideLeaveInput,
  LeaveBalancesListParams,
  LeaveBalancesListResponse,
  LeaveRequest,
  LeaveRequestsListParams,
  LeaveRequestsListResponse,
  LeaveTypeListResponse,
  MyLeaveBalancesResponse,
} from "@staffly/types";

export const leaveKeys = {
  all: ["leave"] as const,
  myBalances: ["leave", "balances", "me"] as const,
  balancesList: (params?: LeaveBalancesListParams) =>
    ["leave", "balances", "list", params ?? {}] as const,
  myRequests: (params?: LeaveRequestsListParams) =>
    ["leave", "requests", "me", params ?? {}] as const,
  requestsList: (params?: LeaveRequestsListParams) =>
    ["leave", "requests", "list", params ?? {}] as const,
  types: ["leave", "types"] as const,
};

function requestsQs(params?: LeaveRequestsListParams): string {
  if (!params) return "";
  const sp = new URLSearchParams();
  if (params.page) sp.set("page", String(params.page));
  if (params.pageSize) sp.set("pageSize", String(params.pageSize));
  if (params.employeeId) sp.set("employeeId", params.employeeId);
  if (params.leaveTypeId) sp.set("leaveTypeId", params.leaveTypeId);
  if (params.status) sp.set("status", params.status);
  if (params.from) sp.set("from", params.from);
  if (params.to) sp.set("to", params.to);
  if (params.sortBy) sp.set("sortBy", params.sortBy);
  if (params.sortDir) sp.set("sortDir", params.sortDir);
  const qs = sp.toString();
  return qs ? `?${qs}` : "";
}

function balancesQs(params?: LeaveBalancesListParams): string {
  if (!params) return "";
  const sp = new URLSearchParams();
  if (params.page) sp.set("page", String(params.page));
  if (params.pageSize) sp.set("pageSize", String(params.pageSize));
  if (params.employeeId) sp.set("employeeId", params.employeeId);
  if (params.leaveTypeId) sp.set("leaveTypeId", params.leaveTypeId);
  if (params.cycleYear) sp.set("cycleYear", String(params.cycleYear));
  const qs = sp.toString();
  return qs ? `?${qs}` : "";
}

export function useMyLeaveBalances(): {
  data: MyLeaveBalancesResponse | undefined;
  isLoading: boolean;
  isError: boolean;
  error: ApiError | null;
  refetch: () => void;
} {
  const q = useQuery({
    queryKey: leaveKeys.myBalances,
    queryFn: () => api.get<MyLeaveBalancesResponse>("/leave/balances/me"),
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

export function useMyLeaveRequests(params?: LeaveRequestsListParams): {
  data: LeaveRequestsListResponse | undefined;
  isLoading: boolean;
  isError: boolean;
  error: ApiError | null;
  refetch: () => void;
} {
  const q = useQuery({
    queryKey: leaveKeys.myRequests(params),
    queryFn: () =>
      api.get<LeaveRequestsListResponse>(
        `/leave/requests/me${requestsQs(params)}`,
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

export function useLeaveRequests(params?: LeaveRequestsListParams): {
  data: LeaveRequestsListResponse | undefined;
  isLoading: boolean;
  isError: boolean;
  error: ApiError | null;
  refetch: () => void;
} {
  const q = useQuery({
    queryKey: leaveKeys.requestsList(params),
    queryFn: () =>
      api.get<LeaveRequestsListResponse>(
        `/leave/requests${requestsQs(params)}`,
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

export function useLeaveBalancesList(params?: LeaveBalancesListParams): {
  data: LeaveBalancesListResponse | undefined;
  isLoading: boolean;
  isError: boolean;
  error: ApiError | null;
  refetch: () => void;
} {
  const q = useQuery({
    queryKey: leaveKeys.balancesList(params),
    queryFn: () =>
      api.get<LeaveBalancesListResponse>(
        `/leave/balances${balancesQs(params)}`,
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

/** Admin-only — requires leave.policy.read. */
export function useLeaveTypes(): {
  data: LeaveTypeListResponse | undefined;
  isLoading: boolean;
} {
  const q = useQuery({
    queryKey: leaveKeys.types,
    queryFn: () => api.get<LeaveTypeListResponse>("/leave/types?pageSize=100"),
    staleTime: 300_000,
    retry: 1,
  });
  return { data: q.data, isLoading: q.isLoading };
}

export function useApplyLeave(): ReturnType<
  typeof useMutation<LeaveRequest, ApiError, ApplyLeaveInput>
> {
  const qc = useQueryClient();
  return useMutation<LeaveRequest, ApiError, ApplyLeaveInput>({
    mutationFn: (body) => api.post<LeaveRequest>("/leave/requests", body),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: leaveKeys.all });
      void qc.invalidateQueries({ queryKey: dashboardKeys.employee });
    },
  });
}

export function useCancelLeaveRequest(): ReturnType<
  typeof useMutation<LeaveRequest, ApiError, string>
> {
  const qc = useQueryClient();
  return useMutation<LeaveRequest, ApiError, string>({
    mutationFn: (id) => api.patch<LeaveRequest>(`/leave/requests/${id}/cancel`),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: leaveKeys.all });
      void qc.invalidateQueries({ queryKey: dashboardKeys.employee });
    },
  });
}

export function useDecideLeaveRequest(): ReturnType<
  typeof useMutation<
    LeaveRequest,
    ApiError,
    { id: string; decision: "approved" | "rejected"; body?: DecideLeaveInput }
  >
> {
  const qc = useQueryClient();
  return useMutation<
    LeaveRequest,
    ApiError,
    { id: string; decision: "approved" | "rejected"; body?: DecideLeaveInput }
  >({
    mutationFn: ({ id, decision, body }) =>
      api.patch<LeaveRequest>(
        `/leave/requests/${id}/${decision === "approved" ? "approve" : "reject"}`,
        body ?? {},
      ),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: leaveKeys.all });
      void qc.invalidateQueries({ queryKey: dashboardKeys.admin });
      void qc.invalidateQueries({ queryKey: dashboardKeys.employee });
    },
  });
}
