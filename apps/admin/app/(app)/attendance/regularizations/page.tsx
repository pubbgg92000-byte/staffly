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
  useRegularizations,
} from "@staffly/ui";
import type {
  AttendanceRegularization,
  RegularizationStatus,
} from "@staffly/types";
import { ArrowLeft, ClipboardCheck } from "lucide-react";
import { DecideDialog } from "./_components/decide-dialog";

const STATUS_TONE: Record<RegularizationStatus, StatusTone> = {
  pending: "warning",
  approved: "success",
  rejected: "destructive",
  cancelled: "muted",
};

const STATUS_LABEL: Record<RegularizationStatus, string> = {
  pending: "Pending",
  approved: "Approved",
  rejected: "Rejected",
  cancelled: "Cancelled",
};

const STATUS_OPTIONS: { value: string; label: string }[] = [
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

function fmtTime(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function RegularizationsContent(): React.ReactNode {
  const router = useRouter();
  const sp = useSearchParams();

  const statusParam = sp.get("status") ?? "pending";
  const pageParam = Math.max(1, Number(sp.get("page")) || 1);

  const { data, isLoading, isError, refetch } = useRegularizations({
    page: pageParam,
    pageSize: 20,
    status: (statusParam as RegularizationStatus) || undefined,
  });

  const { data: emps } = useEmployees({ pageSize: 100 });
  const empLookup = useMemo(() => {
    const m = new Map<string, string>();
    (emps?.items ?? []).forEach((e) => {
      m.set(e.id, `${e.displayName} · ${e.employeeCode}`);
    });
    return m;
  }, [emps]);

  const [selected, setSelected] = useState<AttendanceRegularization | null>(
    null,
  );
  const [dialogOpen, setDialogOpen] = useState(false);

  const updateParams = useCallback(
    (updates: Record<string, string>) => {
      const next = new URLSearchParams(sp);
      for (const [k, v] of Object.entries(updates)) {
        if (v) next.set(k, v);
        else next.delete(k);
      }
      if (updates.status !== undefined) next.delete("page");
      router.push(`/attendance/regularizations?${next.toString()}`);
    },
    [router, sp],
  );

  useEffect(() => {
    if (isError) {
      toast.error("Failed to load regularizations", {
        action: { label: "Retry", onClick: refetch },
      });
    }
  }, [isError, refetch]);

  const items = data?.items ?? [];
  const meta = data?.meta;
  const isEmpty = !isLoading && items.length === 0;

  const openDialog = (reg: AttendanceRegularization): void => {
    setSelected(reg);
    setDialogOpen(true);
  };

  return (
    <div className="space-y-6">
      <Link
        href="/attendance"
        className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to attendance
      </Link>

      <PageHeader
        title="Regularizations"
        subtitle="Review requests to correct missing punches"
      />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <div className="w-full sm:w-48">
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

      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-sm">
          <thead className="bg-muted/50">
            <tr className="text-left text-muted-foreground">
              <th className="px-4 py-3 font-medium">Employee</th>
              <th className="px-4 py-3 font-medium">Date</th>
              <th className="hidden px-4 py-3 font-medium md:table-cell">
                Requested
              </th>
              <th className="hidden px-4 py-3 font-medium lg:table-cell">
                Reason
              </th>
              <th className="px-4 py-3 font-medium">Status</th>
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
                      <Skeleton className="h-4 w-20" />
                    </td>
                    <td className="hidden px-4 py-3 md:table-cell">
                      <Skeleton className="h-4 w-24" />
                    </td>
                    <td className="hidden px-4 py-3 lg:table-cell">
                      <Skeleton className="h-4 w-48" />
                    </td>
                    <td className="px-4 py-3">
                      <Skeleton className="h-5 w-16 rounded-full" />
                    </td>
                    <td className="px-4 py-3">
                      <Skeleton className="ml-auto h-7 w-16" />
                    </td>
                  </tr>
                ))
              : items.map((reg) => (
                  <tr key={reg.id} className="hover:bg-accent/40">
                    <td className="px-4 py-3 font-medium">
                      {empLookup.get(reg.employeeId) ?? reg.employeeId}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground tabular-nums">
                      {fmtDate(reg.attendanceDate)}
                    </td>
                    <td className="hidden px-4 py-3 tabular-nums md:table-cell">
                      {fmtTime(reg.requestedCheckInAt)} –{" "}
                      {fmtTime(reg.requestedCheckOutAt)}
                    </td>
                    <td className="hidden px-4 py-3 lg:table-cell">
                      <p className="line-clamp-1 max-w-md text-muted-foreground">
                        {reg.reason}
                      </p>
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge tone={STATUS_TONE[reg.status]}>
                        {STATUS_LABEL[reg.status]}
                      </StatusBadge>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => openDialog(reg)}
                      >
                        Review
                      </Button>
                    </td>
                  </tr>
                ))}
          </tbody>
        </table>
      </div>

      {isEmpty ? (
        <EmptyState
          icon={<ClipboardCheck className="h-8 w-8" />}
          title="Nothing to review"
          description={
            statusParam === "pending"
              ? "There are no pending regularization requests."
              : "No requests match this filter."
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

      <DecideDialog
        reg={selected}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        employeeLabel={
          selected ? empLookup.get(selected.employeeId) : undefined
        }
      />
    </div>
  );
}

export default function AdminRegularizationsPage(): React.ReactNode {
  return (
    <Suspense>
      <RegularizationsContent />
    </Suspense>
  );
}
