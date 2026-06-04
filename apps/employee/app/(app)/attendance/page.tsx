"use client";

import { useEffect } from "react";
import {
  Button,
  PageHeader,
  WidgetCard,
  StatusBadge,
  type StatusTone,
  EmptyState,
  toast,
  useCheckIn,
  useCheckOut,
  useMyAttendance,
  useEmployeeDashboard,
} from "@staffly/ui";
import { CalendarDays, CheckCircle2, Clock, XCircle } from "lucide-react";
import { RegularizationDialog } from "./_components/regularization-dialog";

function fmtTime(iso: string): string {
  return new Date(iso).toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function fmtDateLong(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
}

function fmtDateShort(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

function formatMinutes(mins: number | null | undefined): string {
  if (mins == null) return "—";
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

const STATUS_TONE: Record<string, StatusTone> = {
  present: "success",
  half_day: "warning",
  absent: "destructive",
  on_leave: "info",
  holiday: "muted",
  weekoff: "muted",
};

const STATUS_LABEL: Record<string, string> = {
  present: "Present",
  half_day: "Half day",
  absent: "Absent",
  on_leave: "On leave",
  holiday: "Holiday",
  weekoff: "Week off",
};

export default function EmployeeAttendancePage(): React.ReactNode {
  const me = useMyAttendance();
  const dash = useEmployeeDashboard();
  const checkIn = useCheckIn();
  const checkOut = useCheckOut();

  useEffect(() => {
    if (me.isError) {
      toast.error("Failed to load today's attendance", {
        action: { label: "Retry", onClick: me.refetch },
      });
    }
  }, [me.isError, me.refetch]);

  useEffect(() => {
    if (checkIn.isError) toast.error("Check-in failed. Please try again.");
  }, [checkIn.isError]);

  useEffect(() => {
    if (checkOut.isError) toast.error("Check-out failed. Please try again.");
  }, [checkOut.isError]);

  const record = me.data?.record ?? null;
  const checkedIn = !!record?.checkInAt;
  const checkedOut = !!record?.checkOutAt;
  const isMutating = checkIn.isPending || checkOut.isPending;

  const subtitle = me.data?.date
    ? fmtDateLong(me.data.date)
    : "Your attendance";

  const history = dash.data?.attendanceLast7Days ?? [];

  return (
    <div className="space-y-6">
      <PageHeader title="Attendance" subtitle={subtitle} />

      <WidgetCard title="Today" loading={me.isLoading}>
        <div className="flex flex-col items-start gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-1">
            {!record ? (
              <>
                <p className="text-sm text-muted-foreground">
                  You haven&apos;t checked in yet.
                </p>
                <p className="text-xs text-muted-foreground">
                  Tap check-in to start your day.
                </p>
              </>
            ) : checkedIn && !checkedOut ? (
              <>
                <p className="text-sm font-medium">
                  Checked in at {fmtTime(record.checkInAt!)}
                </p>
                <p className="text-xs text-muted-foreground">
                  {record.workedMinutes
                    ? `${formatMinutes(record.workedMinutes)} so far`
                    : "In progress"}
                </p>
              </>
            ) : (
              <>
                <p className="text-sm font-medium">
                  {fmtTime(record.checkInAt!)} – {fmtTime(record.checkOutAt!)}
                </p>
                <p className="text-xs text-muted-foreground">
                  {formatMinutes(record.workedMinutes)} worked today
                </p>
              </>
            )}
          </div>
          <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
            {!checkedOut ? (
              <Button
                onClick={() => {
                  if (!checkedIn) checkIn.mutate();
                  else checkOut.mutate();
                }}
                disabled={isMutating || me.isLoading}
                className="w-full sm:w-auto"
              >
                <Clock className="h-4 w-4" />
                {isMutating
                  ? "Please wait…"
                  : checkedIn
                    ? "Check out"
                    : "Check in"}
              </Button>
            ) : (
              <StatusBadge
                tone="success"
                icon={<CheckCircle2 className="h-3.5 w-3.5" />}
              >
                Day complete
              </StatusBadge>
            )}
            <RegularizationDialog />
          </div>
        </div>
      </WidgetCard>

      <WidgetCard
        title="Last 7 days"
        loading={dash.isLoading}
        error={dash.isError ? { message: "Failed to load history" } : null}
        onRetry={dash.refetch}
      >
        {!dash.isLoading && history.length === 0 ? (
          <EmptyState
            icon={<CalendarDays className="h-8 w-8" />}
            title="No history yet"
            description="Your attendance will appear here once you start checking in."
          />
        ) : (
          <>
            {/* Mobile: stacked cards */}
            <ul className="space-y-2 sm:hidden">
              {history.map((row) => (
                <li
                  key={row.date}
                  className="flex items-center justify-between rounded-md border bg-card px-3 py-2"
                >
                  <div>
                    <p className="text-sm font-medium">
                      {fmtDateShort(row.date)}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {formatMinutes(row.workedMinutes)}
                    </p>
                  </div>
                  <StatusBadge
                    tone={STATUS_TONE[row.status] ?? "muted"}
                    icon={
                      row.status === "absent" ? (
                        <XCircle className="h-3.5 w-3.5" />
                      ) : (
                        <CheckCircle2 className="h-3.5 w-3.5" />
                      )
                    }
                  >
                    {STATUS_LABEL[row.status] ?? row.status}
                  </StatusBadge>
                </li>
              ))}
            </ul>

            {/* Desktop: table */}
            <div className="hidden overflow-x-auto sm:block">
              <table className="w-full text-sm">
                <thead className="text-left text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2 font-medium">Date</th>
                    <th className="px-3 py-2 font-medium">Status</th>
                    <th className="px-3 py-2 font-medium text-right">Worked</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {history.map((row) => (
                    <tr key={row.date}>
                      <td className="px-3 py-2">{fmtDateShort(row.date)}</td>
                      <td className="px-3 py-2">
                        <StatusBadge
                          tone={STATUS_TONE[row.status] ?? "muted"}
                          icon={
                            row.status === "absent" ? (
                              <XCircle className="h-3.5 w-3.5" />
                            ) : (
                              <CheckCircle2 className="h-3.5 w-3.5" />
                            )
                          }
                        >
                          {STATUS_LABEL[row.status] ?? row.status}
                        </StatusBadge>
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {formatMinutes(row.workedMinutes)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </WidgetCard>
    </div>
  );
}
