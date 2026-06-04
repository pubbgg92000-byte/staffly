"use client";

import { useCallback, useEffect, useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  Badge,
  Button,
  EmptyState,
  Input,
  Label,
  PageHeader,
  Select,
  Skeleton,
  StatusBadge,
  type StatusTone,
  toast,
  useAnnouncements,
} from "@staffly/ui";
import type { AnnouncementStatus, AnnouncementPriority } from "@staffly/types";
import { Megaphone, Pin, Plus, Search } from "lucide-react";

const STATUS_TONE: Record<AnnouncementStatus, StatusTone> = {
  draft: "muted",
  scheduled: "warning",
  published: "success",
  archived: "destructive",
};

const PRIORITY_TONE: Record<AnnouncementPriority, StatusTone> = {
  low: "muted",
  normal: "info",
  high: "destructive",
};

const STATUS_OPTIONS = [
  { value: "", label: "All statuses" },
  { value: "draft", label: "Draft" },
  { value: "scheduled", label: "Scheduled" },
  { value: "published", label: "Published" },
  { value: "archived", label: "Archived" },
];

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function AnnouncementsContent(): React.ReactNode {
  const router = useRouter();
  const sp = useSearchParams();

  const statusParam = sp.get("status") ?? "";
  const searchParam = sp.get("search") ?? "";
  const pageParam = Math.max(1, Number(sp.get("page")) || 1);

  const [search, setSearch] = useState(searchParam);

  const { data, isLoading, isError, refetch } = useAnnouncements({
    page: pageParam,
    pageSize: 20,
    status: (statusParam as AnnouncementStatus) || undefined,
    search: searchParam || undefined,
    pinnedFirst: true,
  });

  const updateParams = useCallback(
    (updates: Record<string, string>) => {
      const next = new URLSearchParams(sp);
      for (const [k, v] of Object.entries(updates)) {
        if (v) next.set(k, v);
        else next.delete(k);
      }
      if (updates.search !== undefined || updates.status !== undefined)
        next.delete("page");
      router.push(`/announcements?${next.toString()}`);
    },
    [router, sp],
  );

  useEffect(() => {
    const t = setTimeout(() => {
      if (search !== searchParam) updateParams({ search });
    }, 300);
    return () => clearTimeout(t);
  }, [search, searchParam, updateParams]);

  useEffect(() => {
    if (isError)
      toast.error("Failed to load announcements", {
        action: { label: "Retry", onClick: refetch },
      });
  }, [isError, refetch]);

  const items = data?.items ?? [];
  const meta = data?.meta;
  const isEmpty = !isLoading && items.length === 0;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Announcements"
        subtitle="Broadcast messages to your workforce"
        actions={
          <Link href="/announcements/new">
            <Button>
              <Plus className="h-4 w-4" />
              New announcement
            </Button>
          </Link>
        }
      />

      {/* Filters */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <div className="flex-1">
          <Label htmlFor="search" className="sr-only">
            Search
          </Label>
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              id="search"
              placeholder="Search by title…"
              className="pl-8"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>
        <div className="w-full sm:w-44">
          <Label htmlFor="status" className="sr-only">
            Status
          </Label>
          <Select
            id="status"
            value={statusParam}
            onChange={(e) => updateParams({ status: e.target.value })}
          >
            {STATUS_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </Select>
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-sm">
          <thead className="bg-muted/50">
            <tr className="text-left text-muted-foreground">
              <th className="px-4 py-3 font-medium">Title</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="hidden px-4 py-3 font-medium md:table-cell">
                Priority
              </th>
              <th className="hidden px-4 py-3 font-medium lg:table-cell">
                Published
              </th>
              <th className="hidden px-4 py-3 font-medium lg:table-cell">
                Acks
              </th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {isLoading
              ? Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i}>
                    <td className="px-4 py-3">
                      <Skeleton className="h-4 w-56" />
                    </td>
                    <td className="px-4 py-3">
                      <Skeleton className="h-5 w-20 rounded-full" />
                    </td>
                    <td className="hidden px-4 py-3 md:table-cell">
                      <Skeleton className="h-5 w-14 rounded-full" />
                    </td>
                    <td className="hidden px-4 py-3 lg:table-cell">
                      <Skeleton className="h-4 w-24" />
                    </td>
                    <td className="hidden px-4 py-3 lg:table-cell">
                      <Skeleton className="h-4 w-8" />
                    </td>
                  </tr>
                ))
              : items.map((ann) => (
                  <tr
                    key={ann.id}
                    className="cursor-pointer hover:bg-accent/40"
                    onClick={() => router.push(`/announcements/${ann.id}`)}
                  >
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        {ann.pinned ? (
                          <Pin className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                        ) : null}
                        <span className="font-medium">{ann.title}</span>
                        {ann.requiresAcknowledgment ? (
                          <Badge variant="outline" className="text-xs">
                            Ack
                          </Badge>
                        ) : null}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge tone={STATUS_TONE[ann.status]}>
                        {ann.status}
                      </StatusBadge>
                    </td>
                    <td className="hidden px-4 py-3 md:table-cell">
                      <StatusBadge tone={PRIORITY_TONE[ann.priority]}>
                        {ann.priority}
                      </StatusBadge>
                    </td>
                    <td className="hidden px-4 py-3 tabular-nums text-muted-foreground lg:table-cell">
                      {ann.publishedAt
                        ? fmtDate(ann.publishedAt)
                        : ann.scheduledFor
                          ? `Scheduled ${fmtDate(ann.scheduledFor)}`
                          : "—"}
                    </td>
                    <td className="hidden px-4 py-3 tabular-nums lg:table-cell">
                      {ann.requiresAcknowledgment
                        ? ann._count.acknowledgements
                        : "—"}
                    </td>
                  </tr>
                ))}
          </tbody>
        </table>
      </div>

      {isEmpty ? (
        <EmptyState
          icon={<Megaphone className="h-8 w-8" />}
          title="No announcements"
          description={
            searchParam || statusParam
              ? "Try adjusting your filters."
              : "Create your first announcement to broadcast to employees."
          }
          action={
            !searchParam && !statusParam ? (
              <Link href="/announcements/new">
                <Button>
                  <Plus className="h-4 w-4" />
                  New announcement
                </Button>
              </Link>
            ) : undefined
          }
        />
      ) : null}

      {meta && meta.totalPages > 1 ? (
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <p>
            Showing {(meta.page - 1) * meta.pageSize + 1}–
            {Math.min(meta.page * meta.pageSize, meta.total)} of {meta.total}
          </p>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={meta.page <= 1}
              onClick={() => updateParams({ page: String(meta.page - 1) })}
            >
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={meta.page >= meta.totalPages}
              onClick={() => updateParams({ page: String(meta.page + 1) })}
            >
              Next
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export default function AdminAnnouncementsPage(): React.ReactNode {
  return (
    <Suspense>
      <AnnouncementsContent />
    </Suspense>
  );
}
