"use client";

// TODO(v0.20): Replace hierarchical department implementation with dedicated Team entity.

import { useMemo, useState } from "react";
import {
  Badge,
  Button,
  ConfirmDialog,
  EmptyState,
  Skeleton,
  toast,
  useEmployees,
  useDeleteDepartment,
  useOrgDepartments,
  useRestoreDepartment,
} from "@staffly/ui";
import {
  Building2,
  ChevronDown,
  ChevronRight,
  Plus,
  Undo2,
  Users,
} from "lucide-react";
import type { OrgDepartment, OrgDepartmentWithChildren } from "@staffly/types";
import { DepartmentDialog } from "./DepartmentDialog";
import { DeleteConfirmDialog } from "./DeleteConfirmDialog";
import { buildDeptTree } from "./shared";

interface Props {
  includeArchived: boolean;
}

export function DepartmentsView({ includeArchived }: Props): React.ReactNode {
  // Departments are visualized as a tree, so we fetch all of them (paged
  // upstream by 200) and build the tree client-side. For orgs >200 depts
  // we'd need a streaming approach — defer until that's a real problem.
  // Live tree query — always excludes archived so the tree shape is stable.
  const { data, isLoading } = useOrgDepartments({ pageSize: 200 });
  // Archived list — separate query, only fetched when the toggle is on. We
  // render archived rows as a flat list under the tree because mixing them
  // into a hierarchical structure would create orphan-parent edge cases.
  const { data: archivedData } = useOrgDepartments(
    includeArchived
      ? { pageSize: 200, includeArchived: true }
      : { pageSize: 200 },
  );
  const { data: empList } = useEmployees({ pageSize: 100 });
  const deleteDept = useDeleteDepartment();
  const restoreDept = useRestoreDepartment();

  const items = useMemo<OrgDepartment[]>(() => data?.items ?? [], [data]);
  const tree = useMemo(() => buildDeptTree(items), [items]);
  const archivedRows = useMemo<OrgDepartment[]>(
    () =>
      includeArchived
        ? (archivedData?.items ?? []).filter((d) => d.deletedAt)
        : [],
    [includeArchived, archivedData],
  );
  const employeeOpts = useMemo(
    () =>
      (empList?.items ?? []).map((e) => ({
        id: e.id,
        displayName: e.displayName,
        employeeCode: e.employeeCode,
      })),
    [empList],
  );

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<OrgDepartment | null>(null);
  const [parentPreset, setParentPreset] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<OrgDepartment | null>(null);
  const [restoreTarget, setRestoreTarget] = useState<OrgDepartment | null>(
    null,
  );

  const openCreate = (parentId: string | null) => {
    setEditTarget(null);
    setParentPreset(parentId);
    setDialogOpen(true);
  };
  const openEdit = (d: OrgDepartment) => {
    setEditTarget(d);
    setParentPreset(null);
    setDialogOpen(true);
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await deleteDept.mutateAsync(deleteTarget.id);
      toast.success("Department deleted");
      setDeleteTarget(null);
    } catch {
      toast.error("Failed to delete department");
    }
  };

  const handleRestore = async () => {
    if (!restoreTarget) return;
    try {
      await restoreDept.mutateAsync(restoreTarget.id);
      toast.success("Department restored");
      setRestoreTarget(null);
    } catch {
      toast.error("Couldn't restore — name may be in use by an active row");
      setRestoreTarget(null);
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-14 w-full" />
        ))}
      </div>
    );
  }

  if (tree.length === 0) {
    return (
      <>
        <EmptyState
          icon={<Building2 className="h-8 w-8" />}
          title="No departments yet"
          description="Create your first department to get started. Add child teams underneath once it exists."
          action={
            <Button onClick={() => openCreate(null)}>
              <Plus className="h-4 w-4" /> Add department
            </Button>
          }
        />
        <DepartmentDialog
          open={dialogOpen}
          onOpenChange={(o) => {
            setDialogOpen(o);
            if (!o) {
              setEditTarget(null);
              setParentPreset(null);
            }
          }}
          edit={editTarget}
          parentPreset={parentPreset}
          tree={tree}
          depts={items}
          employees={employeeOpts}
        />
      </>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button onClick={() => openCreate(null)}>
          <Plus className="h-4 w-4" /> Add department
        </Button>
      </div>

      <div className="space-y-2">
        {tree.map((node) => (
          <DeptRow
            key={node.id}
            node={node}
            depth={0}
            onAddTeam={(parentId) => openCreate(parentId)}
            onEdit={openEdit}
            onDelete={(d) => setDeleteTarget(d)}
          />
        ))}
      </div>

      <DepartmentDialog
        open={dialogOpen}
        onOpenChange={(o) => {
          setDialogOpen(o);
          if (!o) {
            setEditTarget(null);
            setParentPreset(null);
          }
        }}
        edit={editTarget}
        parentPreset={parentPreset}
        tree={tree}
        depts={items}
        employees={employeeOpts}
      />

      {archivedRows.length > 0 ? (
        <div className="space-y-2 pt-4">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Archived
          </h3>
          {archivedRows.map((d) => (
            <div
              key={d.id}
              className="flex items-center gap-2 rounded-lg border border-dashed bg-muted/20 px-3 py-2.5 text-muted-foreground"
            >
              {d.parentId ? (
                <Users className="h-4 w-4" />
              ) : (
                <Building2 className="h-4 w-4" />
              )}
              <div className="flex-1 truncate">
                <span className="font-medium">{d.name}</span>
                {d.code ? (
                  <Badge variant="outline" className="ml-2">
                    {d.code}
                  </Badge>
                ) : null}
                <Badge variant="archived" className="ml-2 text-xs">
                  Archived
                </Badge>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setRestoreTarget(d)}
              >
                <Undo2 className="h-3.5 w-3.5" /> Restore
              </Button>
            </div>
          ))}
        </div>
      ) : null}

      <DeleteConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(o) => !o && setDeleteTarget(null)}
        noun={deleteTarget?.parentId ? "team" : "department"}
        onConfirm={handleDelete}
        isPending={deleteDept.isPending}
      />

      <ConfirmDialog
        open={!!restoreTarget}
        onOpenChange={(o) => !o && setRestoreTarget(null)}
        title={
          restoreTarget
            ? `Restore "${restoreTarget.name}"?`
            : "Restore department?"
        }
        description="The department reappears in the tree. Employees that were previously assigned keep their references."
        confirmLabel="Restore"
        pendingLabel="Restoring…"
        onConfirm={handleRestore}
      />
    </div>
  );
}

