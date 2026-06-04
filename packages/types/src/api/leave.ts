/**
 * Leave API response shapes — mirror apps/api/src/leave/.
 */

import type { PageMeta } from "./employees";

export type LeaveRequestStatus =
  | "pending"
  | "approved"
  | "rejected"
  | "cancelled";

export type LeaveUnit = "day" | "half_day" | "hour";

export type LeaveAccrualType = "annual" | "monthly" | "quarterly" | "none";

export interface LeaveTypeSummary {
  id: string;
  code: string;
  name: string;
  color: string | null;
}

export interface LeaveType {
  id: string;
  organizationId: string;
  name: string;
  code: string;
  color: string;
  unit: LeaveUnit;
  accrualType: LeaveAccrualType;
  accrualAmount: string | number;
  maxBalance: string | number | null;
  carryForwardMax: string | number | null;
  minRequestUnits: string | number;
  maxRequestUnits: string | number | null;
  noticeDaysRequired: number;
  isPaid: boolean;
  requiresApproval: boolean;
  requiresAttachmentAfterDays: number | null;
  isSystem: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface LeaveTypeListResponse {
  items: LeaveType[];
  meta: PageMeta;
}

export interface LeaveBalance {
  id: string;
  organizationId: string;
  employeeId: string;
  leaveTypeId: string;
  cycleYear: number;
  allocated: string | number;
  used: string | number;
  pending: string | number;
  carryForward: string | number;
  adjusted: string | number;
  available: number;
  leaveType: LeaveTypeSummary;
  createdAt: string;
  updatedAt: string;
}

export interface MyLeaveBalancesResponse {
  employeeId: string;
  cycleYear: number;
  items: LeaveBalance[];
}

export interface LeaveBalancesListParams {
  page?: number;
  pageSize?: number;
  employeeId?: string;
  leaveTypeId?: string;
  cycleYear?: number;
}

export interface LeaveBalancesListResponse {
  items: LeaveBalance[];
  meta: PageMeta;
}

export interface LeaveRequest {
  id: string;
  organizationId: string;
  employeeId: string;
  leaveTypeId: string;
  startDate: string;
  endDate: string;
  halfDayStart: boolean;
  halfDayEnd: boolean;
  units: string | number;
  reason: string | null;
  attachmentUrl: string | null;
  status: LeaveRequestStatus;
  decidedAt: string | null;
  decidedBy: string | null;
  decisionComment: string | null;
  cancelledAt: string | null;
  cancelledBy: string | null;
  createdAt: string;
  updatedAt: string;
  leaveType: LeaveTypeSummary;
}

export interface LeaveRequestsListParams {
  page?: number;
  pageSize?: number;
  employeeId?: string;
  leaveTypeId?: string;
  status?: LeaveRequestStatus;
  from?: string;
  to?: string;
  sortBy?: "createdAt" | "startDate";
  sortDir?: "asc" | "desc";
}

export interface LeaveRequestsListResponse {
  items: LeaveRequest[];
  meta: PageMeta;
}

export interface ApplyLeaveInput {
  leaveTypeId: string;
  startDate: string;
  endDate: string;
  halfDayStart?: boolean;
  halfDayEnd?: boolean;
  reason?: string;
  attachmentUrl?: string;
  employeeId?: string;
}

export interface DecideLeaveInput {
  comment?: string;
}
