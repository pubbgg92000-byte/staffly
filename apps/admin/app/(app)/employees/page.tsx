"use client";

import { useCallback, useEffect, useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  Button,
  ConfirmDialog,
  Input,
  Select,
  Label,
  Skeleton,
  PageHeader,
  EmptyState,
  EmployeeStatusBadge,
  Badge,
  Avatar,
  AvatarFallback,
  extractErrorMessage,
  toast,
  useEmployees,
  useDepartments,
  useRestoreEmployee,
} from "@staffly/ui";
import { Plus, Search, Undo2, Users } from "lucide-react";

function initials(name: string): string {
  return name
    .split(" ")
    .map((w) => w[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

const STATUS_OPTIONS = [
  { value: "", label: "All statuses" },
  { value: "active", label: "Active" },
  { value: "invited", label: "Invited" },
  { value: "on_leave", label: "On Leave" },
  { value: "suspended", label: "Suspended" },
  // "offboarded" intentionally omitted from this select — those rows have
  // deletedAt set and are surfaced via the "Show archived" toggle instead.
];

const FRIENDLY: Record<string, string> = {
  "employee.not_found": "Employee no longer exists. Refresh the page.",
  "employee.conflict_code_or_email":
    "Another employee already has this code or email. Edit the existing one first.",
};

function friendly(err: unknown): string | undefined {
  const code =
    err && typeof err === "object" && "code" in err
      ? String((err as { code: unknown }).code)
      : undefined;
  return code ? (FRIENDLY[code] ?? undefined) : undefined;
}

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function EmployeesListContent(): React.ReactNode {
  const router = useRouter();
  const sp = useSearchParams();

  const searchParam = sp.get("search") ?? "";
  const statusParam = sp.get("status") ?? "";
  const deptParam = sp.get("departmentId") ?? "";
  const includeArchived = sp.get("includeArchived") === "1";
  const pageParam = Math.max(1, Number(sp.get("page")) || 1);

  const [search, setSearch] = useState(searchParam);
  const [restoreTarget, setRestoreTarget] = useState<{
    id: string;
    displayName: string;
    hasDisabledUser: boolean;
  } | null>(null);
  // Sub-checkbox state for the restore dialog. Defaults true when the linked
  // user is currently disabled; the dialog re-syncs on open.
  const [restoreReactivateUser, setRestoreReactivateUser] = useState(true);
  const restore = useRestoreEmployee();

  const { data, isLoading, isError, refetch } = useEmployees({
    page: pageParam,
    pageSize: 20,
    search: searchParam || undefined,
    status: (statusParam as never) || undefined,
    departmentId: deptParam || undefined,
    includeArchived: includeArchived || undefined,
  });

  const { data: depts } = useDepartments();

  const updateParams = useCallback(
    (updates: Record<string, string>) => {
      const next = new URLSearchParams(sp);
      for (const [k, v] of Object.entries(updates)) {
        if (v) next.set(k, v);
        else next.delete(k);
      }
      if (
        updates.search !== undefined ||
        updates.status !== undefined ||
        updates.departmentId !== undefined
      ) {
        next.delete("page");
      }
      router.push(`/employees?${next.toString()}`);
    },
    [router, sp],
  );

  // Debounce search
  useEffect(() => {
    const timer = setTimeout(() => {
      if (search !== searchParam) updateParams({ search });
    }, 300);
    return () => clearTimeout(timer);
  }, [search, searchParam, updateParams]);

  useEffect(() => {
    if (isError) {
      toast.error("Failed to load employees", {
        action: { label: "Retry", onClick: refetch },
      });
    }
  }, [isError, refetch]);

  const items = data?.items ?? [];
  const meta = data?.meta;
  const isEmpty = !isLoading && items.length === 0;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Employees"
        subtitle="Manage your workforce"
        actions={
          <Link href="/employees/new">
            <Button>
              <Plus className="h-4 w-4" />
              Add Employee
            </Button>
          </Link>
        }
      />

      {/* Filters */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <div className="flex-1">
          <Label htmlFor="search" className="sr-only">
            Search
          </Label>
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              id="search"
              placeholder="Search name, code, or email…"
              className="pl-8"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>
        <div className="w-full sm:w-44">
          <Label htmlFor="status" className="sr-only">
            Status
          </Label>
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
        <div className="w-full sm:w-44">
          <Label htmlFor="department" className="sr-only">
            Department
          </Label>
          <Select
            id="department"
            value={deptParam}
            onChange={(e) => updateParams({ departmentId: e.target.value })}
          >
            <option value="">All departments</option>
            {(depts?.items ?? []).map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </Select>
        </div>
        <label className="flex items-center gap-2 text-sm whitespace-nowrap sm:pb-2.5">
          <input
            type="checkbox"
            className="h-4 w-4 rounded border-input"
            checked={includeArchived}
            onChange={(e) =>
              updateParams({ includeArchived: e.target.checked ? "1" : "" })
            }
          />
          Show archived
        </label>
      </div>

      {/* Table */}
      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-sm">
          <thead className="bg-muted/50">
            <tr className="text-left text-muted-foreground">
              <th className="px-4 py-3 font-medium">Employee</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="hidden px-4 py-3 font-medium md:table-cell">
                Department
              </th>
              <th className="hidden px-4 py-3 font-medium lg:table-cell">
                Employment
              </th>
              <th className="hidden px-4 py-3 font-medium lg:table-cell">
                Joined
              </th>
              <th className="px-4 py-3 font-medium" />
            </tr>
          </thead>
          <tbody className="divide-y">
            {isLoading
              ? Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i}>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <Skeleton className="h-8 w-8 rounded-full" />
                        <div className="space-y-1">
                          <Skeleton className="h-4 w-32" />
                          <Skeleton className="h-3 w-24" />
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <Skeleton className="h-5 w-16 rounded-full" />
                    </td>
                    <td className="hidden px-4 py-3 md:table-cell">
                      <Skeleton className="h-4 w-20" />
                    </td>
                    <td className="hidden px-4 py-3 lg:table-cell">
                      <Skeleton className="h-4 w-16" />
                    </td>
                    <td className="hidden px-4 py-3 lg:table-cell">
                      <Skeleton className="h-4 w-20" />
                    </td>
                    <td className="px-4 py-3">
                      <Skeleton className="ml-auto h-4 w-16" />
                    </td>
                  </tr>
                ))
              : items.map((emp) => {
                  const isArchived = Boolean(emp.deletedAt);
                  return (
                    <tr
                      key={emp.id}
                      className="hover:bg-accent/40 cursor-pointer"
                      onClick={() => router.push(`/employees/${emp.id}`)}
                    >
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <Avatar className="h-8 w-8">
                            <AvatarFallback className="text-xs">
                              {initials(emp.displayName)}
                            </AvatarFallback>
                          </Avatar>
                          <div className="min-w-0">
                            <p className="truncate font-medium">
                              {emp.displayName}
                            </p>
                            <p className="truncate text-xs text-muted-foreground">
                              {emp.employeeCode} · {emp.workEmail}
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <EmployeeStatusBadge status={emp.status} />
                      </td>
                      <td className="hidden px-4 py-3 md:table-cell">
                        {emp.department?.name ?? "—"}
                      </td>
                      <td className="hidden px-4 py-3 lg:table-cell">
                        <Badge variant="outline">
                          {emp.employmentType.replace("_", " ")}
                        </Badge>
                      </td>
                      <td className="hidden px-4 py-3 lg:table-cell text-muted-foreground">
                        {fmtDate(emp.joinedOn)}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {isArchived ? (
                          <button
                            type="button"
                            className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
                            onClick={(e) => {
                              e.stopPropagation();
                              setRestoreTarget({
                                id: emp.id,
                                displayName: emp.displayName,
                                // The list payload doesn't carry user status;
                                // server-side cascade handles it. We default
                                // the sub-checkbox to on for offboarded rows.
                                hasDisabledUser: true,
                              });
                              setRestoreReactivateUser(true);
                            }}
                          >
                            <Undo2 className="h-3.5 w-3.5" /> Restore
                          </button>
                        ) : (
                          <Link
                            href={`/employees/${emp.id}`}
                            className="text-xs font-medium text-primary hover:underline"
                            onClick={(e) => e.stopPropagation()}
                          >
                            View
                          </Link>
                        )}
                      </td>
                    </tr>
                  );
                })}
          </tbody>
        </table>
      </div>

      {/* Empty state */}
      {isEmpty ? (
        <EmptyState
          icon={<Users className="h-8 w-8" />}
          title="No employees found"
          description={
            searchParam || statusParam || deptParam || includeArchived
              ? "Try adjusting your search or filters."
              : "Add your first employee to get started."
          }
          action={
            !searchParam && !statusParam && !deptParam && !includeArchived ? (
              <Link href="/employees/new">
                <Button>
                  <Plus className="h-4 w-4" />
                  Add Employee
                </Button>
              </Link>
            ) : undefined
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

      <ConfirmDialog
        open={!!restoreTarget}
        onOpenChange={(o) => !o && setRestoreTarget(null)}
        title={
          restoreTarget
            ? `Restore ${restoreTarget.displayName}?`
            : "Restore employee?"
        }
        description={
          <>
            Marks the employee as active again. Their work history is preserved.
            <label className="mt-3 flex items-start gap-2 text-sm">
              <input
                type="checkbox"
                className="mt-0.5 h-4 w-4 rounded border-input"
                checked={restoreReactivateUser}
                onChange={(e) => setRestoreReactivateUser(e.target.checked)}
              />
              <span>
                Also reactivate the linked user account so they can sign in
                again.
              </span>
            </label>
          </>
        }
        confirmLabel="Restore"
        pendingLabel="Restoring…"
        onConfirm={async () => {
          if (!restoreTarget) return;
          try {
            await restore.mutateAsync({
              id: restoreTarget.id,
              reactivateUser: restoreReactivateUser,
            });
            toast.success(`${restoreTarget.displayName} restored`);
            setRestoreTarget(null);
          } catch (err) {
            toast.error(
              friendly(err) ??
                extractErrorMessage(err, "Failed to restore employee"),
            );
            setRestoreTarget(null);
          }
        }}
      />
    </div>
  );
}

export default function EmployeesListPage(): React.ReactNode {
  return (
    <Suspense>
      <EmployeesListContent />
    </Suspense>
  );
}
