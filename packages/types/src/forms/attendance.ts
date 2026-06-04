import { z } from "zod";

const emptyToUndef = (v: string | undefined) => (v === "" ? undefined : v);

export const CreateRegularizationSchema = z
  .object({
    attendanceDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Pick a date"),
    checkInTime: z
      .string()
      .regex(/^\d{2}:\d{2}$/, "Use HH:MM")
      .or(z.literal(""))
      .optional()
      .transform(emptyToUndef),
    checkOutTime: z
      .string()
      .regex(/^\d{2}:\d{2}$/, "Use HH:MM")
      .or(z.literal(""))
      .optional()
      .transform(emptyToUndef),
    reason: z
      .string()
      .trim()
      .min(3, "At least 3 characters")
      .max(2000, "Too long"),
  })
  .refine((v) => v.checkInTime || v.checkOutTime, {
    message: "Provide a check-in or check-out time",
    path: ["checkInTime"],
  });

export type CreateRegularizationFormValues = z.infer<
  typeof CreateRegularizationSchema
>;
