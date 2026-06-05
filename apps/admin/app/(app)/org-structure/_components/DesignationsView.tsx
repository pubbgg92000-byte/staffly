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
  useDeleteDesignation,
  useOrgDesignations,
  useRestoreDesignation,
} from "@staffly/ui";
import { Briefcase, Plus, Search, Undo2 } from "lucide-react";
import type { OrgDesignation } from "@staffly/types";
import { DesignationDialog } from "./DesignationDialog";
import { DeleteConfirmDialog } from "./DeleteConfirmDialog";
import { fmtDate } from "./shared";

interface Props {
  search: string;
  page: number;
  includeArchived: boolean;
  onParamsChange: (updates: Record<string, string>) => void;
}

export function DesignationsView({
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
  const { data, isLoading } = useOrgDesignations(params);
  const deleteDesig = useDeleteDesignation();
  const restoreDesig = useRestoreDesignation();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<OrgDesignation | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<OrgDesignation | null>(null);
  const [restoreTarget, setRestoreTarget] = useState<OrgDesignation | null>(
    null,
  );

  const items = data?.items ?? [];
  const meta = data?.meta;
  const total = meta?.total ?? 0;
  const totalPages = meta?.totalPages ?? 0;
  const currentPage = meta?.page ?? 1;
  const pageSize = meta?.pageSize ?? 20;

  const handleDelete = useCallback(async () => {
    if (!deleteTarget) return;
    try {
      await deleteDesig.mutateAsync(deleteTarget.id);
      toast.success("Designation deleted");
      setDeleteTarget(null);
    } catch {
      toast.error("Failed to delete designation");
    }
  }, [deleteTarget, deleteDesig]);

  const handleRestore = useCallback(async () => {
    if (!restoreTarget) return;
    try {
      await restoreDesig.mutateAsync(restoreTarget.id);
      toast.success("Designation restored");
      setRestoreTarget(null);
    } catch {
      // P2002 ("conflict_name") surfaces here when another active designation
      // already holds the name — admin needs to rename one or the other.
      toast.error("Couldn't restore — name may be in use by an active row");
      setRestoreTarget(null);
    }
  }, [restoreTarget, restoreDesig]);

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative max-w-sm flex-1">
          <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search designations…"
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
          <Plus className="h-4 w-4" /> Add designation
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
          icon={<Briefcase className="h-8 w-8" />}
          title="No designations found"
          description={
            search
              ? "Try adjusting your search."
              : "Create your first designation to get started."
          }
          action={
            !search ? (
              <Button
                onClick={() => {
                  setEditTarget(null);
                  setDialogOpen(true);
                }}
              >
                <Plus className="h-4 w-4" /> Add designation
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
                <th className="px-4 py-3 font-medium">Level</th>
                <th className="hidden px-4 py-3 font-medium lg:table-cell">
                  Description
                </th>
                <th className="hidden px-4 py-3 font-medium lg:table-cell">
                  Created
                </th>
                <th className="px-4 py-3 font-medium" />
              </tr>
            </thead>
            <tbody className="divide-y">
              {items.map((d) => {
                const isArchived = Boolean(d.deletedAt);
                return (
                  <tr key={d.id} className="hover:bg-accent/40">
                    <td className="px-4 py-3 font-medium">
                      <span className="inline-flex items-center gap-2">
                        {d.name}
                        {isArchived ? (
                          <Badge variant="archived" className="text-xs">
                            Archived
                          </Badge>
                        ) : null}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {d.level != null ? (
                        <Badge variant="outline">{d.level}</Badge>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="hidden max-w-md truncate px-4 py-3 text-muted-foreground lg:table-cell">
                      {d.description ?? "—"}
                    </td>
                    <td className="hidden px-4 py-3 tabular-nums text-muted-foreground lg:table-cell">
                      {fmtDate(d.createdAt)}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex justify-end gap-1">
                        {isArchived ? (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setRestoreTarget(d)}
                          >
                            <Undo2 className="h-3.5 w-3.5" /> Restore
                          </Button>
                        ) : (
                          <>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => {
                                setEditTarget(d);
                                setDialogOpen(true);
                              }}
                            >
                              Edit
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setDeleteTarget(d)}
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

      <DesignationDialog
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
        noun="designation"
        onConfirm={handleDelete}
        isPending={deleteDesig.isPending}
      />

      <ConfirmDialog
        open={!!restoreTarget}
        onOpenChange={(o) => !o && setRestoreTarget(null)}
        title={
          restoreTarget
            ? `Restore "${restoreTarget.name}"?`
            : "Restore designation?"
        }
        description="The designation will be available again for assignment to employees."
        confirmLabel="Restore"
        pendingLabel="Restoring…"
        onConfirm={handleRestore}
      />
    </div>
  );
}
