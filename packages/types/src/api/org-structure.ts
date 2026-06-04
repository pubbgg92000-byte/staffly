/**
 * Org-structure API types — mirror apps/api/src/org-structure/.
 *
 * TODO(v0.20): Replace hierarchical department implementation with dedicated
 * Team entity. For v0.19 a "team" is a Department row with parentId != null.
 */

export interface OrgDepartment {
  id: string;
  organizationId: string;
  name: string;
  code: string | null;
  parentId: string | null;
  headEmployeeId: string | null;
  description: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface OrgDesignation {
  id: string;
  organizationId: string;
  name: string;
  level: number | null;
  description: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface OrgLocation {
  id: string;
  organizationId: string;
  name: string;
  code: string | null;
  addressLine1: string | null;
  addressLine2: string | null;
  city: string | null;
  state: string | null;
  country: string | null;
  postalCode: string | null;
  timezone: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateDepartmentInput {
  name: string;
  code?: string;
  parentId?: string;
  headEmployeeId?: string;
  description?: string;
}

export type UpdateDepartmentInput = Partial<CreateDepartmentInput>;

export interface CreateDesignationInput {
  name: string;
  level?: number;
  description?: string;
}

export type UpdateDesignationInput = Partial<CreateDesignationInput>;

export interface CreateLocationInput {
  name: string;
  code?: string;
  addressLine1?: string;
  addressLine2?: string;
  city?: string;
  state?: string;
  country?: string;
  postalCode?: string;
  timezone?: string;
}

export type UpdateLocationInput = Partial<CreateLocationInput>;

// TODO(v0.20): Replace with `OrgTeam` once dedicated Team entity ships.
export interface OrgDepartmentWithChildren extends OrgDepartment {
  children: OrgDepartmentWithChildren[];
}

// GET /employees/me — shape mirrors apps/api/src/employees/employees.service.ts findByUserId.
export interface MyEmployeeResponse {
  id: string;
  employeeCode: string;
  displayName: string;
  firstName: string;
  lastName: string;
  workEmail: string;
  profilePhotoUrl: string | null;
  joinedOn: string | null;
  department: {
    id: string;
    name: string;
    parentId: string | null;
    headEmployeeId: string | null;
    parent: { id: string; name: string } | null;
  } | null;
  designation: {
    id: string;
    name: string;
    level: number | null;
  } | null;
  location: {
    id: string;
    name: string;
    city: string | null;
    country: string | null;
  } | null;
  manager: {
    id: string;
    displayName: string;
    employeeCode: string;
    workEmail: string;
    designation: { name: string } | null;
  } | null;
}
