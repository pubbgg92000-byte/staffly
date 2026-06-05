/**
 * Documents API response shapes — mirror apps/api/src/documents/.
 */

import type { PageMeta } from "./employees";

export type DocumentAudienceType =
  | "all_employees"
  | "department"
  | "designation"
  | "location"
  | "employment_type"
  | "specific_employees";

export interface DocumentCategory {
  id: string;
  organizationId: string;
  name: string;
  code: string | null;
  color: string;
  description: string | null;
  isActive: boolean;
  isPersonal: boolean;
  isSystem: boolean;
  createdAt: string;
  updatedAt: string;
  /** Set when soft-deleted. Surfaced only with `includeArchived: true`. */
  deletedAt: string | null;
}

export interface DocumentCategoryListParams {
  page?: number;
  pageSize?: number;
  search?: string;
  isActive?: boolean;
  isPersonal?: boolean;
  includeArchived?: boolean;
}

export interface DocumentCategoryListResponse {
  items: DocumentCategory[];
  meta: PageMeta;
}

export interface CreateCategoryInput {
  name: string;
  code?: string;
  color?: string;
  description?: string;
  isActive?: boolean;
  isPersonal?: boolean;
}

export type UpdateCategoryInput = Partial<CreateCategoryInput>;

export interface DocumentVersion {
  id: string;
  organizationId: string;
  documentId: string;
  versionNo: number;
  storageKey: string;
  fileName: string;
  mimeType: string;
  sizeBytes: string;
  uploadedAt: string;
  uploadedBy: string | null;
}

export interface DocumentAudience {
  id: string;
  organizationId: string;
  documentId: string;
  audienceType: DocumentAudienceType;
  departmentId: string | null;
  designationId: string | null;
  locationId: string | null;
  employmentType: string | null;
  employeeId: string | null;
  createdAt: string;
}

export interface DocumentCategorySummary {
  id: string;
  name: string;
  color: string;
}

export interface Document {
  id: string;
  organizationId: string;
  categoryId: string;
  title: string;
  description: string | null;
  isRequired: boolean;
  isPersonal: boolean;
  subjectEmployeeId: string | null;
  currentVersionId: string | null;
  dueBy: string | null;
  publishedAt: string | null;
  expiresAt: string | null;
  archivedAt: string | null;
  /** Set when soft-deleted. Surfaced via `includeDeleted: true` on list, or
   * always on detail (the detail endpoint no longer filters deletedAt). */
  deletedAt: string | null;
  createdAt: string;
  updatedAt: string;
  category: DocumentCategorySummary;
  currentVersion: DocumentVersion | null;
  _count: { acknowledgements: number; versions: number; audiences: number };
}

export interface DocumentDetail extends Document {
  versions: DocumentVersion[];
  audiences: DocumentAudience[];
}

export interface MyDocumentItem extends Omit<Document, "_count"> {
  acknowledgements: { acknowledgedAt: string; versionNo: number }[];
}

export interface DocumentListParams {
  page?: number;
  pageSize?: number;
  categoryId?: string;
  isRequired?: boolean;
  isPersonal?: boolean;
  subjectEmployeeId?: string;
  status?: "draft" | "published" | "archived";
  expiringInDays?: number;
  search?: string;
  sortBy?: "createdAt" | "publishedAt" | "expiresAt" | "title";
  sortDir?: "asc" | "desc";
  /** Surface soft-deleted documents (separate from `status === "archived"`). */
  includeDeleted?: boolean;
}

export interface DocumentListResponse {
  items: Document[];
  meta: PageMeta;
}

export interface MyDocumentsParams {
  page?: number;
  pageSize?: number;
  unacknowledgedOnly?: boolean;
}

export interface MyDocumentsResponse {
  items: MyDocumentItem[];
  meta: PageMeta;
}

export interface PresignUploadResult {
  url: string;
  key: string;
  expiresIn: number;
}

export interface DownloadUrlResult {
  url: string;
  expiresIn: number;
  fileName: string;
}

export interface DocumentAckListItem {
  id: string;
  organizationId: string;
  documentId: string;
  employeeId: string;
  versionNo: number;
  acknowledgedAt: string;
  ipAddress: string | null;
  userAgent: string | null;
  employee: {
    id: string;
    displayName: string;
    employeeCode: string;
    workEmail: string;
  };
}

export interface DocumentAcknowledgementsResponse {
  items: DocumentAckListItem[];
  meta: PageMeta;
}

export interface DocumentAudiencePreviewResult {
  count: number;
  sample: { id: string; displayName: string; employeeCode: string }[];
}

export interface CreateDocumentInput {
  categoryId: string;
  title: string;
  description?: string;
  file: {
    storageKey: string;
    fileName: string;
    mimeType: string;
    sizeBytes: number;
  };
  isRequired?: boolean;
  dueBy?: string;
  isPersonal?: boolean;
  subjectEmployeeId?: string;
  expiresAt?: string;
  audiences?: {
    type: DocumentAudienceType;
    departmentId?: string;
    designationId?: string;
    locationId?: string;
    employmentType?: string;
    employeeId?: string;
  }[];
  publishNow?: boolean;
}

export interface UpdateDocumentInput {
  title?: string;
  description?: string | null;
  isRequired?: boolean;
  dueBy?: string | null;
  expiresAt?: string | null;
  audiences?: CreateDocumentInput["audiences"];
}
