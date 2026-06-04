"use client";

import { useEffect, useState } from "react";
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
  extractErrorMessage,
  toast,
  useCreateDesignation,
  useUpdateDesignation,
} from "@staffly/ui";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  DesignationSchema,
  designationFormToPayload,
  type DesignationFormValues,
  type OrgDesignation,
} from "@staffly/types";
import { friendlyMsg } from "./shared";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  edit: OrgDesignation | null;
}

export function DesignationDialog({
  open,
  onOpenChange,
  edit,
}: Props): React.ReactNode {
  const create = useCreateDesignation();
  const update = useUpdateDesignation();
  const [serverError, setServerError] = useState<string | undefined>();
  const isEdit = !!edit;

  const form = useForm<DesignationFormValues>({
    resolver: zodResolver(DesignationSchema),
    defaultValues: { name: "", level: "", description: "" },
  });

  useEffect(() => {
    if (!open) return;
    form.reset({
      name: edit?.name ?? "",
      level: edit?.level != null ? String(edit.level) : "",
      description: edit?.description ?? "",
    });
    setServerError(undefined);
  }, [open, edit, form]);

  const doSave = form.handleSubmit(async (values) => {
    setServerError(undefined);
    const payload = designationFormToPayload(values);
    try {
      if (isEdit && edit) {
        await update.mutateAsync({ id: edit.id, body: payload });
        toast.success("Designation updated");
      } else {
        await create.mutateAsync(payload);
        toast.success("Designation created");
      }
      onOpenChange(false);
    } catch (err) {
      setServerError(
        friendlyMsg(err) ??
          extractErrorMessage(err, "Failed to save designation"),
      );
    }
  });

  const FieldError = ({ name }: { name: keyof DesignationFormValues }) => {
    const err = form.formState.errors[name];
    if (!err?.message) return null;
    return (
      <p className="mt-1 text-xs text-destructive">{String(err.message)}</p>
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {isEdit ? "Edit designation" : "Create designation"}
          </DialogTitle>
          <DialogDescription>
            Define job titles and optional seniority levels.
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

          <div className="space-y-1.5">
            <Label>Level</Label>
            <Input
              type="number"
              min={0}
              max={100}
              placeholder="0–100 (optional)"
              {...form.register("level")}
            />
            <FieldError name="level" />
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
                  : "Create designation"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
