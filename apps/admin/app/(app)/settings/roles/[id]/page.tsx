"use client";

import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  Badge,
  Button,
  ConfirmDialog,
  EmptyState,
  Input,
  Label,
  PageHeader,
  Skeleton,
  extractErrorMessage,
  toast,
  useDeleteRole,
  usePermissionCheck,
  usePermissions,
  useRestoreRole,
  useRole,
  useUpdateRole,
} from "@staffly/ui";
import { RoleSchema, type RoleFormValues } from "@staffly/types";
import { ArrowLeft, Shield, ShieldOff, Trash2, Undo2 } from "lucide-react";
import { PermissionMatrix } from "../../_components/permission-matrix";

const FRIENDLY: Record<string, string> = {
  "role.not_found": "Role not found.",
  "role.invalid_name": "Pick a name that can be slugified (letters/numbers).",
  "role.conflict_key": "A role with this name (or its slug) already exists.",
  "role.unknown_permissions":
    "One or more selected permissions are not valid. Refresh and try again.",
  "role.system_undeletable": "System roles cannot be deleted.",
  "role.system_immutable":
    "System roles can't be edited. Clone to a custom role to change permissions.",
  "role.in_use":
    "This role still has users assigned. Reassign them before deleting.",
};

function friendly(err: unknown): string | undefined {
  const code =
    err && typeof err === "object" && "code" in err
      ? String((err as { code: unknown }).code)
      : undefined;
  return code ? (FRIENDLY[code] ?? undefined) : undefined;
}

