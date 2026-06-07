import { z } from "zod";

export const AuditLogListQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  action: z.string().trim().min(1).max(80).optional(),
  resourceType: z.string().trim().min(1).max(40).optional(),
  actorUserId: z.string().uuid().optional(),
  resourceId: z.string().uuid().optional(),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  search: z.string().trim().min(1).max(120).optional(),
  sortDir: z.enum(["asc", "desc"]).default("desc"),
});
export type AuditLogListQueryT = z.infer<typeof AuditLogListQuery>;
