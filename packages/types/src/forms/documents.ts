import { z } from "zod";

const emptyToUndef = (v: string | undefined) => (v === "" ? undefined : v);

export const DocumentSchema = z.object({
  categoryId: z.string().uuid("Pick a category"),
  title: z.string().trim().min(1, "Required").max(180),
  description: z
    .string()
    .trim()
    .max(4000)
    .optional()
    .or(z.literal(""))
    .transform(emptyToUndef),
  isRequired: z.boolean().optional(),
  dueBy: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD")
    .optional()
    .or(z.literal(""))
    .transform(emptyToUndef),
  expiresAt: z.string().optional().or(z.literal("")).transform(emptyToUndef),
  audienceType: z
    .enum([
      "all_employees",
      "department",
      "designation",
      "location",
      "employment_type",
      "specific_employees",
    ])
    .optional(),
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
  subjectEmployeeId: z
    .string()
    .uuid()
    .optional()
    .or(z.literal(""))
    .transform(emptyToUndef),
  publishNow: z.boolean().optional(),
});

export type DocumentFormValues = z.infer<typeof DocumentSchema>;

export const CategorySchema = z.object({
  name: z.string().trim().min(1, "Required").max(80),
  code: z
    .string()
    .trim()
    .toUpperCase()
    .max(20)
    .optional()
    .or(z.literal(""))
    .transform(emptyToUndef),
  color: z
    .string()
    .regex(/^#[0-9A-Fa-f]{6}([0-9A-Fa-f]{2})?$/, "Use hex color")
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
  isActive: z.boolean().optional(),
  isPersonal: z.boolean().optional(),
});

export type CategoryFormValues = z.infer<typeof CategorySchema>;
