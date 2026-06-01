import { z } from "zod";

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "expected YYYY-MM-DD");
const hhmm = z.string().regex(/^\d{2}:\d{2}$/, "expected HH:MM");
const isoDateTime = z.string().datetime();

const AttendanceStatus = z.enum([
  "present",
  "half_day",
  "absent",
  "on_leave",
  "holiday",
  "weekoff",
]);
const RegularizationStatus = z.enum([
  "pending",
  "approved",
  "rejected",
  "cancelled",
]);

// ─── Policy DTOs ───────────────────────────────────────────────────────

export const CreatePolicyBody = z.object({
  name: z.string().trim().min(1).max(80),
  isDefault: z.boolean().optional(),
  workDays: z.array(z.number().int().min(0).max(6)).min(1).max(7).optional(),
  expectedHoursPerDay: z.coerce.number().min(0).max(24).optional(),
  dayStartTime: hhmm.optional(),
  dayEndTime: hhmm.optional(),
  graceMinutesLate: z.coerce.number().int().min(0).max(240).optional(),
  halfDayThresholdHours: z.coerce.number().min(0).max(24).optional(),
  regularizationWindowDays: z.coerce.number().int().min(0).max(90).optional(),
  autoCloseAtMinutesAfterEnd: z.coerce
    .number()
    .int()
    .min(0)
    .max(1440)
    .nullable()
    .optional(),
});
export const UpdatePolicyBody = CreatePolicyBody.partial();
export type CreatePolicyBodyT = z.infer<typeof CreatePolicyBody>;
export type UpdatePolicyBodyT = z.infer<typeof UpdatePolicyBody>;

// ─── Check in / out ────────────────────────────────────────────────────

export const CheckInBody = z
  .object({
    employeeId: z.string().uuid().optional(),
    notes: z.string().trim().max(500).optional(),
  })
  .default({});
export type CheckInBodyT = z.infer<typeof CheckInBody>;

export const CheckOutBody = CheckInBody;
export type CheckOutBodyT = z.infer<typeof CheckOutBody>;

// ─── Records listing ───────────────────────────────────────────────────

export const RecordsListQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  employeeId: z.string().uuid().optional(),
  from: isoDate.optional(),
  to: isoDate.optional(),
  status: AttendanceStatus.optional(),
  sortBy: z.enum(["attendanceDate", "createdAt"]).default("attendanceDate"),
  sortDir: z.enum(["asc", "desc"]).default("desc"),
});
export type RecordsListQueryT = z.infer<typeof RecordsListQuery>;

// ─── Regularization ────────────────────────────────────────────────────

export const CreateRegularizationBody = z
  .object({
    attendanceDate: isoDate,
    requestedCheckInAt: isoDateTime.optional(),
    requestedCheckOutAt: isoDateTime.optional(),
    reason: z.string().trim().min(3).max(2000),
    employeeId: z.string().uuid().optional(),
  })
  .refine(
    (v) => v.requestedCheckInAt || v.requestedCheckOutAt,
    "must include at least one of requestedCheckInAt or requestedCheckOutAt",
  );
export type CreateRegularizationBodyT = z.infer<
  typeof CreateRegularizationBody
>;

export const DecideRegularizationBody = z.object({
  decision: z.enum(["approved", "rejected"]),
  comment: z.string().trim().max(2000).optional(),
});
export type DecideRegularizationBodyT = z.infer<
  typeof DecideRegularizationBody
>;

export const RegularizationsListQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  status: RegularizationStatus.optional(),
  employeeId: z.string().uuid().optional(),
});
export type RegularizationsListQueryT = z.infer<
  typeof RegularizationsListQuery
>;
