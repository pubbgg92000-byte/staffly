/**
 * @staffly/types — shared Zod schemas and TypeScript types.
 *
 * Boundary library: every request/response shape that crosses the wire is
 * defined here and consumed by both the API (validation pipe) and the
 * clients (TanStack Query types). Re-exported from this barrel for
 * apps that prefer one import.
 */

export const STAFFLY_TYPES_VERSION = "0.0.0";

export * from "./forms/auth";
export * from "./api/auth";
export * from "./api/dashboard";
export * from "./api/employees";
export * from "./api/attendance";
export * from "./api/leave";
export * from "./api/holidays";
export * from "./api/announcements";
export * from "./api/documents";
export * from "./api/org-structure";
export * from "./api/rbac";
export * from "./api/audit";
export * from "./forms/employees";
export * from "./forms/attendance";
export * from "./forms/leave";
export * from "./forms/holidays";
export * from "./forms/announcements";
export * from "./forms/documents";
export * from "./forms/org-structure";
export * from "./forms/rbac";
