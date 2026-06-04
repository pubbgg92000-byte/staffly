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
  useCreateLocation,
  useUpdateLocation,
} from "@staffly/ui";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  LocationSchema,
  type LocationFormValues,
  type OrgLocation,
} from "@staffly/types";
import { friendlyMsg } from "./shared";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  edit: OrgLocation | null;
}

export function LocationDialog({
  open,
  onOpenChange,
  edit,
}: Props): React.ReactNode {
  const create = useCreateLocation();
  const update = useUpdateLocation();
  const [serverError, setServerError] = useState<string | undefined>();
  const isEdit = !!edit;

  const form = useForm<LocationFormValues>({
    resolver: zodResolver(LocationSchema),
    defaultValues: {
      name: "",
      code: "",
      addressLine1: "",
      addressLine2: "",
      city: "",
      state: "",
      country: "",
      postalCode: "",
      timezone: "",
    },
  });

  useEffect(() => {
    if (!open) return;
    form.reset({
      name: edit?.name ?? "",
      code: edit?.code ?? "",
      addressLine1: edit?.addressLine1 ?? "",
      addressLine2: edit?.addressLine2 ?? "",
      city: edit?.city ?? "",
      state: edit?.state ?? "",
      country: edit?.country ?? "",
      postalCode: edit?.postalCode ?? "",
      timezone: edit?.timezone ?? "",
    });
    setServerError(undefined);
  }, [open, edit, form]);

  const doSave = form.handleSubmit(async (values) => {
    setServerError(undefined);
    try {
      if (isEdit && edit) {
        await update.mutateAsync({ id: edit.id, body: values });
        toast.success("Location updated");
      } else {
        await create.mutateAsync(values);
        toast.success("Location created");
      }
      onOpenChange(false);
    } catch (err) {
      setServerError(
        friendlyMsg(err) ?? extractErrorMessage(err, "Failed to save location"),
      );
    }
  });

  const FieldError = ({ name }: { name: keyof LocationFormValues }) => {
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
            {isEdit ? "Edit location" : "Create location"}
          </DialogTitle>
          <DialogDescription>Add office or site locations.</DialogDescription>
        </DialogHeader>

        {serverError ? (
          <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
            {serverError}
          </div>
        ) : null}

        <form
          onSubmit={doSave}
          className="max-h-[60vh] space-y-4 overflow-y-auto"
        >
          <div className="space-y-1.5">
            <Label>Name *</Label>
            <Input {...form.register("name")} />
            <FieldError name="name" />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Code</Label>
              <Input {...form.register("code")} />
            </div>
            <div className="space-y-1.5">
              <Label>Timezone</Label>
              <Input placeholder="Etc/UTC" {...form.register("timezone")} />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Address line 1</Label>
            <Input {...form.register("addressLine1")} />
          </div>
          <div className="space-y-1.5">
            <Label>Address line 2</Label>
            <Input {...form.register("addressLine2")} />
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <Label>City</Label>
              <Input {...form.register("city")} />
            </div>
            <div className="space-y-1.5">
              <Label>State</Label>
              <Input {...form.register("state")} />
            </div>
            <div className="space-y-1.5">
              <Label>Country</Label>
              <Input
                placeholder="US"
                maxLength={2}
                {...form.register("country")}
              />
              <FieldError name="country" />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Postal code</Label>
            <Input {...form.register("postalCode")} />
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
                  : "Create location"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
