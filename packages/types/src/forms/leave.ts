import { z } from "zod";

const emptyToUndef = (v: string | undefined) => (v === "" ? undefined : v);

export const ApplyLeaveSchema = z
  .object({
    leaveTypeId: z.string().uuid("Pick a leave type"),
    startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Pick a start date"),
    endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Pick an end date"),
    halfDayStart: z.boolean().optional(),
    halfDayEnd: z.boolean().optional(),
    reason: z
      .string()
      .trim()
      .max(2000)
      .optional()
      .or(z.literal(""))
      .transform(emptyToUndef),
  })
  .refine((v) => v.startDate <= v.endDate, {
    message: "End date must be on or after start date",
    path: ["endDate"],
  });

export type ApplyLeaveFormValues = z.infer<typeof ApplyLeaveSchema>;
