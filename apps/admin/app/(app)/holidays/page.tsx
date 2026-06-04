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
  Skeleton,
  toast,
  useHolidayCalendars,
} from "@staffly/ui";
import { PartyPopper, Plus, Search } from "lucide-react";
import { CalendarDialog } from "./_components/calendar-dialog";

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function HolidaysListContent(): React.ReactNode {
  const router = useRouter();
  const sp = useSearchParams();

  const searchParam = sp.get("search") ?? "";
  const pageParam = Math.max(1, Number(sp.get("page")) || 1);

  const [search, setSearch] = useState(searchParam);
  const [createOpen, setCreateOpen] = useState(false);

  const { data, isLoading, isError, refetch } = useHolidayCalendars({
    page: pageParam,
    pageSize: 20,
    search: searchParam || undefined,
  });

  const updateParams = useCallback(
    (updates: Record<string, string>) => {
      const next = new URLSearchParams(sp);
      for (const [k, v] of Object.entries(updates)) {
        if (v) next.set(k, v);
        else next.delete(k);
      }
      if (updates.search !== undefined) next.delete("page");
      router.push(`/holidays?${next.toString()}`);
    },
    [router, sp],
  );

  useEffect(() => {
    const timer = setTimeout(() => {
      if (search !== searchParam) updateParams({ search });
    }, 300);
    return () => clearTimeout(timer);
  }, [search, searchParam, updateParams]);

  useEffect(() => {
    if (isError) {
      toast.error("Failed to load calendars", {
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
        title="Holiday calendars"
        subtitle="Group public holidays for locations"
        actions={
          <Button onClick={() => setCreateOpen(true)}>
            <Plus className="h-4 w-4" />
            New calendar
          </Button>
        }
      />

      <div className="relative max-w-sm">
        <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Label htmlFor="search" className="sr-only">
          Search
        </Label>
        <Input
          id="search"
          placeholder="Search calendars…"
          className="pl-8"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-sm">
          <thead className="bg-muted/50">
            <tr className="text-left text-muted-foreground">
              <th className="px-4 py-3 font-medium">Name</th>
              <th className="hidden px-4 py-3 font-medium md:table-cell">
                Code
              </th>
              <th className="px-4 py-3 font-medium">Default</th>
              <th className="hidden px-4 py-3 font-medium lg:table-cell">
                Description
              </th>
              <th className="hidden px-4 py-3 font-medium lg:table-cell">
                Created
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
                    <td className="hidden px-4 py-3 md:table-cell">
                      <Skeleton className="h-4 w-16" />
                    </td>
                    <td className="px-4 py-3">
                      <Skeleton className="h-5 w-12 rounded-full" />
                    </td>
                    <td className="hidden px-4 py-3 lg:table-cell">
                      <Skeleton className="h-4 w-64" />
                    </td>
                    <td className="hidden px-4 py-3 lg:table-cell">
                      <Skeleton className="h-4 w-20" />
                    </td>
                  </tr>
                ))
              : items.map((cal) => (
                  <tr
                    key={cal.id}
                    className="cursor-pointer hover:bg-accent/40"
                    onClick={() => router.push(`/holidays/${cal.id}`)}
                  >
                    <td className="px-4 py-3 font-medium">{cal.name}</td>
                    <td className="hidden px-4 py-3 text-muted-foreground md:table-cell">
                      {cal.code ?? "—"}
                    </td>
                    <td className="px-4 py-3">
                      {cal.isDefault ? (
                        <Badge variant="success">Default</Badge>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="hidden px-4 py-3 lg:table-cell">
                      <p className="line-clamp-1 max-w-md text-muted-foreground">
                        {cal.description ?? "—"}
                      </p>
                    </td>
                    <td className="hidden px-4 py-3 tabular-nums text-muted-foreground lg:table-cell">
                      {fmtDate(cal.createdAt)}
                    </td>
                  </tr>
                ))}
          </tbody>
        </table>
      </div>

      {isEmpty ? (
        <EmptyState
          icon={<PartyPopper className="h-8 w-8" />}
          title="No calendars"
          description={
            searchParam
              ? "Try adjusting your search."
              : "Create your first calendar to start tracking holidays."
          }
          action={
            !searchParam ? (
              <Button onClick={() => setCreateOpen(true)}>
                <Plus className="h-4 w-4" />
                New calendar
              </Button>
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

      <CalendarDialog open={createOpen} onOpenChange={setCreateOpen} />
    </div>
  );
}

export default function AdminHolidaysPage(): React.ReactNode {
  return (
    <Suspense>
      <HolidaysListContent />
    </Suspense>
  );
}
