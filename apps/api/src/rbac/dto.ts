import { z } from "zod";

// ─── Roles ────────────────────────────────────────────────────────────────────

export const CreateRoleBody = z.object({
  name: z.string().trim().min(1).max(80),
  description: z.string().trim().max(500).optional(),
  permissions: z.array(z.string().trim().min(1).max(80)).default([]),
});
export const UpdateRoleBody = CreateRoleBody.partial();
export type CreateRoleBodyT = z.infer<typeof CreateRoleBody>;
export type UpdateRoleBodyT = z.infer<typeof UpdateRoleBody>;

export const RoleListQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().trim().min(1).max(120).optional(),
});
export type RoleListQueryT = z.infer<typeof RoleListQuery>;

// ─── Users ────────────────────────────────────────────────────────────────────

export const UserListQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().trim().min(1).max(120).optional(),
});
export type UserListQueryT = z.infer<typeof UserListQuery>;

export const AssignRoleBody = z.object({
  /** The role ID to assign. Replaces all existing roles for this user. */
  roleId: z.string().uuid(),
});
export type AssignRoleBodyT = z.infer<typeof AssignRoleBody>;

// ─── Invites ──────────────────────────────────────────────────────────────────

const VALID_ROLE_KEYS = [
  "super_admin",
  "hr_admin",
  "manager",
  "employee",
] as const;

export const CreateInviteBody = z.object({
  email: z.string().trim().toLowerCase().email().max(254),
  roleKey: z.enum(VALID_ROLE_KEYS),
});
export type CreateInviteBodyT = z.infer<typeof CreateInviteBody>;

export const InviteListQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  status: z.enum(["pending", "accepted", "revoked", "expired"]).optional(),
});
export type InviteListQueryT = z.infer<typeof InviteListQuery>;
