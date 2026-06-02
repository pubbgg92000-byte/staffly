import { z } from "zod";

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "expected YYYY-MM-DD");

const HolidayType = z.enum(["public", "restricted", "optional", "company"]);

// ─── Calendars ────────────────────────────────────────────────────────

export const CreateHolidayCalendarBody = z.object({
  name: z.string().trim().min(1).max(80),
  code: z.string().trim().toUpperCase().min(1).max(20).optional(),
  description: z.string().trim().max(2000).optional(),
  isDefault: z.boolean().optional(),
});
export const UpdateHolidayCalendarBody = CreateHolidayCalendarBody.partial();
export type CreateHolidayCalendarBodyT = z.infer<
  typeof CreateHolidayCalendarBody
>;
export type UpdateHolidayCalendarBodyT = z.infer<
  typeof UpdateHolidayCalendarBody
>;

// ─── Holidays ─────────────────────────────────────────────────────────

export const CreateHolidayBody = z.object({
  date: isoDate,
  name: z.string().trim().min(1).max(120),
  type: HolidayType.optional(),
  isOptional: z.boolean().optional(),
  description: z.string().trim().max(2000).optional(),
});
export const UpdateHolidayBody = CreateHolidayBody.partial();
export type CreateHolidayBodyT = z.infer<typeof CreateHolidayBody>;
export type UpdateHolidayBodyT = z.infer<typeof UpdateHolidayBody>;

export const BulkUpsertHolidaysBody = z.object({
  items: z.array(CreateHolidayBody).min(1).max(500),
});
export type BulkUpsertHolidaysBodyT = z.infer<typeof BulkUpsertHolidaysBody>;

export const HolidayListQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(500).default(100),
  from: isoDate.optional(),
  to: isoDate.optional(),
  type: HolidayType.optional(),
  sortDir: z.enum(["asc", "desc"]).default("asc"),
});
export type HolidayListQueryT = z.infer<typeof HolidayListQuery>;

export const MyHolidaysQuery = z
  .object({
    from: isoDate,
    to: isoDate,
  })
  .refine((v) => v.from <= v.to, {
    message: "`to` must be on or after `from`",
    path: ["to"],
  });
export type MyHolidaysQueryT = z.infer<typeof MyHolidaysQuery>;

// ─── Location assignment ──────────────────────────────────────────────

export const AssignLocationCalendarBody = z.object({
  calendarId: z.string().uuid(),
});
export type AssignLocationCalendarBodyT = z.infer<
  typeof AssignLocationCalendarBody
>;
