"use client";

import { useCallback, useEffect, useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Button,
  Card,
  CardContent,
  EmptyState,
  PageHeader,
  Select,
  StatusBadge,
  type StatusTone,
  Skeleton,
  toast,
  useMyLeaveBalances,
  useMyLeaveRequests,
} from "@staffly/ui";
import type { LeaveRequest, LeaveRequestStatus } from "@staffly/types";
import { CalendarDays } from "lucide-react";
import { ApplyLeaveDialog } from "./_components/apply-leave-dialog";
import { LeaveDetailDialog } from "./_components/leave-detail-dialog";

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
  { value: "", label: "All" },
  { value: "pending", label: "Pending" },
  { value: "approved", label: "Approved" },
  { value: "rejected", label: "Rejected" },
  { value: "cancelled", label: "Cancelled" },
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

function LeavePageContent(): React.ReactNode {
  const router = useRouter();
  const sp = useSearchParams();

  const statusParam = (sp.get("status") ?? "") as string;
  const pageParam = Math.max(1, Number(sp.get("page")) || 1);

  const balances = useMyLeaveBalances();
  const requests = useMyLeaveRequests({
    page: pageParam,
    pageSize: 20,
    status: (statusParam as LeaveRequestStatus) || undefined,
  });

  const [detailReq, setDetailReq] = useState<LeaveRequest | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);

  useEffect(() => {
    if (balances.isError) {
      toast.error("Failed to load leave balances", {
        action: { label: "Retry", onClick: balances.refetch },
      });
    }
  }, [balances.isError, balances.refetch]);

  useEffect(() => {
    if (requests.isError) {
      toast.error("Failed to load requests", {
        action: { label: "Retry", onClick: requests.refetch },
      });
    }
  }, [requests.isError, requests.refetch]);

  const updateParams = useCallback(
    (updates: Record<string, string>) => {
      const next = new URLSearchParams(sp);
      for (const [k, v] of Object.entries(updates)) {
        if (v) next.set(k, v);
        else next.delete(k);
      }
      if (updates.status !== undefined) next.delete("page");
      router.push(`/leave?${next.toString()}`);
    },
    [router, sp],
  );

  const items = balances.data?.items ?? [];
  const reqItems = requests.data?.items ?? [];
  const meta = requests.data?.meta;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Leave"
        subtitle="Your balances and requests"
        actions={
          items.length > 0 ? <ApplyLeaveDialog balances={items} /> : undefined
        }
      />

      {/* Balances grid */}
      <section>
        <h2 className="mb-3 text-sm font-semibold">Balances</h2>
        {balances.isLoading ? (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {[1, 2, 3].map((i) => (
              <Card key={i}>
                <CardContent className="p-5">
                  <Skeleton className="mb-2 h-4 w-24" />
                  <Skeleton className="h-8 w-16" />
                </CardContent>
              </Card>
            ))}
          </div>
        ) : items.length === 0 ? (
          <EmptyState
            icon={<CalendarDays className="h-8 w-8" />}
            title="No leave balances"
            description="Your organization hasn't set up leave types yet."
          />
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {items.map((b) => (
              <Card key={b.id}>
                <CardContent className="space-y-2 p-5">
                  <div className="flex items-center gap-2">
                    <span
                      className="inline-block h-3 w-3 rounded-full"
                      style={{
                        backgroundColor: b.leaveType.color ?? "#94A3B8",
                      }}
                    />
                    <h3 className="text-sm font-medium">{b.leaveType.name}</h3>
                  </div>
                  <p className="text-2xl font-bold tabular-nums">
                    {b.available}d
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {String(b.allocated)}d allocated · {String(b.used)}d used ·{" "}
                    {String(b.pending)}d pending
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </section>

      {/* My requests */}
      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold">My requests</h2>
          <Select
            id="status"
            value={statusParam}
            onChange={(e) => updateParams({ status: e.target.value })}
            aria-label="Filter by status"
          >
            {STATUS_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </Select>
        </div>

        {requests.isLoading ? (
          <div className="space-y-2">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-12 w-full rounded-lg" />
            ))}
          </div>
        ) : reqItems.length === 0 ? (
          <EmptyState
            icon={<CalendarDays className="h-8 w-8" />}
            title="No requests"
            description={
              statusParam
                ? "No requests match this filter."
                : "Apply for leave to get started."
            }
          />
        ) : (
          <>
            {/* Mobile: stacked cards */}
            <ul className="space-y-2 sm:hidden">
              {reqItems.map((req) => (
                <li
                  key={req.id}
                  className="cursor-pointer rounded-md border bg-card px-3 py-2"
                  onClick={() => {
                    setDetailReq(req);
                    setDetailOpen(true);
                  }}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                      <span
                        className="inline-block h-2.5 w-2.5 rounded-full"
                        style={{
                          backgroundColor: req.leaveType.color ?? "#94A3B8",
                        }}
                      />
                      <p className="text-sm font-medium">
                        {req.leaveType.name}
                      </p>
                    </div>
                    <StatusBadge tone={STATUS_TONE[req.status] ?? "muted"}>
                      {STATUS_LABEL[req.status] ?? req.status}
                    </StatusBadge>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {fmtDate(req.startDate)}
                    {req.startDate !== req.endDate
                      ? ` – ${fmtDate(req.endDate)}`
                      : ""}{" "}
                    · {String(req.units)}d · {fmtDatetime(req.createdAt)}
                  </p>
                </li>
              ))}
            </ul>

            {/* Desktop: table */}
            <div className="hidden overflow-x-auto rounded-lg border sm:block">
              <table className="w-full text-sm">
                <thead className="bg-muted/50">
                  <tr className="text-left text-muted-foreground">
                    <th className="px-4 py-3 font-medium">Type</th>
                    <th className="px-4 py-3 font-medium">Dates</th>
                    <th className="hidden px-4 py-3 font-medium md:table-cell">
                      Units
                    </th>
                    <th className="px-4 py-3 font-medium">Status</th>
                    <th className="hidden px-4 py-3 font-medium lg:table-cell">
                      Submitted
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {reqItems.map((req) => (
                    <tr
                      key={req.id}
                      className="cursor-pointer hover:bg-accent/40"
                      onClick={() => {
                        setDetailReq(req);
                        setDetailOpen(true);
                      }}
                    >
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1.5">
                          <span
                            className="inline-block h-2.5 w-2.5 rounded-full"
                            style={{
                              backgroundColor: req.leaveType.color ?? "#94A3B8",
                            }}
                          />
                          <span className="font-medium">
                            {req.leaveType.name}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-3 tabular-nums">
                        {fmtDate(req.startDate)}
                        {req.startDate !== req.endDate
                          ? ` – ${fmtDate(req.endDate)}`
                          : ""}
                        {req.halfDayStart || req.halfDayEnd ? (
                          <span className="ml-1 text-xs text-muted-foreground">
                            (
                            {[req.halfDayStart && "½S", req.halfDayEnd && "½E"]
                              .filter(Boolean)
                              .join(",")}
                            )
                          </span>
                        ) : null}
                      </td>
                      <td className="hidden px-4 py-3 tabular-nums md:table-cell">
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
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}

        {meta && meta.totalPages > 1 ? (
          <div className="mt-4 flex items-center justify-between text-sm text-muted-foreground">
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
      </section>

      <LeaveDetailDialog
        request={detailReq}
        open={detailOpen}
        onOpenChange={setDetailOpen}
      />
    </div>
  );
}

export default function EmployeeLeavePage(): React.ReactNode {
  return (
    <Suspense>
      <LeavePageContent />
    </Suspense>
  );
}
