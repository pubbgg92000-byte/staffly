"use client";

import { useCallback, useEffect, useMemo, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  Button,
  EmptyState,
  Label,
  PageHeader,
  Select,
  Skeleton,
  toast,
  useEmployees,
  useLeaveBalancesList,
  useLeaveTypes,
} from "@staffly/ui";
import { ArrowLeft, Scale } from "lucide-react";

const currentYear = new Date().getFullYear();

function fmtNum(n: string | number): string {
  const v = Number(n);
  if (Number.isInteger(v)) return String(v);
  return v.toFixed(1);
}

function LeaveBalancesContent(): React.ReactNode {
  const router = useRouter();
  const sp = useSearchParams();

  const employeeId = sp.get("employeeId") ?? "";
  const leaveTypeId = sp.get("leaveTypeId") ?? "";
  const cycleYear = Number(sp.get("cycleYear") || currentYear);
  const pageParam = Math.max(1, Number(sp.get("page")) || 1);

  const { data, isLoading, isError, refetch } = useLeaveBalancesList({
    page: pageParam,
    pageSize: 20,
    employeeId: employeeId || undefined,
    leaveTypeId: leaveTypeId || undefined,
    cycleYear,
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

  const updateParams = useCallback(
    (updates: Record<string, string>) => {
      const next = new URLSearchParams(sp);
      for (const [k, v] of Object.entries(updates)) {
        if (v) next.set(k, v);
        else next.delete(k);
      }
      if (
        updates.employeeId !== undefined ||
        updates.leaveTypeId !== undefined ||
        updates.cycleYear !== undefined
      ) {
        next.delete("page");
      }
      router.push(`/leave/balances?${next.toString()}`);
    },
    [router, sp],
  );

  useEffect(() => {
    if (isError) {
      toast.error("Failed to load balances", {
        action: { label: "Retry", onClick: refetch },
      });
    }
  }, [isError, refetch]);

  const items = data?.items ?? [];
  const meta = data?.meta;
  const isEmpty = !isLoading && items.length === 0;

  return (
    <div className="space-y-6">
      <Link
        href="/leave"
        className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to leave requests
      </Link>

      <PageHeader title="Leave balances" />

      {/* Filters */}
      <div className="grid gap-3 sm:grid-cols-3">
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
          <Label htmlFor="cycleYear">Cycle</Label>
          <Select
            id="cycleYear"
            value={String(cycleYear)}
            onChange={(e) => updateParams({ cycleYear: e.target.value })}
          >
            {[currentYear, currentYear - 1, currentYear + 1].map((y) => (
              <option key={y} value={String(y)}>
                {y}
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
              <th className="px-4 py-3 font-medium">Type</th>
              <th className="hidden px-4 py-3 font-medium sm:table-cell">
                Cycle
              </th>
              <th className="px-4 py-3 font-medium text-right">Allocated</th>
              <th className="px-4 py-3 font-medium text-right">Used</th>
              <th className="hidden px-4 py-3 font-medium text-right md:table-cell">
                Pending
              </th>
              <th className="hidden px-4 py-3 font-medium text-right lg:table-cell">
                CFwd
              </th>
              <th className="hidden px-4 py-3 font-medium text-right lg:table-cell">
                Adj
              </th>
              <th className="px-4 py-3 font-medium text-right">Available</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {isLoading
              ? Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i}>
                    <td className="px-4 py-3">
                      <Skeleton className="h-4 w-36" />
                    </td>
                    <td className="px-4 py-3">
                      <Skeleton className="h-4 w-16" />
                    </td>
                    <td className="hidden px-4 py-3 sm:table-cell">
                      <Skeleton className="h-4 w-10" />
                    </td>
                    {[1, 2, 3, 4, 5, 6].map((j) => (
                      <td key={j} className="px-4 py-3">
                        <Skeleton className="ml-auto h-4 w-10" />
                      </td>
                    ))}
                  </tr>
                ))
              : items.map((b) => (
                  <tr key={b.id}>
                    <td className="px-4 py-3 font-medium">
                      {empLookup.get(b.employeeId) ?? b.employeeId}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5">
                        <span
                          className="inline-block h-2.5 w-2.5 rounded-full"
                          style={{
                            backgroundColor: b.leaveType.color ?? "#94A3B8",
                          }}
                        />
                        <span>{b.leaveType.name}</span>
                      </div>
                    </td>
                    <td className="hidden px-4 py-3 tabular-nums sm:table-cell">
                      {b.cycleYear}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      {fmtNum(b.allocated)}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      {fmtNum(b.used)}
                    </td>
                    <td className="hidden px-4 py-3 text-right tabular-nums md:table-cell">
                      {fmtNum(b.pending)}
                    </td>
                    <td className="hidden px-4 py-3 text-right tabular-nums lg:table-cell">
                      {fmtNum(b.carryForward)}
                    </td>
                    <td className="hidden px-4 py-3 text-right tabular-nums lg:table-cell">
                      {fmtNum(b.adjusted)}
                    </td>
                    <td className="px-4 py-3 text-right font-bold tabular-nums text-primary">
                      {fmtNum(b.available)}
                    </td>
                  </tr>
                ))}
          </tbody>
        </table>
      </div>

      {/* Empty state */}
      {isEmpty ? (
        <EmptyState
          icon={<Scale className="h-8 w-8" />}
          title="No balances"
          description="No leave balances match this filter."
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

export default function AdminLeaveBalancesPage(): React.ReactNode {
  return (
    <Suspense>
      <LeaveBalancesContent />
    </Suspense>
  );
}
