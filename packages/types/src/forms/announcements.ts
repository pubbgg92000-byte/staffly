import { z } from "zod";

const emptyToUndef = (v: string | undefined) => (v === "" ? undefined : v);

export const AnnouncementSchema = z.object({
  title: z.string().trim().min(1, "Required").max(180),
  bodyHtml: z.string().trim().min(1, "Body is required"),
  priority: z.enum(["low", "normal", "high"]).optional(),
  pinned: z.boolean().optional(),
  requiresAcknowledgment: z.boolean().optional(),
  scheduledFor: z.string().optional().or(z.literal("")).transform(emptyToUndef),
  expiresAt: z.string().optional().or(z.literal("")).transform(emptyToUndef),
  audienceType: z.enum([
    "all_employees",
    "department",
    "designation",
    "location",
    "employment_type",
    "specific_employees",
  ]),
  departmentId: z
    .string()
    .uuid()
    .optional()
    .or(z.literal(""))
    .transform(emptyToUndef),
  designationId: z
    .string()
    .uuid()
    .optional()
    .or(z.literal(""))
    .transform(emptyToUndef),
  locationId: z
    .string()
    .uuid()
    .optional()
    .or(z.literal(""))
    .transform(emptyToUndef),
  employmentType: z
    .enum(["full_time", "part_time", "intern", "contractor", "consultant"])
    .optional(),
  employeeId: z
    .string()
    .uuid()
    .optional()
    .or(z.literal(""))
    .transform(emptyToUndef),
});

export type AnnouncementFormValues = z.infer<typeof AnnouncementSchema>;
