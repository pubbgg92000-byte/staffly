import { z } from "zod";

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "expected YYYY-MM-DD");

const LeaveUnit = z.enum(["day", "half_day", "hour"]);
const LeaveAccrualType = z.enum(["annual", "monthly", "quarterly", "none"]);
const LeaveRequestStatus = z.enum([
  "pending",
  "approved",
  "rejected",
  "cancelled",
]);

// ─── Types ────────────────────────────────────────────────────────────

export const CreateLeaveTypeBody = z.object({
  name: z.string().trim().min(1).max(80),
  code: z
    .string()
    .trim()
    .toUpperCase()
    .min(1)
    .max(20)
    .regex(/^[A-Z][A-Z0-9_]*$/),
  color: z
    .string()
    .regex(/^#[0-9A-Fa-f]{6,8}$/)
    .optional(),
  unit: LeaveUnit.optional(),
  accrualType: LeaveAccrualType.optional(),
  accrualAmount: z.coerce.number().min(0).max(9999).optional(),
  maxBalance: z.coerce.number().min(0).max(9999).nullable().optional(),
  carryForwardMax: z.coerce.number().min(0).max(9999).nullable().optional(),
  minRequestUnits: z.coerce.number().min(0).max(9999).optional(),
  maxRequestUnits: z.coerce.number().min(0).max(9999).nullable().optional(),
  noticeDaysRequired: z.coerce.number().int().min(0).max(365).optional(),
  isPaid: z.boolean().optional(),
  requiresApproval: z.boolean().optional(),
  requiresAttachmentAfterDays: z.coerce
    .number()
    .int()
    .min(0)
    .max(365)
    .nullable()
    .optional(),
});
export const UpdateLeaveTypeBody = CreateLeaveTypeBody.partial();
export type CreateLeaveTypeBodyT = z.infer<typeof CreateLeaveTypeBody>;
export type UpdateLeaveTypeBodyT = z.infer<typeof UpdateLeaveTypeBody>;

// ─── Requests ─────────────────────────────────────────────────────────

export const ApplyLeaveBody = z
  .object({
    leaveTypeId: z.string().uuid(),
    startDate: isoDate,
    endDate: isoDate,
    halfDayStart: z.boolean().optional(),
    halfDayEnd: z.boolean().optional(),
    reason: z.string().trim().min(3).max(2000).optional(),
    attachmentUrl: z.string().trim().max(2048).optional(),
    employeeId: z.string().uuid().optional(),
  })
  .refine((v) => v.startDate <= v.endDate, {
    message: "endDate must be on or after startDate",
    path: ["endDate"],
  });
export type ApplyLeaveBodyT = z.infer<typeof ApplyLeaveBody>;

export const RequestsListQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  employeeId: z.string().uuid().optional(),
  leaveTypeId: z.string().uuid().optional(),
  status: LeaveRequestStatus.optional(),
  from: isoDate.optional(),
  to: isoDate.optional(),
  sortBy: z.enum(["createdAt", "startDate"]).default("createdAt"),
  sortDir: z.enum(["asc", "desc"]).default("desc"),
});
export type RequestsListQueryT = z.infer<typeof RequestsListQuery>;

export const DecideBody = z.object({
  comment: z.string().trim().max(2000).optional(),
});
export type DecideBodyT = z.infer<typeof DecideBody>;

// ─── Balances ─────────────────────────────────────────────────────────

export const BalancesListQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  employeeId: z.string().uuid().optional(),
  leaveTypeId: z.string().uuid().optional(),
  cycleYear: z.coerce.number().int().min(2000).max(2100).optional(),
});
export type BalancesListQueryT = z.infer<typeof BalancesListQuery>;

export const AdjustBalanceBody = z.object({
  allocated: z.coerce.number().min(0).max(9999).optional(),
  carryForward: z.coerce.number().min(0).max(9999).optional(),
  adjusted: z.coerce.number().min(-9999).max(9999).optional(),
  reason: z.string().trim().min(3).max(2000).optional(),
});
export type AdjustBalanceBodyT = z.infer<typeof AdjustBalanceBody>;
