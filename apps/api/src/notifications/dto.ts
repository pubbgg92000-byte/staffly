import { z } from "zod";
import { PaginationQuery } from "../common/pagination";

/**
 * Self-notifications list query. Reuses PaginationQuery's `page`/`pageSize`
 * (1-based, max 100), defaults the sort to newest-first, and adds an
 * unread-only filter. No search/sort-by — notifications are a simple feed.
 */
export const MyNotificationsQuery = PaginationQuery.pick({
  page: true,
  pageSize: true,
}).extend({
  sortDir: z.enum(["asc", "desc"]).default("desc"),
  // Match the codebase boolean-query idiom (announcements/documents): a bare
  // z.coerce.boolean() would treat the string "false" as true.
  unreadOnly: z
    .union([z.literal("true"), z.literal("false")])
    .transform((v) => v === "true")
    .optional(),
});
export type MyNotificationsQueryT = z.infer<typeof MyNotificationsQuery>;
