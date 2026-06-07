"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Bell, BellOff } from "lucide-react";
import { PageHeader } from "./page-header";
import { EmptyState } from "./empty-state";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { Skeleton } from "./ui/skeleton";
import { toast } from "../providers/toast-provider";
import {
  useMarkAllRead,
  useMarkNotificationRead,
  useNotifications,
  useUnreadCount,
} from "../api/notifications";
import {
  priorityLabel,
  renderNotification,
} from "../lib/notification-templates";
import type { NotificationPriority } from "@staffly/types";
import { cn } from "../lib/cn";

const PAGE_SIZE = 20;

function priorityVariant(
  priority: NotificationPriority,
): "destructive" | "secondary" | "muted" {
  if (priority === "high") return "destructive";
  if (priority === "normal") return "secondary";
  return "muted";
}

/**
 * Full notification inbox, shared by both portals at `/notifications`. Offset
 * pagination + an All/Unread filter, modeled on the audit-log screen. Auth-
 * only — the API scopes every read to the current user. Must be rendered
 * inside a <Suspense> boundary (uses useSearchParams).
 */
export function NotificationsInbox(): React.ReactNode {
  const router = useRouter();
  const sp = useSearchParams();

  const pageParam = Math.max(1, Number(sp.get("page")) || 1);
  const unreadOnly = sp.get("filter") === "unread";

  const { data, isLoading, isError, refetch } = useNotifications({
    page: pageParam,
    pageSize: PAGE_SIZE,
    unreadOnly: unreadOnly || undefined,
    sortDir: "desc",
  });
  const { data: count } = useUnreadCount();
  const markOne = useMarkNotificationRead();
  const markAll = useMarkAllRead();

  React.useEffect(() => {
    if (isError) {
      toast.error("Failed to load notifications", {
        id: "notifications-load-error",
        action: { label: "Retry", onClick: refetch },
      });
    }
  }, [isError, refetch]);

  const setParams = (updates: Record<string, string>): void => {
    const next = new URLSearchParams(sp);
    for (const [k, v] of Object.entries(updates)) {
      if (v) next.set(k, v);
      else next.delete(k);
    }
    router.push(`/notifications?${next.toString()}`);
  };

  const items = data?.items ?? [];
  const meta = data?.meta;
  const unread = count?.count ?? 0;
  const isEmpty = !isLoading && items.length === 0;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Notifications"
        subtitle="Your alerts and updates."
        actions={
          <Button
            variant="outline"
            size="sm"
            disabled={unread === 0 || markAll.isPending}
            onClick={() => markAll.mutate()}
          >
            Mark all read
          </Button>
        }
      />

      {/* Filter */}
      <div className="flex gap-2">
        <Button
          variant={unreadOnly ? "outline" : "default"}
          size="sm"
          onClick={() => setParams({ filter: "", page: "" })}
        >
          All
        </Button>
        <Button
          variant={unreadOnly ? "default" : "outline"}
          size="sm"
          onClick={() => setParams({ filter: "unread", page: "" })}
        >
          Unread{unread > 0 ? ` (${unread})` : ""}
        </Button>
      </div>

      {/* List */}
      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="rounded-lg border p-4">
              <Skeleton className="mb-2 h-4 w-48" />
              <Skeleton className="h-3 w-64" />
            </div>
          ))}
        </div>
      ) : isEmpty ? (
        <EmptyState
          icon={
            unreadOnly ? (
              <BellOff className="h-8 w-8" />
            ) : (
              <Bell className="h-8 w-8" />
            )
          }
          title={unreadOnly ? "No unread notifications" : "No notifications"}
          description={
            unreadOnly
              ? "You're all caught up."
              : "Notifications about announcements and more will show up here."
          }
        />
      ) : (
        <ul className="space-y-2">
          {items.map((n) => {
            const d = renderNotification(n);
            return (
              <li key={n.id}>
                <Link
                  href={n.linkTo ?? "/notifications"}
                  onClick={() => {
                    if (!n.readAt) markOne.mutate(n.id);
                  }}
                  className={cn(
                    "flex items-start gap-3 rounded-lg border p-4 transition-colors hover:bg-accent/40",
                    !n.readAt && "border-primary/30 bg-accent/30",
                  )}
                >
                  <span
                    className={cn(
                      "mt-1.5 h-2 w-2 shrink-0 rounded-full",
                      n.readAt ? "bg-transparent" : "bg-primary",
                    )}
                    aria-hidden
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate text-sm font-medium">
                        {d.title}
                      </span>
                      <Badge variant={priorityVariant(n.priority)}>
                        {priorityLabel(n.priority)}
                      </Badge>
                    </div>
                    <p className="mt-0.5 truncate text-sm text-muted-foreground">
                      {d.description}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {new Date(n.createdAt).toLocaleString()}
                    </p>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}

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
              onClick={() => setParams({ page: String(meta.page - 1) })}
            >
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={meta.page >= meta.totalPages}
              onClick={() => setParams({ page: String(meta.page + 1) })}
            >
              Next
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
