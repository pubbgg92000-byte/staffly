import { z } from "zod";

const Gender = z.enum([
  "male",
  "female",
  "non_binary",
  "prefer_not_to_say",
  "other",
]);
const MaritalStatus = z.enum([
  "single",
  "married",
  "divorced",
  "widowed",
  "other",
]);
const EmployeeStatus = z.enum([
  "invited",
  "active",
  "on_leave",
  "suspended",
  "offboarded",
]);
const EmploymentType = z.enum([
  "full_time",
  "part_time",
  "intern",
  "contractor",
  "consultant",
]);
const WorkMode = z.enum(["onsite", "hybrid", "remote"]);

const date = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "expected YYYY-MM-DD")
  .transform((s) => new Date(s));

export const CreateEmployeeBody = z.object({
  employeeCode: z.string().trim().min(1).max(32),
  firstName: z.string().trim().min(1).max(60),
  middleName: z.string().trim().max(60).optional(),
  lastName: z.string().trim().min(1).max(60),
  workEmail: z.string().trim().toLowerCase().email().max(254),
  personalEmail: z.string().trim().toLowerCase().email().max(254).optional(),
  mobilePhoneE164: z.string().trim().max(20).optional(),
  dateOfBirth: date.optional(),
  gender: Gender.optional(),
  nationality: z.string().trim().length(2).toUpperCase().optional(),
  maritalStatus: MaritalStatus.optional(),
  bloodGroup: z.string().trim().max(3).optional(),
  profilePhotoUrl: z.string().trim().max(2048).optional(),
  status: EmployeeStatus.optional(),
  joinedOn: date.optional(),
  confirmedOn: date.optional(),
  terminatedOn: date.optional(),
  departmentId: z.string().uuid().optional(),
  designationId: z.string().uuid().optional(),
  locationId: z.string().uuid().optional(),
  managerId: z.string().uuid().optional(),
  employmentType: EmploymentType.optional(),
  workMode: WorkMode.optional(),
  timezoneOverride: z.string().trim().max(64).optional(),
});
export const UpdateEmployeeBody = CreateEmployeeBody.partial();
export type CreateEmployeeBodyT = z.infer<typeof CreateEmployeeBody>;
export type UpdateEmployeeBodyT = z.infer<typeof UpdateEmployeeBody>;

export const EmployeeListQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().trim().min(1).max(120).optional(),
  status: EmployeeStatus.optional(),
  departmentId: z.string().uuid().optional(),
  designationId: z.string().uuid().optional(),
  locationId: z.string().uuid().optional(),
  managerId: z.string().uuid().optional(),
  employmentType: EmploymentType.optional(),
  sortBy: z
    .enum(["displayName", "employeeCode", "createdAt", "joinedOn"])
    .default("displayName"),
  sortDir: z.enum(["asc", "desc"]).default("asc"),
});
export type EmployeeListQueryT = z.infer<typeof EmployeeListQuery>;
