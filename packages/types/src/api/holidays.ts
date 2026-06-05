/**
 * Holiday API response shapes — mirror apps/api/src/holidays/.
 */

import type { PageMeta } from "./employees";

export type HolidayType = "public" | "restricted" | "optional" | "company";

export interface Holiday {
  id: string;
  organizationId: string;
  calendarId: string;
  date: string;
  name: string;
  type: HolidayType;
  isOptional: boolean;
  description: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface HolidayCalendar {
  id: string;
  organizationId: string;
  name: string;
  code: string | null;
  description: string | null;
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
  /** Set when soft-deleted. Surfaced only with `includeArchived: true`. */
  deletedAt: string | null;
}

export interface HolidayCalendarDetail extends HolidayCalendar {
  holidays: Holiday[];
}

export interface HolidayCalendarsListParams {
  page?: number;
  pageSize?: number;
  search?: string;
  includeArchived?: boolean;
}

export interface HolidayCalendarsListResponse {
  items: HolidayCalendar[];
  meta: PageMeta;
}

export interface HolidaysListParams {
  page?: number;
  pageSize?: number;
  from?: string;
  to?: string;
  type?: HolidayType;
  sortDir?: "asc" | "desc";
}

export interface HolidaysListResponse {
  items: Holiday[];
  meta: PageMeta;
}

export interface MyHolidaysResponse {
  calendarId: string | null;
  holidays: Holiday[];
}

export interface CreateHolidayCalendarInput {
  name: string;
  code?: string;
  description?: string;
  isDefault?: boolean;
}

export type UpdateHolidayCalendarInput = Partial<CreateHolidayCalendarInput>;

export interface CreateHolidayInput {
  date: string;
  name: string;
  type?: HolidayType;
  isOptional?: boolean;
  description?: string;
}

export type UpdateHolidayInput = Partial<CreateHolidayInput>;

export interface LocationCalendarAssignment {
  locationId: string;
  organizationId: string;
  calendarId: string;
  assignedAt: string;
  assignedBy: string | null;
  calendar: HolidayCalendar;
}
