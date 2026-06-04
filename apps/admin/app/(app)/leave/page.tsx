"use client";

import { useCallback, useEffect, useMemo, useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  Button,
  EmptyState,
  Label,
  PageHeader,
  Select,
  Skeleton,
  StatusBadge,
  type StatusTone,
  toast,
  useEmployees,
  useLeaveRequests,
  useLeaveTypes,
} from "@staffly/ui";
import type { LeaveRequest, LeaveRequestStatus } from "@staffly/types";
import { CalendarDays, Scale } from "lucide-react";
import { DecideLeaveDialog } from "./_components/decide-leave-dialog";

const STATUS_TONE: Record<string, StatusTone> = {
  pending: "warning",
  approved: "success",
  rejected: "destructive",
  cancelled: "muted",
};

const STATUS_LABEL: Record<string, string> = {
  pending: "Pending",
  approved: "Approved",
  rejected: "Rejected",
  cancelled: "Cancelled",
};

const STATUS_OPTIONS = [
  { value: "pending", label: "Pending" },
  { value: "approved", label: "Approved" },
  { value: "rejected", label: "Rejected" },
  { value: "cancelled", label: "Cancelled" },
  { value: "", label: "All" },
];

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function fmtDatetime(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

function LeaveRequestsContent(): React.ReactNode {
  const router = useRouter();
  const sp = useSearchParams();

  const employeeId = sp.get("employeeId") ?? "";
  const statusParam = sp.get("status") ?? "pending";
  const leaveTypeId = sp.get("leaveTypeId") ?? "";
  const from = sp.get("from") ?? "";
  const to = sp.get("to") ?? "";
  const pageParam = Math.max(1, Number(sp.get("page")) || 1);

  const { data, isLoading, isError, refetch } = useLeaveRequests({
    page: pageParam,
    pageSize: 20,
    status: (statusParam as LeaveRequestStatus) || undefined,
    employeeId: employeeId || undefined,
    leaveTypeId: leaveTypeId || undefined,
    from: from || undefined,
    to: to || undefined,
  });

  const { data: emps } = useEmployees({ pageSize: 200 });
  const { data: types } = useLeaveTypes();

  const empLookup = useMemo(() => {
    const m = new Map<string, string>();
    (emps?.items ?? []).forEach((e) => {
      m.set(e.id, `${e.displayName} · ${e.employeeCode}`);
    });
    return m;
  }, [emps]);

  const [selected, setSelected] = useState<LeaveRequest | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);

  const updateParams = useCallback(
    (updates: Record<string, string>) => {
      const next = new URLSearchParams(sp);
      for (const [k, v] of Object.entries(updates)) {
        if (v) next.set(k, v);
        else next.delete(k);
      }
      if (
        updates.employeeId !== undefined ||
        updates.status !== undefined ||
        updates.leaveTypeId !== undefined ||
        updates.from !== undefined ||
        updates.to !== undefined
      ) {
        next.delete("page");
      }
      router.push(`/leave?${next.toString()}`);
    },
    [router, sp],
  );

  useEffect(() => {
    if (isError) {
      toast.error("Failed to load leave requests", {
        action: { label: "Retry", onClick: refetch },
      });
    }
  }, [isError, refetch]);

  const items = data?.items ?? [];
  const meta = data?.meta;
  const isEmpty = !isLoading && items.length === 0;

  const openDialog = (req: LeaveRequest): void => {
    setSelected(req);
    setDialogOpen(true);
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Leave requests"
        subtitle="Approve, reject, and review"
        actions={
          <Link href="/leave/balances">
            <Button variant="outline">
              <Scale className="h-4 w-4" />
              Balances
            </Button>
          </Link>
        }
      />

      {/* Filters */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
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
        <div className="space-y-1.5">
          <Label htmlFor="leaveType">Leave type</Label>
          <Select
            id="leaveType"
            value={leaveTypeId}
            onChange={(e) => updateParams({ leaveTypeId: e.target.value })}
          >
            <option value="">All types</option>
            {(types?.items ?? []).map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="from">From</Label>
          <input
            id="from"
            type="date"
            className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm"
            value={from}
            onChange={(e) => updateParams({ from: e.target.value })}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="to">To</Label>
          <input
            id="to"
            type="date"
            className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm"
            value={to}
            onChange={(e) => updateParams({ to: e.target.value })}
          />
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-sm">
          <thead className="bg-muted/50">
            <tr className="text-left text-muted-foreground">
              <th className="px-4 py-3 font-medium">Employee</th>
              <th className="px-4 py-3 font-medium">Type</th>
              <th className="hidden px-4 py-3 font-medium md:table-cell">
                Dates
              </th>
              <th className="hidden px-4 py-3 font-medium lg:table-cell">
                Units
              </th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="hidden px-4 py-3 font-medium lg:table-cell">
                Submitted
              </th>
              <th className="px-4 py-3 font-medium" />
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
                      <Skeleton className="h-4 w-16" />
                    </td>
                    <td className="hidden px-4 py-3 md:table-cell">
                      <Skeleton className="h-4 w-32" />
                    </td>
                    <td className="hidden px-4 py-3 lg:table-cell">
                      <Skeleton className="h-4 w-10" />
                    </td>
                    <td className="px-4 py-3">
                      <Skeleton className="h-5 w-16 rounded-full" />
                    </td>
                    <td className="hidden px-4 py-3 lg:table-cell">
                      <Skeleton className="h-4 w-20" />
                    </td>
                    <td className="px-4 py-3">
                      <Skeleton className="ml-auto h-7 w-16" />
                    </td>
                  </tr>
                ))
              : items.map((req) => (
                  <tr key={req.id} className="hover:bg-accent/40">
                    <td className="px-4 py-3 font-medium">
                      {empLookup.get(req.employeeId) ?? req.employeeId}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5">
                        <span
                          className="inline-block h-2.5 w-2.5 rounded-full"
                          style={{
                            backgroundColor: req.leaveType.color ?? "#94A3B8",
                          }}
                        />
                        <span>{req.leaveType.name}</span>
                      </div>
                    </td>
                    <td className="hidden px-4 py-3 tabular-nums md:table-cell">
                      {fmtDate(req.startDate)}
                      {req.startDate !== req.endDate
                        ? ` – ${fmtDate(req.endDate)}`
                        : ""}
                    </td>
                    <td className="hidden px-4 py-3 tabular-nums lg:table-cell">
                      {String(req.units)}d
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge tone={STATUS_TONE[req.status] ?? "muted"}>
                        {STATUS_LABEL[req.status] ?? req.status}
                      </StatusBadge>
                    </td>
                    <td className="hidden px-4 py-3 tabular-nums text-muted-foreground lg:table-cell">
                      {fmtDatetime(req.createdAt)}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => openDialog(req)}
                      >
                        Review
                      </Button>
                    </td>
                  </tr>
                ))}
          </tbody>
        </table>
      </div>

      {/* Empty state */}
      {isEmpty ? (
        <EmptyState
          icon={<CalendarDays className="h-8 w-8" />}
          title="No requests"
          description={
            statusParam === "pending"
              ? "There are no pending leave requests."
              : "No requests match this filter."
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

      <DecideLeaveDialog
        request={selected}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        employeeLabel={
          selected ? empLookup.get(selected.employeeId) : undefined
        }
      />
    </div>
  );
}

export default function AdminLeaveRequestsPage(): React.ReactNode {
  return (
    <Suspense>
      <LeaveRequestsContent />
    </Suspense>
  );
}
