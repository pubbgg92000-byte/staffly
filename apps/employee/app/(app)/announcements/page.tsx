"use client";

import { useCallback, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Badge,
  Button,
  EmptyState,
  PageHeader,
  Select,
  Skeleton,
  StatusBadge,
  type StatusTone,
  toast,
  useMyAnnouncements,
} from "@staffly/ui";
import type {
  AnnouncementFeedItem,
  AnnouncementPriority,
} from "@staffly/types";
import { Megaphone, Pin } from "lucide-react";

const PRIORITY_TONE: Record<AnnouncementPriority, StatusTone> = {
  low: "muted",
  normal: "info",
  high: "destructive",
};

function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, "").slice(0, 120);
}

function fmtDate(iso: string | null): string {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function AnnouncementCard({
  ann,
  onClick,
}: {
  ann: AnnouncementFeedItem;
  onClick: () => void;
}): React.ReactNode {
  const acknowledged = ann.acknowledgements.length > 0;

  return (
    <article
      className="cursor-pointer rounded-lg border bg-card p-4 hover:bg-accent/40 transition-colors"
      onClick={onClick}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-1.5 min-w-0">
          {ann.pinned ? (
            <Pin className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          ) : null}
          <h2 className="font-semibold truncate">{ann.title}</h2>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <StatusBadge tone={PRIORITY_TONE[ann.priority]}>
            {ann.priority}
          </StatusBadge>
          {ann.requiresAcknowledgment ? (
            acknowledged ? (
              <Badge variant="success" className="text-xs">
                Acknowledged
              </Badge>
            ) : (
              <Badge variant="warning" className="text-xs">
                Action required
              </Badge>
            )
          ) : null}
        </div>
      </div>
      {ann.publishedAt ? (
        <p className="mt-1 text-xs text-muted-foreground">
          {fmtDate(ann.publishedAt)}
        </p>
      ) : null}
      <p className="mt-2 text-sm text-muted-foreground line-clamp-2">
        {stripHtml(ann.bodyHtml)}
      </p>
    </article>
  );
}

function AnnouncementsFeedContent(): React.ReactNode {
  const router = useRouter();
  const sp = useSearchParams();

  const filterParam = sp.get("filter") ?? "";
  const pageParam = Math.max(1, Number(sp.get("page")) || 1);

  const { data, isLoading, isError, refetch } = useMyAnnouncements({
    page: pageParam,
    pageSize: 20,
    unacknowledgedOnly: filterParam === "unread",
  });

  const updateParams = useCallback(
    (updates: Record<string, string>) => {
      const next = new URLSearchParams(sp);
      for (const [k, v] of Object.entries(updates)) {
        if (v) next.set(k, v);
        else next.delete(k);
      }
      if (updates.filter !== undefined) next.delete("page");
      router.push(`/announcements?${next.toString()}`);
    },
    [router, sp],
  );

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
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <PageHeader title="Announcements" />
        <div className="w-36">
          <Select
            id="filter"
            value={filterParam}
            onChange={(e) => updateParams({ filter: e.target.value })}
            aria-label="Filter announcements"
          >
            <option value="">All</option>
            <option value="unread">Unread / Pending</option>
          </Select>
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="rounded-lg border bg-card p-4 space-y-2">
              <Skeleton className="h-5 w-3/4" />
              <Skeleton className="h-3 w-20" />
              <Skeleton className="h-4 w-full" />
            </div>
          ))}
        </div>
      ) : isEmpty ? (
        <EmptyState
          icon={<Megaphone className="h-8 w-8" />}
          title={
            filterParam === "unread" ? "Nothing pending" : "No announcements"
          }
          description={
            filterParam === "unread"
              ? "You're all caught up."
              : "Announcements targeting you will appear here."
          }
          action={
            filterParam ? (
              <Button
                variant="outline"
                onClick={() => updateParams({ filter: "" })}
              >
                Show all
              </Button>
            ) : undefined
          }
        />
      ) : (
        <>
          <div className="space-y-3">
            {items.map((ann) => (
              <AnnouncementCard
                key={ann.id}
                ann={ann}
                onClick={() => router.push(`/announcements/${ann.id}`)}
              />
            ))}
          </div>

          {meta && meta.totalPages > 1 ? (
            <div className="flex items-center justify-between text-sm text-muted-foreground">
              <p>
                Showing {(meta.page - 1) * meta.pageSize + 1}–
                {Math.min(meta.page * meta.pageSize, meta.total)} of{" "}
                {meta.total}
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
        </>
      )}
    </div>
  );
}

export default function EmployeeAnnouncementsPage(): React.ReactNode {
  return (
    <Suspense>
      <AnnouncementsFeedContent />
    </Suspense>
  );
}
