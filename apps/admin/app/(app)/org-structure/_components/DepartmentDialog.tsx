"use client";

// TODO(v0.20): Replace hierarchical department implementation with dedicated Team entity.

import { useEffect, useMemo, useState } from "react";
import {
  Button,
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
  Select,
  extractErrorMessage,
  toast,
  useCreateDepartment,
  useUpdateDepartment,
} from "@staffly/ui";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  DepartmentSchema,
  type DepartmentFormValues,
  type OrgDepartment,
  type OrgDepartmentWithChildren,
} from "@staffly/types";
import { descendantIds, friendlyMsg } from "./shared";

interface EmployeeOpt {
  id: string;
  displayName: string;
  employeeCode: string;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  edit: OrgDepartment | null;
  parentPreset: string | null;
  tree: OrgDepartmentWithChildren[];
  depts: OrgDepartment[];
  employees: EmployeeOpt[];
}

export function DepartmentDialog({
  open,
  onOpenChange,
  edit,
  parentPreset,
  tree,
  depts,
  employees,
}: Props): React.ReactNode {
  const create = useCreateDepartment();
  const update = useUpdateDepartment();
  const [serverError, setServerError] = useState<string | undefined>();
  const isEdit = !!edit;

  const form = useForm<DepartmentFormValues>({
    resolver: zodResolver(DepartmentSchema),
    defaultValues: {
      name: "",
      code: "",
      parentId: "",
      headEmployeeId: "",
      description: "",
    },
  });

  useEffect(() => {
    if (!open) return;
    form.reset({
      name: edit?.name ?? "",
      code: edit?.code ?? "",
      parentId: edit?.parentId ?? parentPreset ?? "",
      headEmployeeId: edit?.headEmployeeId ?? "",
      description: edit?.description ?? "",
    });
    setServerError(undefined);
  }, [open, edit, parentPreset, form]);

  // Exclude self + descendants from the parent picker to prevent cycles.
  const parentOptions = useMemo(() => {
    if (!edit) return depts;
    const blocked = descendantIds(tree, edit.id);
    return depts.filter((d) => !blocked.has(d.id));
  }, [depts, tree, edit]);

  const doSave = form.handleSubmit(async (values) => {
    setServerError(undefined);
    try {
      if (isEdit && edit) {
        await update.mutateAsync({ id: edit.id, body: values });
        toast.success("Department updated");
      } else {
        await create.mutateAsync(values);
        toast.success("Department created");
      }
      onOpenChange(false);
    } catch (err) {
      setServerError(
        friendlyMsg(err) ??
          extractErrorMessage(err, "Failed to save department"),
      );
    }
  });

  const FieldError = ({ name }: { name: keyof DepartmentFormValues }) => {
    const err = form.formState.errors[name];
    if (!err?.message) return null;
    return (
      <p className="mt-1 text-xs text-destructive">{String(err.message)}</p>
    );
  };

  const titleNoun = parentPreset ? "team" : "department";
  const dlgTitle = isEdit
    ? `Edit ${edit?.parentId ? "team" : "department"}`
    : `Create ${titleNoun}`;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{dlgTitle}</DialogTitle>
          <DialogDescription>
            {parentPreset
              ? "A team is a sub-department nested under a parent department."
              : "Organize employees into functional groups."}
          </DialogDescription>
        </DialogHeader>

        {serverError ? (
          <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
            {serverError}
          </div>
        ) : null}

        <form onSubmit={doSave} className="space-y-4">
          <div className="space-y-1.5">
            <Label>Name *</Label>
            <Input {...form.register("name")} />
            <FieldError name="name" />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Code</Label>
              <Input {...form.register("code")} placeholder="e.g. ENG" />
            </div>
            <div className="space-y-1.5">
              <Label>Parent department</Label>
              <Select {...form.register("parentId")}>
                <option value="">— (root)</option>
                {parentOptions.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Head</Label>
            <Select {...form.register("headEmployeeId")}>
              <option value="">—</option>
              {employees.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.displayName} · {e.employeeCode}
                </option>
              ))}
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>Description</Label>
            <textarea
              rows={3}
              className="flex min-h-[72px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              {...form.register("description")}
            />
          </div>

          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline">
                Cancel
              </Button>
            </DialogClose>
            <Button
              type="submit"
              disabled={create.isPending || update.isPending}
            >
              {create.isPending || update.isPending
                ? "Saving…"
                : isEdit
                  ? "Save changes"
                  : `Create ${titleNoun}`}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
