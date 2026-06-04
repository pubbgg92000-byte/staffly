/**
 * Attendance API response shapes — mirror apps/api/src/attendance/.
 */

import type { PageMeta } from "./employees";

export type AttendanceStatus =
  | "present"
  | "half_day"
  | "absent"
  | "on_leave"
  | "holiday"
  | "weekoff";

export type RegularizationStatus =
  | "pending"
  | "approved"
  | "rejected"
  | "cancelled";

export interface AttendanceRecord {
  id: string;
  organizationId: string;
  employeeId: string;
  attendanceDate: string;
  checkInAt: string | null;
  checkOutAt: string | null;
  checkInIp: string | null;
  checkOutIp: string | null;
  checkInUserAgent: string | null;
  checkOutUserAgent: string | null;
  workedMinutes: number | null;
  status: AttendanceStatus;
  isLate: boolean;
  isRegularized: boolean;
  regularizationId: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AttendanceMeResponse {
  employee: { id: string; displayName: string };
  date: string;
  timezone: string;
  record: AttendanceRecord | null;
}

export interface AttendanceListParams {
  page?: number;
  pageSize?: number;
  employeeId?: string;
  from?: string;
  to?: string;
  status?: AttendanceStatus;
  sortBy?: "attendanceDate" | "createdAt";
  sortDir?: "asc" | "desc";
}

export interface AttendanceListResponse {
  items: AttendanceRecord[];
  meta: PageMeta;
}

export interface AttendanceRegularization {
  id: string;
  organizationId: string;
  employeeId: string;
  attendanceDate: string;
  requestedCheckInAt: string | null;
  requestedCheckOutAt: string | null;
  reason: string;
  status: RegularizationStatus;
  decidedBy: string | null;
  decidedAt: string | null;
  decisionComment: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface RegularizationsListParams {
  page?: number;
  pageSize?: number;
  status?: RegularizationStatus;
  employeeId?: string;
}

export interface RegularizationsListResponse {
  items: AttendanceRegularization[];
  meta: PageMeta;
}

export interface CreateRegularizationInput {
  attendanceDate: string;
  requestedCheckInAt?: string;
  requestedCheckOutAt?: string;
  reason: string;
  employeeId?: string;
}

export interface DecideRegularizationInput {
  decision: "approved" | "rejected";
  comment?: string;
}
