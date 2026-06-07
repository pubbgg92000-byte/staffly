"use client";

import * as React from "react";
import Link from "next/link";
import { Bell } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "../components/ui/dropdown-menu";
import { Skeleton } from "../components/ui/skeleton";
import { useSession } from "../api/session";
import {
  useMarkAllRead,
  useMarkNotificationRead,
  useNotifications,
  useUnreadCount,
} from "../api/notifications";
import { renderNotification } from "../lib/notification-templates";
import { cn } from "../lib/cn";

const PREVIEW_PAGE_SIZE = 6;

/**
 * Topbar notification bell, shared by both portals (lives in the shared
 * Topbar). Polls the unread count every 30s (foreground only) for the badge,
 * and lazy-loads a short preview list only when opened. Renders nothing when
 * there is no active session.
 */
export function NotificationBell(): React.ReactNode {
  const { data: session } = useSession();
  const [open, setOpen] = React.useState(false);
  const enabled = Boolean(session);

  const { data: count } = useUnreadCount({ enabled });
  const { data, isLoading } = useNotifications(
    { pageSize: PREVIEW_PAGE_SIZE },
    { enabled: enabled && open },
  );
  const markAll = useMarkAllRead();
  const markOne = useMarkNotificationRead();

  if (!session) return null;

  const unread = count?.count ?? 0;
  const items = data?.items ?? [];

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={
            unread > 0 ? `Notifications, ${unread} unread` : "Notifications"
          }
          className="relative rounded-md p-2 outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring"
        >
          <Bell className="h-5 w-5" />
          {unread > 0 ? (
            <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-semibold leading-none text-primary-foreground">
              {unread > 9 ? "9+" : unread}
            </span>
          ) : null}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80 p-0">
        <div className="flex items-center justify-between px-3 py-2">
          <DropdownMenuLabel className="p-0 text-sm">
            Notifications
          </DropdownMenuLabel>
          <button
            type="button"
            disabled={unread === 0 || markAll.isPending}
            onClick={() => markAll.mutate()}
            className="text-xs font-medium text-primary hover:underline disabled:pointer-events-none disabled:text-muted-foreground"
          >
            Mark all read
          </button>
        </div>
        <DropdownMenuSeparator className="my-0" />

        <div className="max-h-80 overflow-y-auto py-1">
          {isLoading ? (
            <div className="space-y-3 px-3 py-2">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="space-y-1.5">
                  <Skeleton className="h-4 w-40" />
                  <Skeleton className="h-3 w-52" />
                </div>
              ))}
            </div>
          ) : items.length === 0 ? (
            <p className="px-3 py-6 text-center text-sm text-muted-foreground">
              You&rsquo;re all caught up.
            </p>
          ) : (
            items.map((n) => {
              const d = renderNotification(n);
              return (
                <DropdownMenuItem
                  key={n.id}
                  asChild
                  className={cn(
                    "flex-col items-start gap-0.5",
                    !n.readAt && "bg-accent/40",
                  )}
                >
                  <Link
                    href={n.linkTo ?? "/notifications"}
                    onClick={() => {
                      if (!n.readAt) markOne.mutate(n.id);
                      setOpen(false);
                    }}
                  >
                    <span className="line-clamp-1 text-sm font-medium">
                      {d.title}
                    </span>
                    <span className="line-clamp-1 text-xs text-muted-foreground">
                      {d.description}
                    </span>
                    <span className="text-[11px] text-muted-foreground">
                      {new Date(n.createdAt).toLocaleString()}
                    </span>
                  </Link>
                </DropdownMenuItem>
              );
            })
          )}
        </div>

        <DropdownMenuSeparator className="my-0" />
        <DropdownMenuItem asChild className="justify-center">
          <Link href="/notifications" onClick={() => setOpen(false)}>
            <span className="text-sm font-medium">View all notifications</span>
          </Link>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
