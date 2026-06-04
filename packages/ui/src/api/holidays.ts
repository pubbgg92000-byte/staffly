"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "./client";
import { ApiError } from "./error";
import { dashboardKeys } from "./dashboard";
import type {
  CreateHolidayCalendarInput,
  CreateHolidayInput,
  Holiday,
  HolidayCalendar,
  HolidayCalendarDetail,
  HolidayCalendarsListParams,
  HolidayCalendarsListResponse,
  HolidaysListParams,
  HolidaysListResponse,
  LocationCalendarAssignment,
  MyHolidaysResponse,
  UpdateHolidayCalendarInput,
  UpdateHolidayInput,
} from "@staffly/types";

export const holidayKeys = {
  all: ["holidays"] as const,
  calendars: (params?: HolidayCalendarsListParams) =>
    ["holidays", "calendars", "list", params ?? {}] as const,
  calendar: (id: string) => ["holidays", "calendars", "detail", id] as const,
  holidaysIn: (calendarId: string, params?: HolidaysListParams) =>
    ["holidays", "list", calendarId, params ?? {}] as const,
  my: (from: string, to: string) => ["holidays", "me", from, to] as const,
  locationAssignment: (locationId: string) =>
    ["holidays", "location", locationId] as const,
};

function calendarsQs(params?: HolidayCalendarsListParams): string {
  if (!params) return "";
  const sp = new URLSearchParams();
  if (params.page) sp.set("page", String(params.page));
  if (params.pageSize) sp.set("pageSize", String(params.pageSize));
  if (params.search) sp.set("search", params.search);
  const qs = sp.toString();
  return qs ? `?${qs}` : "";
}

function holidaysQs(params?: HolidaysListParams): string {
  if (!params) return "";
  const sp = new URLSearchParams();
  if (params.page) sp.set("page", String(params.page));
  if (params.pageSize) sp.set("pageSize", String(params.pageSize));
  if (params.from) sp.set("from", params.from);
  if (params.to) sp.set("to", params.to);
  if (params.type) sp.set("type", params.type);
  if (params.sortDir) sp.set("sortDir", params.sortDir);
  const qs = sp.toString();
  return qs ? `?${qs}` : "";
}

