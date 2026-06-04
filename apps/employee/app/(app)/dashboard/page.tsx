"use client";

import { useEffect } from "react";
import Link from "next/link";
import {
  PageHeader,
  WidgetCard,
  StatCard,
  Badge,
  Button,
  toast,
  useEmployeeDashboard,
  useCheckIn,
  useCheckOut,
} from "@staffly/ui";
import { CalendarDays, CheckCircle2, Clock, Pin } from "lucide-react";

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

function fmtTime(iso: string): string {
  return new Date(iso).toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatMinutes(mins: number): string {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

const PRIORITY_VARIANT: Record<
  string,
  "default" | "secondary" | "destructive"
> = {
  high: "destructive",
  normal: "default",
  low: "secondary",
};

export default function EmployeeDashboardPage(): React.ReactNode {
  const { data, isLoading, isError, refetch } = useEmployeeDashboard();
  const checkIn = useCheckIn();
  const checkOut = useCheckOut();

  useEffect(() => {
    if (isError) {
      toast.error("Failed to load dashboard", {
        action: { label: "Retry", onClick: refetch },
      });
    }
  }, [isError, refetch]);

  useEffect(() => {
    if (checkIn.isError) toast.error("Check-in failed. Please try again.");
  }, [checkIn.isError]);

  useEffect(() => {
    if (checkOut.isError) toast.error("Check-out failed. Please try again.");
  }, [checkOut.isError]);

  const att = data?.todayStatus.attendance;
  const checkedIn = !!att?.checkInAt;
  const checkedOut = !!att?.checkOutAt;
  const isMutating = checkIn.isPending || checkOut.isPending;

  const pendingTotal =
    (data?.pendingTasks.regularizations ?? 0) +
    (data?.pendingTasks.documentAcknowledgements ?? 0) +
    (data?.pendingTasks.announcementAcknowledgements ?? 0);

  const leaveAvailable =
    data?.leaveBalances.reduce((sum, b) => {
      return sum + (Number(b.allocated) - Number(b.used) - Number(b.pending));
    }, 0) ?? 0;

  const displayName = data?.me.displayName ?? "";
  const subtitle = displayName ? `Hi, ${displayName}` : "Your day at a glance";

  return (
    <div className="space-y-6">
      <PageHeader title="Welcome back" subtitle={subtitle} />

      <WidgetCard title="Today" loading={isLoading}>
        <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            {!att && !isLoading ? (
              <>
                <p className="text-sm text-muted-foreground">
                  You haven&apos;t checked in yet.
                </p>
                {data?.todayStatus.date ? (
                  <p className="text-xs text-muted-foreground">
                    {new Date(data.todayStatus.date).toLocaleDateString(
                      undefined,
                      {
                        weekday: "long",
                        month: "long",
                        day: "numeric",
                      },
                    )}
                  </p>
                ) : null}
              </>
            ) : checkedIn && !checkedOut && att ? (
              <>
                <p className="text-sm font-medium">
                  Checked in at {fmtTime(att.checkInAt!)}
                </p>
                <p className="text-xs text-muted-foreground">
                  {att.workedMinutes
                    ? formatMinutes(att.workedMinutes) + " so far"
                    : "In progress"}
                </p>
              </>
            ) : att && checkedIn && checkedOut ? (
              <>
                <p className="text-sm font-medium">
                  Checked out at {fmtTime(att.checkOutAt!)}
                </p>
                <p className="text-xs text-muted-foreground">
                  {att.workedMinutes
                    ? `${formatMinutes(att.workedMinutes)} worked`
                    : "Day complete"}
                </p>
              </>
            ) : null}
          </div>
          {!isLoading && !checkedOut ? (
            <Button
              onClick={() => {
                if (!checkedIn) checkIn.mutate();
                else checkOut.mutate();
              }}
              disabled={isMutating}
              className="w-full sm:w-auto"
            >
              <Clock className="h-4 w-4" />
              {isMutating
                ? "Please wait…"
                : checkedIn
                  ? "Check out"
                  : "Check in"}
            </Button>
          ) : null}
        </div>
      </WidgetCard>

      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <StatCard
          label="Pending tasks"
          value={data ? pendingTotal : "…"}
          icon={<CheckCircle2 className="h-4 w-4" />}
          href="/announcements"
        />
        <StatCard
          label="Leave available (days)"
          value={data ? leaveAvailable : "…"}
          icon={<CalendarDays className="h-4 w-4" />}
          href="/leave"
        />
      </section>

      <section className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <WidgetCard
          title="Announcements"
          loading={isLoading}
          error={isError ? { message: "Failed to load" } : null}
          onRetry={refetch}
          empty={
            !isLoading && data?.announcements.length === 0
              ? "No announcements"
              : undefined
          }
        >
          <ul className="divide-y">
            {data?.announcements.map((a) => (
              <li key={a.id}>
                <Link
                  href={`/announcements/${a.id}`}
                  className="flex items-start justify-between gap-2 py-2 text-sm hover:opacity-80"
                >
                  <div className="flex items-center gap-1.5 min-w-0">
                    {a.pinned ? (
                      <Pin className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                    ) : null}
                    <p className="line-clamp-2 font-medium">{a.title}</p>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    <Badge
                      variant={PRIORITY_VARIANT[a.priority] ?? "default"}
                      className="text-xs"
                    >
                      {a.priority}
                    </Badge>
                    {a.publishedAt ? (
                      <span className="text-xs text-muted-foreground">
                        {fmtDate(a.publishedAt)}
                      </span>
                    ) : null}
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </WidgetCard>

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
              <li
                key={h.id}
                className="flex items-center justify-between py-2 text-sm"
              >
                <div>
                  <p className="font-medium">{h.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {h.calendarName}
                  </p>
                </div>
                <span className="text-xs text-muted-foreground tabular-nums">
                  {fmtDate(h.date)}
                </span>
              </li>
            ))}
          </ul>
        </WidgetCard>
      </section>

      {data?.upcomingLeave ? (
        <WidgetCard title="Upcoming leave">
          <div className="flex items-center justify-between text-sm">
            <div>
              <p className="font-medium">{data.upcomingLeave.leaveType.name}</p>
              <p className="text-xs text-muted-foreground">
                {fmtDate(data.upcomingLeave.startDate)} –{" "}
                {fmtDate(data.upcomingLeave.endDate)}
              </p>
            </div>
            <Badge variant="secondary">
              {Number(data.upcomingLeave.units)} day
              {Number(data.upcomingLeave.units) !== 1 ? "s" : ""}
            </Badge>
          </div>
        </WidgetCard>
      ) : null}
    </div>
  );
}
