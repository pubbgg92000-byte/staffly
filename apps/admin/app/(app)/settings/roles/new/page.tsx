"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Button,
  EmptyState,
  Input,
  Label,
  PageHeader,
  Skeleton,
  extractErrorMessage,
  toast,
  useCreateRole,
  usePermissionCheck,
  usePermissions,
} from "@staffly/ui";
import { RoleSchema, type RoleFormValues } from "@staffly/types";
import { ArrowLeft, ShieldOff } from "lucide-react";
import { PermissionMatrix } from "../../_components/permission-matrix";

const FRIENDLY: Record<string, string> = {
  "role.invalid_name": "Pick a name that can be slugified (letters/numbers).",
  "role.conflict_key": "A role with this name (or its slug) already exists.",
  "role.unknown_permissions":
    "One or more selected permissions are not valid. Refresh and try again.",
};

function friendly(err: unknown): string | undefined {
  const code =
    err && typeof err === "object" && "code" in err
      ? String((err as { code: unknown }).code)
      : undefined;
  return code ? (FRIENDLY[code] ?? undefined) : undefined;
}

export default function NewRolePage(): React.ReactNode {
  const router = useRouter();
  const { has, isLoading: permsLoading } = usePermissionCheck();
  const create = useCreateRole();
  const { data: permsData, isLoading: catalogLoading } = usePermissions();
  const [serverError, setServerError] = useState<string | undefined>();

  const canWrite = has("rbac.write");

  const form = useForm<RoleFormValues>({
    resolver: zodResolver(RoleSchema),
    defaultValues: { name: "", description: "", permissions: [] },
  });

  const onSubmit = form.handleSubmit(async (values) => {
    setServerError(undefined);
    try {
      const created = await create.mutateAsync({
        name: values.name,
        description: values.description,
        permissions: values.permissions,
      });
      toast.success("Role created");
      router.push(`/settings/roles/${created.id}`);
    } catch (err) {
      setServerError(
        friendly(err) ?? extractErrorMessage(err, "Failed to create role"),
      );
    }
  });

  if (!permsLoading && !canWrite) {
    return (
      <div className="space-y-6">
        <PageHeader title="New role" />
        <EmptyState
          icon={<ShieldOff className="h-8 w-8" />}
          title="Forbidden"
          description="You need the rbac.write permission to create roles."
        />
      </div>
    );
  }

  const permissions = permsData?.items ?? [];

  return (
    <div className="space-y-6">
      <Link
        href="/settings/roles"
        className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" /> Back to roles
      </Link>

      <PageHeader
        title="New role"
        subtitle="Define a custom role and the permissions it grants."
      />

      <form onSubmit={onSubmit} className="space-y-6">
        {serverError ? (
          <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
            {serverError}
          </div>
        ) : null}

        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="name">Name *</Label>
            <Input
              id="name"
              placeholder="e.g. Payroll Manager"
              {...form.register("name")}
            />
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
              placeholder="What this role is for"
              {...form.register("description")}
            />
            {form.formState.errors.description?.message ? (
              <p className="text-xs text-destructive">
                {form.formState.errors.description.message}
              </p>
            ) : null}
          </div>
        </div>

        <div className="space-y-2">
          <Label>Permissions</Label>
          {catalogLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          ) : (
            <PermissionMatrix
              permissions={permissions}
              value={form.watch("permissions") ?? []}
              onChange={(next) =>
                form.setValue("permissions", next, { shouldDirty: true })
              }
            />
          )}
        </div>

        <div className="flex justify-end gap-2">
          <Link href="/settings/roles">
            <Button type="button" variant="outline">
              Cancel
            </Button>
          </Link>
          <Button type="submit" disabled={create.isPending}>
            {create.isPending ? "Creating…" : "Create role"}
          </Button>
        </div>
      </form>
    </div>
  );
}
