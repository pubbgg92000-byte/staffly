import { z } from "zod";

const emptyToUndef = (v: string | undefined) => (v === "" ? undefined : v);

export const DepartmentSchema = z.object({
  name: z.string().trim().min(1, "Required").max(100),
  code: z
    .string()
    .trim()
    .max(20)
    .optional()
    .or(z.literal(""))
    .transform(emptyToUndef),
  parentId: z
    .string()
    .uuid()
    .optional()
    .or(z.literal(""))
    .transform(emptyToUndef),
  headEmployeeId: z
    .string()
    .uuid()
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
});

export type DepartmentFormValues = z.infer<typeof DepartmentSchema>;

export const DesignationSchema = z.object({
  name: z.string().trim().min(1, "Required").max(120),
  // Stored as a string at the form layer so RHF + `<Input type="number">` works
  // cleanly; the caller converts to number before submitting to the API.
  level: z
    .string()
    .optional()
    .refine(
      (v) => v === undefined || v === "" || /^\d+$/.test(v),
      "Level must be a whole number",
    )
    .refine((v) => {
      if (v === undefined || v === "") return true;
      const n = Number(v);
      return n >= 0 && n <= 100;
    }, "Level must be 0–100"),
  description: z
    .string()
    .trim()
    .max(2000)
    .optional()
    .or(z.literal(""))
    .transform(emptyToUndef),
});

export type DesignationFormValues = z.infer<typeof DesignationSchema>;

/** Convert form values to the API payload shape (coerces level to number). */
export function designationFormToPayload(v: DesignationFormValues): {
  name: string;
  level?: number;
  description?: string;
} {
  return {
    name: v.name,
    description: v.description,
    level:
      v.level === undefined || v.level === "" ? undefined : Number(v.level),
  };
}

export const LocationSchema = z.object({
  name: z.string().trim().min(1, "Required").max(120),
  code: z
    .string()
    .trim()
    .max(20)
    .optional()
    .or(z.literal(""))
    .transform(emptyToUndef),
  addressLine1: z
    .string()
    .trim()
    .max(180)
    .optional()
    .or(z.literal(""))
    .transform(emptyToUndef),
  addressLine2: z
    .string()
    .trim()
    .max(180)
    .optional()
    .or(z.literal(""))
    .transform(emptyToUndef),
  city: z
    .string()
    .trim()
    .max(80)
    .optional()
    .or(z.literal(""))
    .transform(emptyToUndef),
  state: z
    .string()
    .trim()
    .max(80)
    .optional()
    .or(z.literal(""))
    .transform(emptyToUndef),
  country: z
    .string()
    .trim()
    .length(2, "Use 2-letter code")
    .toUpperCase()
    .optional()
    .or(z.literal(""))
    .transform(emptyToUndef),
  postalCode: z
    .string()
    .trim()
    .max(20)
    .optional()
    .or(z.literal(""))
    .transform(emptyToUndef),
  timezone: z
    .string()
    .trim()
    .max(64)
    .optional()
    .or(z.literal(""))
    .transform(emptyToUndef),
});

export type LocationFormValues = z.infer<typeof LocationSchema>;
