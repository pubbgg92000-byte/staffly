"use client";

import { useEffect } from "react";
import {
  PageHeader,
  WidgetCard,
  StatCard,
  Badge,
  toast,
  useAdminDashboard,
} from "@staffly/ui";
import { Users, Clock, Inbox, Megaphone } from "lucide-react";
import Link from "next/link";

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

const PRIORITY_VARIANT: Record<string, "default" | "secondary" | "destructive"> = {
  high: "destructive",
  normal: "default",
  low: "secondary",
};

export default function AdminDashboardPage(): React.ReactNode {
  const { data, isLoading, isError, refetch } = useAdminDashboard();

  useEffect(() => {
    if (isError) {
      toast.error("Failed to load dashboard", {
        action: { label: "Retry", onClick: refetch },
      });
    }
  }, [isError, refetch]);

  const metrics = data?.metrics;
  const pendingTotal =
    (metrics?.pendingApprovals.leave ?? 0) +
    (metrics?.pendingApprovals.regularization ?? 0);
  const isEmpty = !isLoading && metrics?.totalEmployees === 0;

  return (
    <div className="space-y-6">
      <PageHeader title="Dashboard" subtitle="Snapshot of your organization" />

      <section className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Total employees"
          value={metrics ? metrics.totalEmployees : "…"}
          icon={<Users className="h-4 w-4" />}
          href="/employees"
        />
        <StatCard
          label="Present today"
          value={metrics ? metrics.attendanceToday.present : "…"}
          icon={<Clock className="h-4 w-4" />}
          href="/attendance"
        />
        <StatCard
          label="Pending approvals"
          value={metrics ? pendingTotal : "…"}
          icon={<Inbox className="h-4 w-4" />}
          href="/leave/requests?status=pending"
        />
        <StatCard
          label="Published announcements"
          value={metrics ? metrics.publishedAnnouncements : "…"}
          icon={<Megaphone className="h-4 w-4" />}
          href="/announcements"
        />
      </section>

      <section className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <WidgetCard
          title="Upcoming holidays"
          loading={isLoading}
          error={isError ? { message: "Failed to load" } : null}
          onRetry={refetch}
          empty={
            !isLoading && data?.upcomingHolidays.length === 0
              ? "No upcoming holidays"
              : undefined
          }
        >
          <ul className="divide-y">
            {data?.upcomingHolidays.map((h) => (
              <li key={h.id} className="flex items-center justify-between py-2 text-sm">
                <div>
                  <p className="font-medium">{h.name}</p>
                  <p className="text-xs text-muted-foreground">{h.calendarName}</p>
                </div>
                <span className="text-xs text-muted-foreground tabular-nums">
                  {fmtDate(h.date)}
                </span>
              </li>
            ))}
          </ul>
        </WidgetCard>

        <WidgetCard
          title="Recent announcements"
          loading={isLoading}
          error={isError ? { message: "Failed to load" } : null}
          onRetry={refetch}
          empty={
            !isLoading && data?.recentActivity.announcementsPublished.length === 0
              ? "No announcements yet"
              : undefined
          }
        >
          <ul className="divide-y">
            {data?.recentActivity.announcementsPublished.map((a) => (
              <li key={a.id} className="flex items-start justify-between gap-2 py-2 text-sm">
                <p className="line-clamp-2 font-medium">{a.title}</p>
                <div className="flex shrink-0 flex-col items-end gap-1">
                  <Badge variant={PRIORITY_VARIANT[a.priority] ?? "default"} className="text-xs">
                    {a.priority}
                  </Badge>
                  {a.publishedAt ? (
                    <span className="text-xs text-muted-foreground">
                      {fmtDate(a.publishedAt)}
                    </span>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        </WidgetCard>

        <WidgetCard
          title="New hires"
          loading={isLoading}
          error={isError ? { message: "Failed to load" } : null}
          onRetry={refetch}
          empty={
            !isLoading && data?.recentActivity.newEmployees.length === 0
              ? isEmpty
                ? undefined
                : "No recent hires"
              : undefined
          }
        >
          {isEmpty && data?.recentActivity.newEmployees.length === 0 ? (
            <div className="flex flex-col gap-2 text-sm">
              <p className="text-muted-foreground">
                Your organization has no employees yet.
              </p>
              <Link href="/employees/new" className="font-medium text-primary hover:underline">
                Add your first employee →
              </Link>
            </div>
          ) : (
            <ul className="divide-y">
              {data?.recentActivity.newEmployees.map((e) => (
                <li key={e.id} className="flex items-center justify-between py-2 text-sm">
                  <div>
                    <p className="font-medium">{e.displayName}</p>
                    <p className="text-xs text-muted-foreground">{e.employeeCode}</p>
                  </div>
                  {e.joinedOn ? (
                    <span className="text-xs text-muted-foreground tabular-nums">
                      {fmtDate(e.joinedOn)}
                    </span>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </WidgetCard>
      </section>
    </div>
  );
}
