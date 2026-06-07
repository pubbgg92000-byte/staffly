/**
 * Notification API response shapes — mirror apps/api/src/notifications/.
 *
 * The Notification table has no title/body columns by design: rendered text
 * is derived on the client from `templateId` + `payload` (see the template
 * registry in @staffly/ui). `payload` is therefore intentionally loose.
 */

import type { PageMeta } from "./employees";

export type NotificationPriority = "low" | "normal" | "high";

export interface NotificationListItem {
  id: string;
  templateId: string;
  /**
   * Free-form JSON from the DB (a JSON column can hold any value). The
   * template registry in @staffly/ui narrows it per `templateId` and guards
   * against missing/!object payloads, so it stays `unknown` at the boundary.
   */
  payload: unknown;
  linkTo: string | null;
  priority: NotificationPriority;
  /** ISO 8601, or null when unread. */
  readAt: string | null;
  createdAt: string;
}

export interface NotificationListResponse {
  items: NotificationListItem[];
  meta: PageMeta;
}

export interface NotificationListParams {
  page?: number;
  pageSize?: number;
  unreadOnly?: boolean;
  sortDir?: "asc" | "desc";
}

export interface UnreadCountResponse {
  count: number;
}

/** Known payload shape for templateId "announcement.published". */
export interface AnnouncementPublishedPayload {
  announcementId: string;
  title: string;
  priority: NotificationPriority;
  requiresAcknowledgment: boolean;
}
