/**
 * Employee API response shapes — mirror apps/api/src/employees/.
 */

export type EmployeeStatus =
  | "invited"
  | "active"
  | "on_leave"
  | "suspended"
  | "offboarded";

export type EmploymentType =
  | "full_time"
  | "part_time"
  | "intern"
  | "contractor"
  | "consultant";

export type WorkMode = "onsite" | "hybrid" | "remote";

export interface OrgItem {
  id: string;
  name: string;
}

export interface PageMeta {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export interface OrgListResponse {
  items: OrgItem[];
  meta: PageMeta;
}

export interface EmployeeListItem {
  id: string;
  employeeCode: string;
  displayName: string;
  firstName: string;
  lastName: string;
  workEmail: string;
  status: EmployeeStatus;
  employmentType: EmploymentType;
  workMode: WorkMode;
  profilePhotoUrl: string | null;
  joinedOn: string | null;
  managerId: string | null;
  department: OrgItem | null;
  designation: OrgItem | null;
  location: OrgItem | null;
}

export interface EmployeeDetail extends EmployeeListItem {
  middleName: string | null;
  personalEmail: string | null;
  mobilePhoneE164: string | null;
  dateOfBirth: string | null;
  gender: string | null;
  nationality: string | null;
  maritalStatus: string | null;
  bloodGroup: string | null;
  confirmedOn: string | null;
  terminatedOn: string | null;
  timezoneOverride: string | null;
  manager: {
    id: string;
    displayName: string;
    employeeCode: string;
  } | null;
}

export interface EmployeeListResponse {
  items: EmployeeListItem[];
  meta: PageMeta;
}

export interface CreateEmployeeInput {
  employeeCode: string;
  firstName: string;
  middleName?: string;
  lastName: string;
  workEmail: string;
  personalEmail?: string;
  mobilePhoneE164?: string;
  dateOfBirth?: string;
  gender?: string;
  nationality?: string;
  maritalStatus?: string;
  bloodGroup?: string;
  profilePhotoUrl?: string;
  status?: EmployeeStatus;
  joinedOn?: string;
  confirmedOn?: string;
  terminatedOn?: string;
  departmentId?: string;
  designationId?: string;
  locationId?: string;
  managerId?: string;
  employmentType?: EmploymentType;
  workMode?: WorkMode;
  timezoneOverride?: string;
}

export type UpdateEmployeeInput = Partial<CreateEmployeeInput>;

export interface EmployeeListParams {
  page?: number;
  pageSize?: number;
  search?: string;
  status?: EmployeeStatus;
  departmentId?: string;
  designationId?: string;
  locationId?: string;
  managerId?: string;
  employmentType?: EmploymentType;
  sortBy?: "displayName" | "employeeCode" | "createdAt" | "joinedOn";
  sortDir?: "asc" | "desc";
}
