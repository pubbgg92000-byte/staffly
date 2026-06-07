"use client";

import { useCallback, useEffect, useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Badge,
  Button,
  EmptyState,
  Input,
  Label,
  PageHeader,
  Select,
  Skeleton,
  toast,
  useAuditLogs,
  usePermissionCheck,
  useRbacUsers,
} from "@staffly/ui";
import type { AuditLogListItem } from "@staffly/types";
import { ScrollText, Search, ShieldOff } from "lucide-react";
import { AuditDetailDialog } from "./_components/audit-detail-dialog";
import { ACTION_OPTIONS, RESOURCE_TYPE_OPTIONS } from "./_components/options";

/** A YYYY-MM-DD date input → an inclusive ISO datetime bound. */
function dayStart(date: string): string {
  return new Date(`${date}T00:00:00.000Z`).toISOString();
}
function dayEnd(date: string): string {
  return new Date(`${date}T23:59:59.999Z`).toISOString();
}

function AuditLogContent(): React.ReactNode {
  const router = useRouter();
  const sp = useSearchParams();
  const { has, isLoading: permsLoading } = usePermissionCheck();

  const pageParam = Math.max(1, Number(sp.get("page")) || 1);
  const actionParam = sp.get("action") ?? "";
  const resourceTypeParam = sp.get("resourceType") ?? "";
  const actorParam = sp.get("actorUserId") ?? "";
  const fromParam = sp.get("from") ?? "";
  const toParam = sp.get("to") ?? "";
  const searchParam = sp.get("search") ?? "";

  const [search, setSearch] = useState(searchParam);
  const [selected, setSelected] = useState<AuditLogListItem | null>(null);

  const canRead = has("audit.read");

  const { data: usersData } = useRbacUsers({ pageSize: 100 });

  const { data, isLoading, isError, refetch } = useAuditLogs({
    page: pageParam,
    pageSize: 20,
    action: actionParam || undefined,
    resourceType: resourceTypeParam || undefined,
    actorUserId: actorParam || undefined,
    from: fromParam ? dayStart(fromParam) : undefined,
    to: toParam ? dayEnd(toParam) : undefined,
    search: searchParam || undefined,
    sortDir: "desc",
  });

  const updateParams = useCallback(
    (updates: Record<string, string>) => {
      const next = new URLSearchParams(sp);
      for (const [k, v] of Object.entries(updates)) {
        if (v) next.set(k, v);
        else next.delete(k);
      }
      // Any filter change resets pagination.
      if (!("page" in updates)) next.delete("page");
      router.push(`/settings/audit-log?${next.toString()}`);
    },
    [router, sp],
  );

  useEffect(() => {
    const t = setTimeout(() => {
      if (search !== searchParam) updateParams({ search });
    }, 300);
    return () => clearTimeout(t);
  }, [search, searchParam, updateParams]);

  useEffect(() => {
    if (isError && canRead) {
      toast.error("Failed to load audit log", {
        action: { label: "Retry", onClick: refetch },
      });
    }
  }, [isError, refetch, canRead]);

  if (!permsLoading && !canRead) {
    return (
      <div className="space-y-6">
        <PageHeader
          title="Audit Log"
          subtitle="Immutable record of administrative actions"
        />
        <EmptyState
          icon={<ShieldOff className="h-8 w-8" />}
          title="Forbidden"
          description="You need the audit.read permission to view the audit log."
        />
      </div>
    );
  }

  const items = data?.items ?? [];
  const meta = data?.meta;
  const isEmpty = !isLoading && items.length === 0;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Audit Log"
        subtitle="Immutable record of administrative actions. Click a row for details."
      />

      {/* Filters */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <div className="space-y-1.5">
          <Label htmlFor="action">Action</Label>
          <Select
            id="action"
            value={actionParam}
            onChange={(e) => updateParams({ action: e.target.value })}
          >
            <option value="">All actions</option>
            {ACTION_OPTIONS.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="resourceType">Resource type</Label>
          <Select
            id="resourceType"
            value={resourceTypeParam}
            onChange={(e) => updateParams({ resourceType: e.target.value })}
          >
            <option value="">All resources</option>
            {RESOURCE_TYPE_OPTIONS.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="actor">Actor</Label>
          <Select
            id="actor"
            value={actorParam}
            onChange={(e) => updateParams({ actorUserId: e.target.value })}
          >
            <option value="">All actors</option>
            {(usersData?.items ?? []).map((u) => (
              <option key={u.id} value={u.id}>
                {u.employee?.displayName ?? u.email}
              </option>
            ))}
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="from">From</Label>
          <Input
            id="from"
            type="date"
            value={fromParam}
            onChange={(e) => updateParams({ from: e.target.value })}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="to">To</Label>
          <Input
            id="to"
            type="date"
            value={toParam}
            onChange={(e) => updateParams({ to: e.target.value })}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="search">Search</Label>
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              id="search"
              placeholder="Action or resource…"
              className="pl-8"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-sm">
          <thead className="bg-muted/50">
            <tr className="text-left text-muted-foreground">
              <th className="px-4 py-3 font-medium">Time</th>
              <th className="px-4 py-3 font-medium">Actor</th>
              <th className="px-4 py-3 font-medium">Action</th>
              <th className="hidden px-4 py-3 font-medium md:table-cell">
                Resource
              </th>
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
                      <Skeleton className="h-4 w-28" />
                    </td>
                    <td className="px-4 py-3">
                      <Skeleton className="h-5 w-32 rounded-full" />
                    </td>
                    <td className="hidden px-4 py-3 md:table-cell">
                      <Skeleton className="h-4 w-24" />
                    </td>
                  </tr>
                ))
              : items.map((e) => {
                  const actor = e.actorName ?? e.actorEmail ?? null;
                  return (
                    <tr
                      key={e.id}
                      className="cursor-pointer hover:bg-accent/40"
                      onClick={() => setSelected(e)}
                    >
                      <td className="whitespace-nowrap px-4 py-3 text-muted-foreground">
                        {new Date(e.createdAt).toLocaleString()}
                      </td>
                      <td className="px-4 py-3">
                        {actor ? (
                          <span className="font-medium">{actor}</span>
                        ) : (
                          <span className="text-muted-foreground italic">
                            System
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <Badge variant="outline">{e.action}</Badge>
                      </td>
                      <td className="hidden px-4 py-3 text-muted-foreground md:table-cell">
                        {e.resourceType}
                      </td>
                    </tr>
                  );
                })}
          </tbody>
        </table>
      </div>

      {isEmpty ? (
        <EmptyState
          icon={<ScrollText className="h-8 w-8" />}
          title="No audit entries"
          description="No actions match the current filters."
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

      <AuditDetailDialog
        entry={selected}
        onOpenChange={(o) => !o && setSelected(null)}
      />
    </div>
  );
}

export default function AuditLogPage(): React.ReactNode {
  return (
    <Suspense>
      <AuditLogContent />
    </Suspense>
  );
}
