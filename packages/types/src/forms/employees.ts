import { z } from "zod";

const uuidOrEmpty = z
  .string()
  .uuid()
  .or(z.literal(""))
  .optional()
  .transform((v) => (v === "" ? undefined : v));

const dateOrEmpty = z
  .string()
  .transform((v) => (v?.length > 10 ? v.slice(0, 10) : v))
  .pipe(
    z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, "Must be YYYY-MM-DD")
      .or(z.literal(""))
      .optional(),
  )
  .transform((v) => (v === "" ? undefined : v));

export const CreateEmployeeSchema = z.object({
  employeeCode: z.string().min(1, "Required").max(32),
  firstName: z.string().min(1, "Required").max(60),
  middleName: z.string().max(60).optional().or(z.literal("")).transform((v) => v === "" ? undefined : v),
  lastName: z.string().min(1, "Required").max(60),
  workEmail: z.string().email("Must be a valid email"),
  personalEmail: z.string().email("Must be a valid email").optional().or(z.literal("")).transform((v) => v === "" ? undefined : v),
  mobilePhoneE164: z.string().max(20).optional().or(z.literal("")).transform((v) => v === "" ? undefined : v),
  status: z
    .enum(["invited", "active", "on_leave", "suspended", "offboarded"])
    .optional(),
  joinedOn: dateOrEmpty,
  departmentId: uuidOrEmpty,
  designationId: uuidOrEmpty,
  locationId: uuidOrEmpty,
  managerId: uuidOrEmpty,
  employmentType: z
    .enum(["full_time", "part_time", "intern", "contractor", "consultant"])
    .optional(),
  workMode: z.enum(["onsite", "hybrid", "remote"]).optional(),
});

export type CreateEmployeeFormValues = z.infer<typeof CreateEmployeeSchema>;

export const UpdateEmployeeSchema = CreateEmployeeSchema.partial();

export type UpdateEmployeeFormValues = z.infer<typeof UpdateEmployeeSchema>;
