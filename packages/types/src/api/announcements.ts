/**
 * Announcement API response shapes — mirror apps/api/src/announcements/.
 */

import type { PageMeta } from "./employees";

export type AnnouncementPriority = "low" | "normal" | "high";
export type AnnouncementStatus =
  | "draft"
  | "scheduled"
  | "published"
  | "archived";
export type AudienceType =
  | "all_employees"
  | "department"
  | "designation"
  | "location"
  | "employment_type"
  | "specific_employees";

export interface AnnouncementAudience {
  id: string;
  organizationId: string;
  announcementId: string;
  audienceType: AudienceType;
  departmentId: string | null;
  designationId: string | null;
  locationId: string | null;
  employmentType: string | null;
  employeeId: string | null;
  createdAt: string;
}

export interface Announcement {
  id: string;
  organizationId: string;
  title: string;
  bodyHtml: string;
  coverImageUrl: string | null;
  pinned: boolean;
  requiresAcknowledgment: boolean;
  priority: AnnouncementPriority;
  status: AnnouncementStatus;
  publishedAt: string | null;
  scheduledFor: string | null;
  expiresAt: string | null;
  createdAt: string;
  updatedAt: string;
  audiences: AnnouncementAudience[];
  _count: { acknowledgements: number };
}

export interface AnnouncementFeedItem extends Omit<Announcement, "_count"> {
  acknowledgements: { acknowledgedAt: string }[];
}

export interface AnnouncementsListParams {
  page?: number;
  pageSize?: number;
  status?: AnnouncementStatus;
  search?: string;
  pinnedFirst?: boolean;
  sortBy?: "createdAt" | "publishedAt" | "scheduledFor" | "title";
  sortDir?: "asc" | "desc";
}

export interface AnnouncementsListResponse {
  items: Announcement[];
  meta: PageMeta;
}

export interface MyAnnouncementsParams {
  page?: number;
  pageSize?: number;
  unacknowledgedOnly?: boolean;
}

export interface MyAnnouncementsResponse {
  items: AnnouncementFeedItem[];
  meta: PageMeta;
}

export interface AudienceItem {
  type: AudienceType;
  departmentId?: string;
  designationId?: string;
  locationId?: string;
  employmentType?: string;
  employeeId?: string;
}

export interface CreateAnnouncementInput {
  title: string;
  bodyHtml: string;
  coverImageUrl?: string;
  pinned?: boolean;
  requiresAcknowledgment?: boolean;
  priority?: AnnouncementPriority;
  scheduledFor?: string | null;
  expiresAt?: string | null;
  audiences: AudienceItem[];
}

export type UpdateAnnouncementInput = Partial<CreateAnnouncementInput>;

export interface AudiencePreviewResult {
  count: number;
  sample: { id: string; displayName: string; employeeCode: string }[];
}

export interface AcknowledgementListItem {
  id: string;
  organizationId: string;
  announcementId: string;
  employeeId: string;
  acknowledgedAt: string;
  employee: {
    id: string;
    displayName: string;
    employeeCode: string;
    workEmail: string;
  };
}

export interface AcknowledgementsListResponse {
  items: AcknowledgementListItem[];
  meta: PageMeta;
}

export interface AcknowledgementsListParams {
  page?: number;
  pageSize?: number;
}
