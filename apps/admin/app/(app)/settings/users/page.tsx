"use client";

import { useCallback, useEffect, useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Avatar,
  AvatarFallback,
  Badge,
  Button,
  ConfirmDialog,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  EmptyState,
  Input,
  Label,
  PageHeader,
  Select,
  Skeleton,
  extractErrorMessage,
  toast,
  useActivateUser,
  useAssignUserRole,
  useDeactivateUser,
  usePermissionCheck,
  useRbacUsers,
  useRoles,
  useSession,
} from "@staffly/ui";
import type { RbacUserListItem } from "@staffly/types";
import { Search, ShieldOff, UserCog } from "lucide-react";

const FRIENDLY: Record<string, string> = {
  "role.super_admin_protected":
    "The super_admin role can only be assigned at organization bootstrap.",
  "role.not_found": "That role no longer exists. Refresh and try again.",
  "user.not_found": "That user no longer exists.",
  last_super_admin: "Cannot deactivate the last active super_admin.",
  "user.self_deactivate": "You cannot deactivate your own account.",
};

function friendly(err: unknown): string | undefined {
  const code =
    err && typeof err === "object" && "code" in err
      ? String((err as { code: unknown }).code)
      : undefined;
  return code ? (FRIENDLY[code] ?? undefined) : undefined;
}

