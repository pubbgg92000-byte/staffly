"use client";

import { useCallback, useEffect, useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  Badge,
  Button,
  EmptyState,
  Input,
  Label,
  PageHeader,
  Skeleton,
  toast,
  useRoles,
  usePermissionCheck,
} from "@staffly/ui";
import { Plus, Search, Shield, ShieldOff } from "lucide-react";

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function RolesListContent(): React.ReactNode {
  const router = useRouter();
  const sp = useSearchParams();
  const { has, isLoading: permsLoading } = usePermissionCheck();

  const searchParam = sp.get("search") ?? "";
  const includeArchived = sp.get("includeArchived") === "1";
  const pageParam = Math.max(1, Number(sp.get("page")) || 1);

  const [search, setSearch] = useState(searchParam);

  const canRead = has("rbac.read");
  const canWrite = has("rbac.write");

  const { data, isLoading, isError, refetch } = useRoles({
    page: pageParam,
    pageSize: 20,
    search: searchParam || undefined,
    includeArchived: includeArchived || undefined,
  });

  const updateParams = useCallback(
    (updates: Record<string, string>) => {
      const next = new URLSearchParams(sp);
      for (const [k, v] of Object.entries(updates)) {
        if (v) next.set(k, v);
        else next.delete(k);
      }
      if (updates.search !== undefined) next.delete("page");
      router.push(`/settings/roles?${next.toString()}`);
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
      toast.error("Failed to load roles", {
        action: { label: "Retry", onClick: refetch },
      });
    }
  }, [isError, refetch, canRead]);

  // Forbidden state — page renders but data is gated.
  if (!permsLoading && !canRead) {
    return (
      <div className="space-y-6">
        <PageHeader title="Roles" subtitle="Manage role definitions" />
        <EmptyState
          icon={<ShieldOff className="h-8 w-8" />}
          title="Forbidden"
          description="You need the rbac.read permission to view roles."
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
        title="Roles"
        subtitle="Manage role definitions and the permissions they grant."
        actions={
          canWrite ? (
            <Link href="/settings/roles/new">
              <Button>
                <Plus className="h-4 w-4" />
                New role
              </Button>
            </Link>
          ) : null
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
              placeholder="Search role names…"
              className="pl-8"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
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
              <th className="px-4 py-3 font-medium">Name</th>
              <th className="hidden px-4 py-3 font-medium md:table-cell">
                Description
              </th>
              <th className="px-4 py-3 font-medium tabular-nums">Users</th>
              <th className="px-4 py-3 font-medium tabular-nums">
                Permissions
              </th>
              <th className="hidden px-4 py-3 font-medium lg:table-cell">
                Created
              </th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {isLoading
              ? Array.from({ length: 4 }).map((_, i) => (
                  <tr key={i}>
                    <td className="px-4 py-3">
                      <Skeleton className="h-5 w-32" />
                    </td>
                    <td className="hidden px-4 py-3 md:table-cell">
                      <Skeleton className="h-4 w-48" />
                    </td>
                    <td className="px-4 py-3">
                      <Skeleton className="h-4 w-8" />
                    </td>
                    <td className="px-4 py-3">
                      <Skeleton className="h-4 w-8" />
                    </td>
                    <td className="hidden px-4 py-3 lg:table-cell">
                      <Skeleton className="h-4 w-20" />
                    </td>
                  </tr>
                ))
              : items.map((role) => {
                  const isArchived = Boolean(role.deletedAt);
                  return (
                    <tr
                      key={role.id}
                      className="cursor-pointer hover:bg-accent/40"
                      onClick={() => router.push(`/settings/roles/${role.id}`)}
                    >
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <Shield className="h-4 w-4 shrink-0 text-muted-foreground" />
                          <span className="font-medium">{role.name}</span>
                          {role.isSystem ? (
                            <Badge variant="secondary" className="text-xs">
                              System
                            </Badge>
                          ) : null}
                          {isArchived ? (
                            <Badge variant="archived" className="text-xs">
                              Archived
                            </Badge>
                          ) : null}
                        </div>
                      </td>
                      <td className="hidden max-w-md truncate px-4 py-3 text-muted-foreground md:table-cell">
                        {role.description ?? "—"}
                      </td>
                      <td className="px-4 py-3 tabular-nums">
                        {role.userCount}
                      </td>
                      <td className="px-4 py-3 tabular-nums">
                        {role.permissionCount}
                      </td>
                      <td className="hidden px-4 py-3 tabular-nums text-muted-foreground lg:table-cell">
                        {fmtDate(role.createdAt)}
                      </td>
                    </tr>
                  );
                })}
          </tbody>
        </table>
      </div>

      {isEmpty ? (
        <EmptyState
          icon={<Shield className="h-8 w-8" />}
          title="No roles found"
          description={
            searchParam
              ? "Try adjusting your search."
              : "Get started by creating a role."
          }
          action={
            !searchParam && canWrite ? (
              <Link href="/settings/roles/new">
                <Button>
                  <Plus className="h-4 w-4" />
                  New role
                </Button>
              </Link>
            ) : undefined
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
    </div>
  );
}

export default function RolesListPage(): React.ReactNode {
  return (
    <Suspense>
      <RolesListContent />
    </Suspense>
  );
}
