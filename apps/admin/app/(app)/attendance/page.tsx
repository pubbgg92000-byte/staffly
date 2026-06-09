"use client";

import { useCallback, useEffect, useMemo, Suspense } from "react";
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
  useAttendanceList,
  useEmployees,
  usePermissionCheck,
} from "@staffly/ui";
import type { AttendanceStatus } from "@staffly/types";
import { CalendarDays, ClipboardCheck, Clock, ShieldOff } from "lucide-react";

const STATUS_OPTIONS: { value: string; label: string }[] = [
  { value: "", label: "All statuses" },
  { value: "present", label: "Present" },
  { value: "half_day", label: "Half day" },
  { value: "absent", label: "Absent" },
  { value: "on_leave", label: "On leave" },
  { value: "holiday", label: "Holiday" },
  { value: "weekoff", label: "Week off" },
];

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
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function fmtTime(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleTimeString(undefined, {
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

function AttendanceListContent(): React.ReactNode {
  const router = useRouter();
  const sp = useSearchParams();

  const employeeId = sp.get("employeeId") ?? "";
  const from = sp.get("from") ?? "";
  const to = sp.get("to") ?? "";
  const statusParam = sp.get("status") ?? "";
  const pageParam = Math.max(1, Number(sp.get("page")) || 1);

  const { has, isLoading: permsLoading } = usePermissionCheck();
  const canRead = has("attendance.read");

  const { data, isLoading, isError, refetch } = useAttendanceList({
    page: pageParam,
    pageSize: 20,
    employeeId: employeeId || undefined,
    from: from || undefined,
    to: to || undefined,
    status: (statusParam as AttendanceStatus) || undefined,
  });

  const { data: emps } = useEmployees({ pageSize: 100 });
  const empLookup = useMemo(() => {
    const m = new Map<string, string>();
    (emps?.items ?? []).forEach((e) => {
      m.set(e.id, `${e.displayName} · ${e.employeeCode}`);
    });
    return m;
  }, [emps]);

  const updateParams = useCallback(
    (updates: Record<string, string>) => {
      const next = new URLSearchParams(sp);
      for (const [k, v] of Object.entries(updates)) {
        if (v) next.set(k, v);
        else next.delete(k);
      }
      if (
        updates.employeeId !== undefined ||
        updates.from !== undefined ||
        updates.to !== undefined ||
        updates.status !== undefined
      ) {
        next.delete("page");
      }
      router.push(`/attendance?${next.toString()}`);
    },
    [router, sp],
  );

  useEffect(() => {
    if (isError && canRead) {
      toast.error("Failed to load attendance records", {
        action: { label: "Retry", onClick: refetch },
      });
    }
  }, [isError, refetch, canRead]);

  const items = data?.items ?? [];
  const meta = data?.meta;
  const isEmpty = !isLoading && items.length === 0;
  const hasFilters = !!(employeeId || from || to || statusParam);

  // Forbidden state — page renders but data is gated by permission.
  if (!permsLoading && !canRead) {
    return (
      <div className="space-y-6">
        <PageHeader title="Attendance" subtitle="Daily attendance records" />
        <EmptyState
          icon={<ShieldOff className="h-8 w-8" />}
          title="Forbidden"
          description="You need the attendance.read permission to view attendance."
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Attendance"
        subtitle="Daily records"
        actions={
          <Link href="/attendance/regularizations">
            <Button variant="outline">
              <ClipboardCheck className="h-4 w-4" />
              Regularizations
            </Button>
          </Link>
        }
      />

      {/* Filters */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="space-y-1.5">
          <Label htmlFor="employee">Employee</Label>
          <Select
            id="employee"
            value={employeeId}
            onChange={(e) => updateParams({ employeeId: e.target.value })}
          >
            <option value="">All employees</option>
            {(emps?.items ?? []).map((e) => (
              <option key={e.id} value={e.id}>
                {e.displayName} · {e.employeeCode}
              </option>
            ))}
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="from">From</Label>
          <Input
            id="from"
            type="date"
            value={from}
            onChange={(e) => updateParams({ from: e.target.value })}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="to">To</Label>
          <Input
            id="to"
            type="date"
            value={to}
            onChange={(e) => updateParams({ to: e.target.value })}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="status">Status</Label>
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
              <th className="px-4 py-3 font-medium">Employee</th>
              <th className="px-4 py-3 font-medium">Date</th>
              <th className="hidden px-4 py-3 font-medium md:table-cell">
                Check-in
              </th>
              <th className="hidden px-4 py-3 font-medium md:table-cell">
                Check-out
              </th>
              <th className="hidden px-4 py-3 font-medium lg:table-cell">
                Worked
              </th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="hidden px-4 py-3 font-medium lg:table-cell">
                Late
              </th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {isLoading
              ? Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i}>
                    <td className="px-4 py-3">
                      <Skeleton className="h-4 w-40" />
                    </td>
                    <td className="px-4 py-3">
                      <Skeleton className="h-4 w-24" />
                    </td>
                    <td className="hidden px-4 py-3 md:table-cell">
                      <Skeleton className="h-4 w-16" />
                    </td>
                    <td className="hidden px-4 py-3 md:table-cell">
                      <Skeleton className="h-4 w-16" />
                    </td>
                    <td className="hidden px-4 py-3 lg:table-cell">
                      <Skeleton className="h-4 w-16" />
                    </td>
                    <td className="px-4 py-3">
                      <Skeleton className="h-5 w-16 rounded-full" />
                    </td>
                    <td className="hidden px-4 py-3 lg:table-cell">
                      <Skeleton className="h-4 w-10" />
                    </td>
                  </tr>
                ))
              : items.map((row) => (
                  <tr
                    key={row.id}
                    className="cursor-pointer hover:bg-accent/40"
                    onClick={() => router.push(`/attendance/${row.id}`)}
                  >
                    <td className="px-4 py-3 font-medium">
                      {empLookup.get(row.employeeId) ?? row.employeeId}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground tabular-nums">
                      {fmtDate(row.attendanceDate)}
                    </td>
                    <td className="hidden px-4 py-3 tabular-nums md:table-cell">
                      {fmtTime(row.checkInAt)}
                    </td>
                    <td className="hidden px-4 py-3 tabular-nums md:table-cell">
                      {fmtTime(row.checkOutAt)}
                    </td>
                    <td className="hidden px-4 py-3 tabular-nums lg:table-cell">
                      {fmtMinutes(row.workedMinutes)}
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge tone={STATUS_TONE[row.status] ?? "muted"}>
                        {STATUS_LABEL[row.status] ?? row.status}
                      </StatusBadge>
                    </td>
                    <td className="hidden px-4 py-3 lg:table-cell">
                      {row.isLate ? (
                        <Badge variant="warning">Late</Badge>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                  </tr>
                ))}
          </tbody>
        </table>
      </div>

      {/* Empty state */}
      {isEmpty ? (
        <EmptyState
          icon={
            hasFilters ? (
              <CalendarDays className="h-8 w-8" />
            ) : (
              <Clock className="h-8 w-8" />
            )
          }
          title="No records"
          description={
            hasFilters
              ? "Try adjusting your filters."
              : "Records will appear as employees check in and out."
          }
        />
      ) : null}

      {/* Pagination */}
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

export default function AdminAttendancePage(): React.ReactNode {
  return (
    <Suspense>
      <AttendanceListContent />
    </Suspense>
  );
}
