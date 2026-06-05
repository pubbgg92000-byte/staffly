"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Badge,
  Button,
  ConfirmDialog,
  EmptyState,
  Input,
  Skeleton,
  toast,
  useDeleteLocation,
  useOrgLocations,
  useRestoreLocation,
} from "@staffly/ui";
import { MapPin, Plus, Search, Undo2 } from "lucide-react";
import type { OrgLocation } from "@staffly/types";
import { LocationDialog } from "./LocationDialog";
import { DeleteConfirmDialog } from "./DeleteConfirmDialog";
import { fmtDate } from "./shared";

interface Props {
  search: string;
  page: number;
  includeArchived: boolean;
  onParamsChange: (updates: Record<string, string>) => void;
}

export function LocationsView({
  search,
  page,
  includeArchived,
  onParamsChange,
}: Props): React.ReactNode {
  const [localSearch, setLocalSearch] = useState(search);

  useEffect(() => {
    const t = setTimeout(() => {
      if (localSearch !== search) onParamsChange({ search: localSearch });
    }, 300);
    return () => clearTimeout(t);
  }, [localSearch, search, onParamsChange]);

  const params: Record<string, unknown> = { page, pageSize: 20 };
  if (search) params.search = search;
  if (includeArchived) params.includeArchived = true;
  const { data, isLoading } = useOrgLocations(params);
  const deleteLoc = useDeleteLocation();
  const restoreLoc = useRestoreLocation();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<OrgLocation | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<OrgLocation | null>(null);
  const [restoreTarget, setRestoreTarget] = useState<OrgLocation | null>(null);

  const items = data?.items ?? [];
  const meta = data?.meta;
  const total = meta?.total ?? 0;
  const totalPages = meta?.totalPages ?? 0;
  const currentPage = meta?.page ?? 1;
  const pageSize = meta?.pageSize ?? 20;

  const handleDelete = useCallback(async () => {
    if (!deleteTarget) return;
    try {
      await deleteLoc.mutateAsync(deleteTarget.id);
      toast.success("Location deleted");
      setDeleteTarget(null);
    } catch {
      toast.error("Failed to delete location");
    }
  }, [deleteTarget, deleteLoc]);

  const handleRestore = useCallback(async () => {
    if (!restoreTarget) return;
    try {
      await restoreLoc.mutateAsync(restoreTarget.id);
      toast.success("Location restored");
      setRestoreTarget(null);
    } catch {
      toast.error("Couldn't restore — name may be in use by an active row");
      setRestoreTarget(null);
    }
  }, [restoreTarget, restoreLoc]);

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative max-w-sm flex-1">
          <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search locations…"
            className="pl-8"
            value={localSearch}
            onChange={(e) => setLocalSearch(e.target.value)}
          />
        </div>
        <Button
          onClick={() => {
            setEditTarget(null);
            setDialogOpen(true);
          }}
        >
          <Plus className="h-4 w-4" /> Add location
        </Button>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <EmptyState
          icon={<MapPin className="h-8 w-8" />}
          title="No locations found"
          description={
            search
              ? "Try adjusting your search."
              : "Create your first location to get started."
          }
          action={
            !search ? (
              <Button
                onClick={() => {
                  setEditTarget(null);
                  setDialogOpen(true);
                }}
              >
                <Plus className="h-4 w-4" /> Add location
              </Button>
            ) : undefined
          }
        />
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr className="text-left text-muted-foreground">
                <th className="px-4 py-3 font-medium">Name</th>
                <th className="hidden px-4 py-3 font-medium md:table-cell">
                  Code
                </th>
                <th className="hidden px-4 py-3 font-medium md:table-cell">
                  City
                </th>
                <th className="hidden px-4 py-3 font-medium lg:table-cell">
                  Country
                </th>
                <th className="hidden px-4 py-3 font-medium lg:table-cell">
                  Timezone
                </th>
                <th className="hidden px-4 py-3 font-medium xl:table-cell">
                  Created
                </th>
                <th className="px-4 py-3 font-medium" />
              </tr>
            </thead>
            <tbody className="divide-y">
              {items.map((l) => {
                const isArchived = Boolean(l.deletedAt);
                return (
                  <tr key={l.id} className="hover:bg-accent/40">
                    <td className="px-4 py-3 font-medium">
                      <span className="inline-flex items-center gap-2">
                        {l.name}
                        {isArchived ? (
                          <Badge variant="archived" className="text-xs">
                            Archived
                          </Badge>
                        ) : null}
                      </span>
                    </td>
                    <td className="hidden px-4 py-3 text-muted-foreground md:table-cell">
                      {l.code ?? "—"}
                    </td>
                    <td className="hidden px-4 py-3 text-muted-foreground md:table-cell">
                      {l.city ?? "—"}
                    </td>
                    <td className="hidden px-4 py-3 text-muted-foreground lg:table-cell">
                      {l.country ?? "—"}
                    </td>
                    <td className="hidden px-4 py-3 text-muted-foreground lg:table-cell">
                      {l.timezone}
                    </td>
                    <td className="hidden px-4 py-3 tabular-nums text-muted-foreground xl:table-cell">
                      {fmtDate(l.createdAt)}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex justify-end gap-1">
                        {isArchived ? (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setRestoreTarget(l)}
                          >
                            <Undo2 className="h-3.5 w-3.5" /> Restore
                          </Button>
                        ) : (
                          <>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => {
                                setEditTarget(l);
                                setDialogOpen(true);
                              }}
                            >
                              Edit
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setDeleteTarget(l)}
                            >
                              Delete
                            </Button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {totalPages > 1 ? (
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <p>
            Showing {(currentPage - 1) * pageSize + 1}–
            {Math.min(currentPage * pageSize, total)} of {total}
          </p>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={currentPage <= 1}
              onClick={() => onParamsChange({ page: String(currentPage - 1) })}
            >
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={currentPage >= totalPages}
              onClick={() => onParamsChange({ page: String(currentPage + 1) })}
            >
              Next
            </Button>
          </div>
        </div>
      ) : null}

      <LocationDialog
        open={dialogOpen}
        onOpenChange={(o) => {
          setDialogOpen(o);
          if (!o) setEditTarget(null);
        }}
        edit={editTarget}
      />

      <DeleteConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(o) => !o && setDeleteTarget(null)}
        noun="location"
        onConfirm={handleDelete}
        isPending={deleteLoc.isPending}
      />

      <ConfirmDialog
        open={!!restoreTarget}
        onOpenChange={(o) => !o && setRestoreTarget(null)}
        title={
          restoreTarget
            ? `Restore "${restoreTarget.name}"?`
            : "Restore location?"
        }
        description="The location will be available again for assignment to employees."
        confirmLabel="Restore"
        pendingLabel="Restoring…"
        onConfirm={handleRestore}
      />
    </div>
  );
}