function DeptRow({
  node,
  depth,
  onAddTeam,
  onEdit,
  onDelete,
}: {
  node: OrgDepartmentWithChildren;
  depth: number;
  onAddTeam: (parentId: string) => void;
  onEdit: (d: OrgDepartment) => void;
  onDelete: (d: OrgDepartment) => void;
}): React.ReactNode {
  const [expanded, setExpanded] = useState(true);
  const hasChildren = node.children.length > 0;
  const isTeam = depth > 0;

  return (
    <div>
      <div
        className="flex items-center gap-2 rounded-lg border bg-card px-3 py-2.5 hover:bg-accent/30"
        style={{ marginLeft: depth * 24 }}
      >
        <button
          type="button"
          aria-label={
            hasChildren ? (expanded ? "Collapse" : "Expand") : "No children"
          }
          onClick={() => hasChildren && setExpanded((v) => !v)}
          className="text-muted-foreground"
          disabled={!hasChildren}
        >
          {hasChildren ? (
            expanded ? (
              <ChevronDown className="h-4 w-4" />
            ) : (
              <ChevronRight className="h-4 w-4" />
            )
          ) : (
            <span className="block h-4 w-4" />
          )}
        </button>

        {isTeam ? (
          <Users className="h-4 w-4 text-muted-foreground" />
        ) : (
          <Building2 className="h-4 w-4 text-muted-foreground" />
        )}

        <div className="flex-1 truncate">
          <span className="font-medium">{node.name}</span>
          {node.code ? (
            <Badge variant="outline" className="ml-2">
              {node.code}
            </Badge>
          ) : null}
          {isTeam ? (
            <Badge variant="secondary" className="ml-2">
              Team
            </Badge>
          ) : null}
        </div>

        <div className="flex items-center gap-1">
          {!isTeam ? (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onAddTeam(node.id)}
            >
              <Plus className="h-3 w-3" /> Add team
            </Button>
          ) : null}
          <Button variant="ghost" size="sm" onClick={() => onEdit(node)}>
            Edit
          </Button>
          <Button variant="ghost" size="sm" onClick={() => onDelete(node)}>
            Delete
          </Button>
        </div>
      </div>

      {hasChildren && expanded ? (
        <div className="mt-2 space-y-2">
          {node.children.map((child) => (
            <DeptRow
              key={child.id}
              node={child}
              depth={depth + 1}
              onAddTeam={onAddTeam}
              onEdit={onEdit}
              onDelete={onDelete}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}
