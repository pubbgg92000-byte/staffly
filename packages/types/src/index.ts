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
export * from "./forms/employees";
export * from "./forms/attendance";
