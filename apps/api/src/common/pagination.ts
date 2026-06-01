import { z } from "zod";

export const PaginationQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().trim().min(1).max(120).optional(),
  sortBy: z.string().trim().min(1).max(40).optional(),
  sortDir: z.enum(["asc", "desc"]).default("asc"),
});
export type PaginationQueryT = z.infer<typeof PaginationQuery>;

export interface Page<T> {
  items: T[];
  meta: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
}

export function pageOf<T>(
  items: T[],
  total: number,
  q: { page: number; pageSize: number },
): Page<T> {
  return {
    items,
    meta: {
      page: q.page,
      pageSize: q.pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / q.pageSize)),
    },
  };
}

export function skipTake(q: { page: number; pageSize: number }): {
  skip: number;
  take: number;
} {
  return { skip: (q.page - 1) * q.pageSize, take: q.pageSize };
}
