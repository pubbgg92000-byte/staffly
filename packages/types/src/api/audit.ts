/**
 * Audit log API response shapes — mirror apps/api/src/audit/.
 */

import type { PageMeta } from "./employees";

export interface AuditLogListItem {
  id: string;
  action: string;
  resourceType: string;
  resourceId: string | null;
  actorUserId: string | null;
  actorIp: string | null;
  actorName: string | null;
  actorEmail: string | null;
  createdAt: string;
}

export interface AuditLogDetail extends AuditLogListItem {
  /** Pre-change snapshot. Sensitive fields are redacted by the API. */
  before: unknown;
  /** Post-change snapshot. Sensitive fields are redacted by the API. */
  after: unknown;
  metadata: unknown;
}

export interface AuditLogListResponse {
  items: AuditLogListItem[];
  meta: PageMeta;
}

export interface AuditLogListParams {
  page?: number;
  pageSize?: number;
  action?: string;
  resourceType?: string;
  actorUserId?: string;
  resourceId?: string;
  /** ISO 8601 datetime — inclusive lower bound on createdAt. */
  from?: string;
  /** ISO 8601 datetime — inclusive upper bound on createdAt. */
  to?: string;
  search?: string;
  sortDir?: "asc" | "desc";
}
