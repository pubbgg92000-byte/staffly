/**
 * RBAC API response shapes — mirror apps/api/src/rbac/.
 */

import type { PageMeta } from "./employees";
import type { RoleKey } from "./auth";

// ─── Permissions catalog ──────────────────────────────────────────────────────

export interface Permission {
  key: string;
  resource: string;
  action: string;
  description: string;
}

export interface PermissionListResponse {
  items: Permission[];
}

// ─── Roles ────────────────────────────────────────────────────────────────────

export interface RoleListItem {
  id: string;
  key: string;
  name: string;
  description: string | null;
  isSystem: boolean;
  createdAt: string;
  updatedAt: string;
  /** Set when the role is archived. Only present when listing with `includeArchived: true`. */
  deletedAt: string | null;
  userCount: number;
  permissionCount: number;
}

export interface RolePermission {
  key: string;
  scope: string | null;
}

export interface RoleDetail {
  id: string;
  key: string;
  name: string;
  description: string | null;
  isSystem: boolean;
  createdAt: string;
  updatedAt: string;
  /** Set when the role is archived. */
  deletedAt: string | null;
  userCount: number;
  permissions: RolePermission[];
}

export interface RoleListResponse {
  items: RoleListItem[];
  meta: PageMeta;
}

export interface RoleListParams {
  page?: number;
  pageSize?: number;
  search?: string;
  includeArchived?: boolean;
}

export interface CreateRoleInput {
  name: string;
  description?: string;
  permissions: string[];
}

export type UpdateRoleInput = Partial<CreateRoleInput>;

// ─── Users ────────────────────────────────────────────────────────────────────

export interface RbacUserRole {
  id: string;
  key: string;
  name: string;
  assignedAt: string;
}

export interface RbacUserListItem {
  id: string;
  email: string;
  status: string;
  defaultPortal: string;
  lastLoginAt: string | null;
  createdAt: string;
  employee: {
    id: string;
    displayName: string;
    employeeCode: string;
  } | null;
  roles: RbacUserRole[];
}

export interface RbacUserListResponse {
  items: RbacUserListItem[];
  meta: PageMeta;
}

export interface RbacUserListParams {
  page?: number;
  pageSize?: number;
  search?: string;
}

export interface AssignRoleInput {
  roleId: string;
}

// ─── Invites ──────────────────────────────────────────────────────────────────

export type InviteStatus = "pending" | "accepted" | "revoked" | "expired";

export interface InviteListItem {
  id: string;
  email: string;
  roleKey: RoleKey;
  status: InviteStatus;
  expiresAt: string;
  acceptedAt: string | null;
  revokedAt: string | null;
  createdAt: string;
  createdBy: string | null;
}

export interface InviteListResponse {
  items: InviteListItem[];
  meta: PageMeta;
}

export interface InviteListParams {
  page?: number;
  pageSize?: number;
  status?: InviteStatus;
}

export interface CreateInviteInput {
  email: string;
  roleKey: Exclude<RoleKey, "super_admin">;
}

/** POST /invites and POST /invites/:id/resend return the invite URL for dev convenience. */
export interface InviteIssuedResponse {
  id?: string;
  email: string;
  roleKey: RoleKey;
  status?: InviteStatus;
  expiresAt: string;
  inviteUrl: string;
}
