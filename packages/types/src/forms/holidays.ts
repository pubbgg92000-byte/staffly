import { z } from "zod";

const emptyToUndef = (v: string | undefined) => (v === "" ? undefined : v);

export const HolidayCalendarSchema = z.object({
  name: z.string().trim().min(1, "Required").max(80),
  code: z
    .string()
    .trim()
    .toUpperCase()
    .max(20)
    .optional()
    .or(z.literal(""))
    .transform(emptyToUndef),
  description: z
    .string()
    .trim()
    .max(2000)
    .optional()
    .or(z.literal(""))
    .transform(emptyToUndef),
  isDefault: z.boolean().optional(),
});

export type HolidayCalendarFormValues = z.infer<typeof HolidayCalendarSchema>;

export const HolidaySchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Pick a date"),
  name: z.string().trim().min(1, "Required").max(120),
  type: z.enum(["public", "restricted", "optional", "company"]).optional(),
  isOptional: z.boolean().optional(),
  description: z
    .string()
    .trim()
    .max(2000)
    .optional()
    .or(z.literal(""))
    .transform(emptyToUndef),
});

export type HolidayFormValues = z.infer<typeof HolidaySchema>;

export const AssignCalendarSchema = z.object({
  calendarId: z.string().uuid("Pick a calendar"),
});

export type AssignCalendarFormValues = z.infer<typeof AssignCalendarSchema>;