export function useHolidayCalendars(params?: HolidayCalendarsListParams): {
  data: HolidayCalendarsListResponse | undefined;
  isLoading: boolean;
  isError: boolean;
  error: ApiError | null;
  refetch: () => void;
} {
  const q = useQuery({
    queryKey: holidayKeys.calendars(params),
    queryFn: () =>
      api.get<HolidayCalendarsListResponse>(
        `/holiday-calendars${calendarsQs(params)}`,
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

export function useHolidayCalendar(id: string | undefined): {
  data: HolidayCalendarDetail | undefined;
  isLoading: boolean;
  isError: boolean;
  error: ApiError | null;
  refetch: () => void;
} {
  const q = useQuery({
    queryKey: holidayKeys.calendar(id ?? ""),
    queryFn: () => api.get<HolidayCalendarDetail>(`/holiday-calendars/${id}`),
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

export function useHolidaysInCalendar(
  calendarId: string | undefined,
  params?: HolidaysListParams,
): {
  data: HolidaysListResponse | undefined;
  isLoading: boolean;
  isError: boolean;
  error: ApiError | null;
  refetch: () => void;
} {
  const q = useQuery({
    queryKey: holidayKeys.holidaysIn(calendarId ?? "", params),
    queryFn: () =>
      api.get<HolidaysListResponse>(
        `/holiday-calendars/${calendarId}/holidays${holidaysQs(params)}`,
      ),
    staleTime: 30_000,
    enabled: !!calendarId,
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

export function useMyHolidays(
  from: string | undefined,
  to: string | undefined,
): {
  data: MyHolidaysResponse | undefined;
  isLoading: boolean;
  isError: boolean;
  error: ApiError | null;
  refetch: () => void;
} {
  const q = useQuery({
    queryKey: holidayKeys.my(from ?? "", to ?? ""),
    queryFn: () =>
      api.get<MyHolidaysResponse>(`/holidays/me?from=${from}&to=${to}`),
    staleTime: 60_000,
    enabled: !!from && !!to,
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

export function useLocationCalendar(locationId: string | undefined): {
  data: LocationCalendarAssignment | null | undefined;
  isLoading: boolean;
} {
  const q = useQuery({
    queryKey: holidayKeys.locationAssignment(locationId ?? ""),
    queryFn: () =>
      api.get<LocationCalendarAssignment | null>(
        `/locations/${locationId}/holiday-calendar`,
      ),
    staleTime: 30_000,
    enabled: !!locationId,
    retry: 1,
  });
  return { data: q.data, isLoading: q.isLoading };
}

// ─── Mutations: calendars ─────────────────────────────────────────────

export function useCreateHolidayCalendar(): ReturnType<
  typeof useMutation<HolidayCalendar, ApiError, CreateHolidayCalendarInput>
> {
  const qc = useQueryClient();
  return useMutation<HolidayCalendar, ApiError, CreateHolidayCalendarInput>({
    mutationFn: (body) => api.post<HolidayCalendar>("/holiday-calendars", body),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: holidayKeys.all });
    },
  });
}

export function useUpdateHolidayCalendar(): ReturnType<
  typeof useMutation<
    HolidayCalendar,
    ApiError,
    { id: string; body: UpdateHolidayCalendarInput }
  >
> {
  const qc = useQueryClient();
  return useMutation<
    HolidayCalendar,
    ApiError,
    { id: string; body: UpdateHolidayCalendarInput }
  >({
    mutationFn: ({ id, body }) =>
      api.patch<HolidayCalendar>(`/holiday-calendars/${id}`, body),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: holidayKeys.all });
    },
  });
}

export function useDeleteHolidayCalendar(): ReturnType<
  typeof useMutation<void, ApiError, string>
> {
  const qc = useQueryClient();
  return useMutation<void, ApiError, string>({
    mutationFn: (id) => api.delete(`/holiday-calendars/${id}`),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: holidayKeys.all });
    },
  });
}

export function useSetDefaultCalendar(): ReturnType<
  typeof useMutation<HolidayCalendar, ApiError, string>
> {
  const qc = useQueryClient();
  return useMutation<HolidayCalendar, ApiError, string>({
    mutationFn: (id) =>
      api.post<HolidayCalendar>(`/holiday-calendars/${id}/set-default`, {}),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: holidayKeys.all });
    },
  });
}

// ─── Mutations: holidays ──────────────────────────────────────────────

export function useCreateHoliday(): ReturnType<
  typeof useMutation<
    Holiday,
    ApiError,
    { calendarId: string; body: CreateHolidayInput }
  >
> {
  const qc = useQueryClient();
  return useMutation<
    Holiday,
    ApiError,
    { calendarId: string; body: CreateHolidayInput }
  >({
    mutationFn: ({ calendarId, body }) =>
      api.post<Holiday>(`/holiday-calendars/${calendarId}/holidays`, body),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: holidayKeys.all });
      void qc.invalidateQueries({ queryKey: dashboardKeys.admin });
      void qc.invalidateQueries({ queryKey: dashboardKeys.employee });
    },
  });
}

export function useUpdateHoliday(): ReturnType<
  typeof useMutation<
    Holiday,
    ApiError,
    { id: string; body: UpdateHolidayInput }
  >
> {
  const qc = useQueryClient();
  return useMutation<
    Holiday,
    ApiError,
    { id: string; body: UpdateHolidayInput }
  >({
    mutationFn: ({ id, body }) => api.patch<Holiday>(`/holidays/${id}`, body),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: holidayKeys.all });
      void qc.invalidateQueries({ queryKey: dashboardKeys.admin });
      void qc.invalidateQueries({ queryKey: dashboardKeys.employee });
    },
  });
}

export function useDeleteHoliday(): ReturnType<
  typeof useMutation<void, ApiError, string>
> {
  const qc = useQueryClient();
  return useMutation<void, ApiError, string>({
    mutationFn: (id) => api.delete(`/holidays/${id}`),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: holidayKeys.all });
      void qc.invalidateQueries({ queryKey: dashboardKeys.admin });
      void qc.invalidateQueries({ queryKey: dashboardKeys.employee });
    },
  });
}

// ─── Mutations: location assignments ──────────────────────────────────

export function useAssignLocationCalendar(): ReturnType<
  typeof useMutation<
    LocationCalendarAssignment,
    ApiError,
    { locationId: string; calendarId: string }
  >
> {
  const qc = useQueryClient();
  return useMutation<
    LocationCalendarAssignment,
    ApiError,
    { locationId: string; calendarId: string }
  >({
    mutationFn: ({ locationId, calendarId }) =>
      api.post<LocationCalendarAssignment>(
        `/locations/${locationId}/holiday-calendar`,
        { calendarId },
      ),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: holidayKeys.all });
    },
  });
}

export function useUnassignLocationCalendar(): ReturnType<
  typeof useMutation<void, ApiError, string>
> {
  const qc = useQueryClient();
  return useMutation<void, ApiError, string>({
    mutationFn: (locationId) =>
      api.delete(`/locations/${locationId}/holiday-calendar`),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: holidayKeys.all });
    },
  });
}