export default function RoleDetailPage(): React.ReactNode {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const id = params.id;

  const { has, isLoading: permsLoading } = usePermissionCheck();
  const { data: role, isLoading, error } = useRole(id);
  const { data: catalog, isLoading: catalogLoading } = usePermissions();
  const update = useUpdateRole(id);
  const del = useDeleteRole();
  const restore = useRestoreRole();
  const [serverError, setServerError] = useState<string | undefined>();
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [restoreOpen, setRestoreOpen] = useState(false);

  const canRead = has("rbac.read");
  const canWrite = has("rbac.write");

  const form = useForm<RoleFormValues>({
    resolver: zodResolver(RoleSchema),
    defaultValues: { name: "", description: "", permissions: [] },
  });

  // Hydrate the form when the role loads/changes.
  useEffect(() => {
    if (!role) return;
    form.reset({
      name: role.name,
      description: role.description ?? "",
      permissions: role.permissions.map((p) => p.key),
    });
    setServerError(undefined);
  }, [role, form]);

  // 404 → bounce back to list.
  useEffect(() => {
    if (error && error.status === 404) {
      toast.error("Role not found");
      router.replace("/settings/roles");
    }
  }, [error, router]);

  if (!permsLoading && !canRead) {
    return (
      <div className="space-y-6">
        <PageHeader title="Role" />
        <EmptyState
          icon={<ShieldOff className="h-8 w-8" />}
          title="Forbidden"
          description="You need the rbac.read permission to view roles."
        />
      </div>
    );
  }

  if (isLoading || !role) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-6 w-32" />
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  const isSuperAdmin = role.key === "super_admin";
  const isArchived = Boolean(role.deletedAt);
  // System roles: matrix is locked but name/description are editable.
  // Archived roles: everything is locked until restored.
  const matrixReadOnly = !canWrite || role.isSystem || isArchived;
  const canDelete = canWrite && !role.isSystem && !isArchived;
  const canRestore = canWrite && !role.isSystem && isArchived;

  const onSubmit = form.handleSubmit(async (values) => {
    setServerError(undefined);
    try {
      // For system (non-super_admin) roles, only send name + description so
      // the API doesn't reject a permissions replacement attempt.
      const body = role.isSystem
        ? { name: values.name, description: values.description }
        : {
            name: values.name,
            description: values.description,
            permissions: values.permissions,
          };
      await update.mutateAsync(body);
      toast.success("Role updated");
    } catch (err) {
      setServerError(
        friendly(err) ?? extractErrorMessage(err, "Failed to update role"),
      );
    }
  });

  const onDelete = async (): Promise<void> => {
    try {
      await del.mutateAsync(role.id);
      toast.success("Role deleted");
      router.replace("/settings/roles");
    } catch (err) {
      toast.error(
        friendly(err) ?? extractErrorMessage(err, "Failed to delete role"),
      );
      setDeleteOpen(false);
    }
  };

  const onRestore = async (): Promise<void> => {
    try {
      await restore.mutateAsync(role.id);
      toast.success("Role restored");
      setRestoreOpen(false);
    } catch (err) {
      toast.error(
        friendly(err) ?? extractErrorMessage(err, "Failed to restore role"),
      );
      setRestoreOpen(false);
    }
  };

  return (
    <div className="space-y-6">
      <Link
        href="/settings/roles"
        className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" /> Back to roles
      </Link>

      <PageHeader
        title={role.name}
        subtitle={role.description ?? undefined}
        actions={
          <div className="flex items-center gap-2">
            {role.isSystem ? <Badge variant="secondary">System</Badge> : null}
            {isArchived ? <Badge variant="archived">Archived</Badge> : null}
            <Badge variant="outline" className="tabular-nums">
              {role.userCount} {role.userCount === 1 ? "user" : "users"}
            </Badge>
            {canRestore ? (
              <Button size="sm" onClick={() => setRestoreOpen(true)}>
                <Undo2 className="h-4 w-4" /> Restore
              </Button>
            ) : null}
            {canDelete ? (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setDeleteOpen(true)}
              >
                <Trash2 className="h-4 w-4" /> Delete
              </Button>
            ) : null}
          </div>
        }
      />

      <form onSubmit={onSubmit} className="space-y-6">
        {serverError ? (
          <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
            {serverError}
          </div>
        ) : null}

        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="name">Name</Label>
            <Input
              id="name"
              disabled={!canWrite || isArchived}
              {...form.register("name")}
            />
            <p className="text-xs text-muted-foreground">
              Key:{" "}
              <code className="rounded bg-muted px-1.5 py-0.5 font-mono">
                {role.key}
              </code>
            </p>
            {form.formState.errors.name?.message ? (
              <p className="text-xs text-destructive">
                {form.formState.errors.name.message}
              </p>
            ) : null}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="description">Description</Label>
            <Input
              id="description"
              disabled={!canWrite || isArchived}
              {...form.register("description")}
            />
          </div>
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label>Permissions</Label>
            {role.isSystem && !isSuperAdmin ? (
              <p className="flex items-center gap-1 text-xs text-muted-foreground">
                <Shield className="h-3 w-3" /> System role — permissions are
                read-only.
              </p>
            ) : null}
          </div>
          {catalogLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          ) : (
            <PermissionMatrix
              permissions={catalog?.items ?? []}
              value={form.watch("permissions") ?? []}
              onChange={(next) =>
                form.setValue("permissions", next, { shouldDirty: true })
              }
              readOnly={matrixReadOnly}
              showAll={isSuperAdmin}
            />
          )}
        </div>

        {canWrite && !isArchived ? (
          <div className="flex justify-end gap-2">
            <Button
              type="submit"
              disabled={update.isPending || !form.formState.isDirty}
            >
              {update.isPending ? "Saving…" : "Save changes"}
            </Button>
          </div>
        ) : null}
      </form>

      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        tone="destructive"
        typeToConfirm={role.name}
        title={`Delete "${role.name}"?`}
        description="This will soft-delete the role. It cannot be deleted if any users are currently assigned to it."
        confirmLabel="Delete"
        pendingLabel="Deleting…"
        onConfirm={onDelete}
      />

      <ConfirmDialog
        open={restoreOpen}
        onOpenChange={setRestoreOpen}
        title={`Restore "${role.name}"?`}
        description="The role will be available again for assignment. Its permission set is preserved."
        confirmLabel="Restore"
        pendingLabel="Restoring…"
        onConfirm={onRestore}
      />
    </div>
  );
}
