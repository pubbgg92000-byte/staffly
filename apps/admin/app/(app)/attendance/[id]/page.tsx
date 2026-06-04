"use client";

import { useParams } from "next/navigation";
import Link from "next/link";
import {
  Badge,
  Button,
  PageHeader,
  Separator,
  Skeleton,
  StatusBadge,
  type StatusTone,
  useAttendanceRecord,
  useEmployee,
} from "@staffly/ui";
import { ArrowLeft, CalendarX } from "lucide-react";

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

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

function fmtDateTime(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function fmtMinutes(mins: number | null): string {
  if (mins == null) return "—";
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

function Row({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}): React.ReactNode {
  return (
    <div className="flex justify-between gap-2">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right font-medium">{value ?? "—"}</span>
    </div>
  );
}

export default function AdminAttendanceDetailPage(): React.ReactNode {
  const { id } = useParams<{ id: string }>();
  const { data: record, isLoading, isError, refetch } = useAttendanceRecord(id);
  const { data: employee } = useEmployee(record?.employeeId);

  if (isLoading) {
    return (
      <div className="space-y-6">
        <PageHeader title="Loading…" />
        <Skeleton className="h-24 w-full rounded-lg" />
        <Skeleton className="h-48 w-full rounded-lg" />
      </div>
    );
  }

  if (isError || !record) {
    return (
      <div className="space-y-6">
        <PageHeader title="Record not found" />
        <div className="flex flex-col items-center gap-4 rounded-lg border bg-card p-12 text-center">
          <CalendarX className="h-12 w-12 text-muted-foreground" />
          <p className="text-muted-foreground">
            Could not load this attendance record.
          </p>
          <div className="flex gap-3">
            <Button variant="outline" onClick={() => refetch()}>
              Retry
            </Button>
            <Button variant="outline" asChild>
              <Link href="/attendance">Back to attendance</Link>
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Link
        href="/attendance"
        className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to attendance
      </Link>

      <div className="flex flex-col gap-4 rounded-lg border bg-card p-6 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-xl font-semibold">
              {employee?.displayName ?? "Employee"}
            </h1>
            <StatusBadge tone={STATUS_TONE[record.status] ?? "muted"}>
              {STATUS_LABEL[record.status] ?? record.status}
            </StatusBadge>
            {record.isLate ? <Badge variant="warning">Late</Badge> : null}
            {record.isRegularized ? (
              <Badge variant="info">Regularized</Badge>
            ) : null}
          </div>
          <p className="text-sm text-muted-foreground">
            {employee?.employeeCode ?? record.employeeId} ·{" "}
            {fmtDate(record.attendanceDate)}
          </p>
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <div className="rounded-lg border bg-card p-5">
          <h2 className="mb-4 text-sm font-semibold">Punch details</h2>
          <div className="space-y-3 text-sm">
            <Row label="Check-in" value={fmtDateTime(record.checkInAt)} />
            <Row label="Check-out" value={fmtDateTime(record.checkOutAt)} />
            <Row label="Worked" value={fmtMinutes(record.workedMinutes)} />
            <Separator />
            <Row label="Check-in IP" value={record.checkInIp ?? "—"} />
            <Row label="Check-out IP" value={record.checkOutIp ?? "—"} />
          </div>
        </div>

        <div className="rounded-lg border bg-card p-5">
          <h2 className="mb-4 text-sm font-semibold">Metadata</h2>
          <div className="space-y-3 text-sm">
            <Row
              label="Status"
              value={STATUS_LABEL[record.status] ?? record.status}
            />
            <Row label="Late" value={record.isLate ? "Yes" : "No"} />
            <Row
              label="Regularized"
              value={record.isRegularized ? "Yes" : "No"}
            />
            <Separator />
            <Row label="Created" value={fmtDateTime(record.createdAt)} />
            <Row label="Updated" value={fmtDateTime(record.updatedAt)} />
          </div>
        </div>
      </div>

      {record.notes ? (
        <div className="rounded-lg border bg-card p-5">
          <h2 className="mb-2 text-sm font-semibold">Notes</h2>
          <p className="whitespace-pre-wrap text-sm text-muted-foreground">
            {record.notes}
          </p>
        </div>
      ) : null}
    </div>
  );
}
