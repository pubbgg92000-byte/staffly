import { z } from "zod";

const name100 = z.string().trim().min(1).max(100);
const name120 = z.string().trim().min(1).max(120);
const code20 = z.string().trim().min(1).max(20).optional();

export const CreateDepartmentBody = z.object({
  name: name100,
  code: code20,
  parentId: z.string().uuid().optional(),
  headEmployeeId: z.string().uuid().optional(),
  description: z.string().trim().max(2000).optional(),
});
export const UpdateDepartmentBody = CreateDepartmentBody.partial();
export type CreateDepartmentBodyT = z.infer<typeof CreateDepartmentBody>;
export type UpdateDepartmentBodyT = z.infer<typeof UpdateDepartmentBody>;

export const CreateDesignationBody = z.object({
  name: name120,
  level: z.coerce.number().int().min(0).max(100).optional(),
  description: z.string().trim().max(2000).optional(),
});
export const UpdateDesignationBody = CreateDesignationBody.partial();
export type CreateDesignationBodyT = z.infer<typeof CreateDesignationBody>;
export type UpdateDesignationBodyT = z.infer<typeof UpdateDesignationBody>;

export const CreateLocationBody = z.object({
  name: name120,
  code: code20,
  addressLine1: z.string().trim().max(180).optional(),
  addressLine2: z.string().trim().max(180).optional(),
  city: z.string().trim().max(80).optional(),
  state: z.string().trim().max(80).optional(),
  country: z.string().trim().length(2).toUpperCase().optional(),
  postalCode: z.string().trim().max(20).optional(),
  timezone: z.string().trim().max(64).optional(),
});
export const UpdateLocationBody = CreateLocationBody.partial();
export type CreateLocationBodyT = z.infer<typeof CreateLocationBody>;
export type UpdateLocationBodyT = z.infer<typeof UpdateLocationBody>;