function initials(name: string): string {
  return name
    .split(" ")
    .map((w) => w[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

function ChangeRoleDialog({
  user,
  onOpenChange,
}: {
  user: RbacUserListItem | null;
  onOpenChange: (o: boolean) => void;
}): React.ReactNode {
  const { data: rolesData } = useRoles({ pageSize: 100 });
  const assign = useAssignUserRole();
  const [roleId, setRoleId] = useState<string>("");
  const [serverError, setServerError] = useState<string | undefined>();

  useEffect(() => {
    if (user) {
      setRoleId(user.roles[0]?.id ?? "");
      setServerError(undefined);
    }
  }, [user]);

  // super_admin cannot be assigned via this endpoint — filter it out.
  const assignable = (rolesData?.items ?? []).filter(
    (r) => r.key !== "super_admin",
  );

  const onSave = async (): Promise<void> => {
    if (!user || !roleId) return;
    setServerError(undefined);
    try {
      await assign.mutateAsync({ userId: user.id, body: { roleId } });
      toast.success("Role updated");
      onOpenChange(false);
    } catch (err) {
      setServerError(
        friendly(err) ?? extractErrorMessage(err, "Failed to update role"),
      );
    }
  };

  return (
    <Dialog open={!!user} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Change role</DialogTitle>
          <DialogDescription>
            {user?.employee?.displayName ?? user?.email} · single role per user.
            Replaces the current role.
          </DialogDescription>
        </DialogHeader>

        {serverError ? (
          <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
            {serverError}
          </div>
        ) : null}

        <div className="space-y-2">
          <Label htmlFor="role">Role</Label>
          <Select
            id="role"
            value={roleId}
            onChange={(e) => setRoleId(e.target.value)}
          >
            <option value="" disabled>
              Select a role…
            </option>
            {assignable.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
                {r.isSystem ? " · system" : ""}
              </option>
            ))}
          </Select>
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={assign.isPending}
          >
            Cancel
          </Button>
          <Button
            type="button"
            onClick={onSave}
            disabled={assign.isPending || !roleId}
          >
            {assign.isPending ? "Saving…" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function UsersListContent(): React.ReactNode {
  const router = useRouter();
  const sp = useSearchParams();
  const { has, isLoading: permsLoading } = usePermissionCheck();
  const { data: session } = useSession();

  const searchParam = sp.get("search") ?? "";
  const pageParam = Math.max(1, Number(sp.get("page")) || 1);

  const [search, setSearch] = useState(searchParam);
  const [editTarget, setEditTarget] = useState<RbacUserListItem | null>(null);
  const [deactivateTarget, setDeactivateTarget] =
    useState<RbacUserListItem | null>(null);
  const [activateTarget, setActivateTarget] = useState<RbacUserListItem | null>(
    null,
  );

  const deactivate = useDeactivateUser();
  const activate = useActivateUser();

  const canRead = has("rbac.read");
  const canWrite = has("rbac.write");
  const meUserId = session?.user.id;

  const { data, isLoading, isError, refetch } = useRbacUsers({
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
      router.push(`/settings/users?${next.toString()}`);
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
      toast.error("Failed to load users", {
        action: { label: "Retry", onClick: refetch },
      });
    }
  }, [isError, refetch, canRead]);

  if (!permsLoading && !canRead) {
    return (
      <div className="space-y-6">
        <PageHeader title="Users" subtitle="Manage user role assignments" />
        <EmptyState
          icon={<ShieldOff className="h-8 w-8" />}
          title="Forbidden"
          description="You need the rbac.read permission to view users."
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
        title="Users"
        subtitle="Manage user role assignments. Each user has exactly one role."
      />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <div className="flex-1">
          <Label htmlFor="search" className="sr-only">
            Search
          </Label>
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              id="search"
              placeholder="Search by email…"
              className="pl-8"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>
      </div>

      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-sm">
          <thead className="bg-muted/50">
            <tr className="text-left text-muted-foreground">
              <th className="px-4 py-3 font-medium">User</th>
              <th className="hidden px-4 py-3 font-medium md:table-cell">
                Status
              </th>
              <th className="px-4 py-3 font-medium">Role</th>
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
                    <td className="hidden px-4 py-3 md:table-cell">
                      <Skeleton className="h-4 w-16" />
                    </td>
                    <td className="px-4 py-3">
                      <Skeleton className="h-5 w-20 rounded-full" />
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Skeleton className="ml-auto h-8 w-24" />
                    </td>
                  </tr>
                ))
              : items.map((u) => {
                  const role = u.roles[0];
                  const name = u.employee?.displayName ?? u.email;
                  const sub = u.employee
                    ? `${u.employee.employeeCode} · ${u.email}`
                    : u.email;
                  return (
                    <tr key={u.id} className="hover:bg-accent/40">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <Avatar className="h-8 w-8">
                            <AvatarFallback className="text-xs">
                              {initials(name)}
                            </AvatarFallback>
                          </Avatar>
                          <div className="min-w-0">
                            <p className="truncate font-medium">{name}</p>
                            <p className="truncate text-xs text-muted-foreground">
                              {sub}
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className="hidden px-4 py-3 md:table-cell">
                        <Badge variant="outline">{u.status}</Badge>
                      </td>
                      <td className="px-4 py-3">
                        {role ? (
                          <Badge>{role.name}</Badge>
                        ) : (
                          <Badge variant="outline">No role</Badge>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {canWrite && role?.key !== "super_admin" ? (
                          <div className="flex justify-end gap-1">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setEditTarget(u)}
                            >
                              Change role
                            </Button>
                            {u.status === "disabled" ? (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => setActivateTarget(u)}
                              >
                                Activate
                              </Button>
                            ) : u.id !== meUserId ? (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => setDeactivateTarget(u)}
                              >
                                Deactivate
                              </Button>
                            ) : null}
                          </div>
                        ) : null}
                      </td>
                    </tr>
                  );
                })}
          </tbody>
        </table>
      </div>

      {isEmpty ? (
        <EmptyState
          icon={<UserCog className="h-8 w-8" />}
          title="No users found"
          description={
            searchParam
              ? "Try adjusting your search."
              : "No users in this organization yet."
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

      <ChangeRoleDialog
        user={editTarget}
        onOpenChange={(o) => !o && setEditTarget(null)}
      />

      <ConfirmDialog
        open={!!deactivateTarget}
        onOpenChange={(o) => !o && setDeactivateTarget(null)}
        tone="destructive"
        typeToConfirm="DEACTIVATE"
        title={`Deactivate ${
          deactivateTarget?.employee?.displayName ??
          deactivateTarget?.email ??
          ""
        }?`}
        description="They will not be able to sign in until reactivated. Existing sessions are not currently revoked."
        confirmLabel="Deactivate"
        pendingLabel="Deactivating…"
        onConfirm={async () => {
          if (!deactivateTarget) return;
          try {
            await deactivate.mutateAsync(deactivateTarget.id);
            toast.success("User deactivated");
            setDeactivateTarget(null);
          } catch (err) {
            toast.error(
              friendly(err) ??
                extractErrorMessage(err, "Failed to deactivate user"),
            );
            setDeactivateTarget(null);
          }
        }}
      />

      <ConfirmDialog
        open={!!activateTarget}
        onOpenChange={(o) => !o && setActivateTarget(null)}
        title={`Reactivate ${
          activateTarget?.employee?.displayName ?? activateTarget?.email ?? ""
        }?`}
        description="They will be able to sign in again."
        confirmLabel="Reactivate"
        pendingLabel="Reactivating…"
        onConfirm={async () => {
          if (!activateTarget) return;
          try {
            await activate.mutateAsync(activateTarget.id);
            toast.success("User reactivated");
            setActivateTarget(null);
          } catch (err) {
            toast.error(
              friendly(err) ??
                extractErrorMessage(err, "Failed to reactivate user"),
            );
            setActivateTarget(null);
          }
        }}
      />
    </div>
  );
}

export default function UsersListPage(): React.ReactNode {
  return (
    <Suspense>
      <UsersListContent />
    </Suspense>
  );
}
