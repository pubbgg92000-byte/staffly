"use client";

import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  Button,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
  Input,
  Label,
  toast,
  useCreateHoliday,
  useUpdateHoliday,
} from "@staffly/ui";
import {
  HolidaySchema,
  type HolidayFormValues,
  type Holiday,
} from "@staffly/types";

const FRIENDLY_ERRORS: Record<string, string> = {
  "holiday.conflict_date":
    "A holiday already exists for this date in this calendar.",
};

function friendlyMsg(code: string | undefined): string | undefined {
  if (!code) return undefined;
  return FRIENDLY_ERRORS[code] ?? code;
}

const TYPE_OPTIONS = [
  { value: "public", label: "Public" },
  { value: "restricted", label: "Restricted" },
  { value: "optional", label: "Optional" },
  { value: "company", label: "Company" },
];

export function HolidayDialog({
  open,
  onOpenChange,
  calendarId,
  holiday,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  calendarId: string;
  holiday?: Holiday | null;
}): React.ReactNode {
  const isEdit = !!holiday;
  const create = useCreateHoliday();
  const update = useUpdateHoliday();
  const isPending = create.isPending || update.isPending;

  const form = useForm<HolidayFormValues>({
    resolver: zodResolver(HolidaySchema),
    defaultValues: {
      date: "",
      name: "",
      type: "public",
      isOptional: false,
      description: "",
    },
  });

  useEffect(() => {
    if (open) {
      form.reset({
        date: holiday?.date ? holiday.date.slice(0, 10) : "",
        name: holiday?.name ?? "",
        type: holiday?.type ?? "public",
        isOptional: holiday?.isOptional ?? false,
        description: holiday?.description ?? "",
      });
    }
  }, [open, holiday, form]);

  const onSubmit = form.handleSubmit(async (values) => {
    try {
      if (isEdit && holiday) {
        await update.mutateAsync({ id: holiday.id, body: values });
        toast.success("Holiday updated");
      } else {
        await create.mutateAsync({ calendarId, body: values });
        toast.success("Holiday created");
      }
      onOpenChange(false);
    } catch (err) {
      const code =
        err && typeof err === "object" && "code" in err
          ? String((err as { code: unknown }).code)
          : undefined;
      toast.error(friendlyMsg(code) ?? "Failed to save holiday");
    }
  });

  const FieldError = ({ name }: { name: keyof HolidayFormValues }) => {
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
          <DialogTitle>{isEdit ? "Edit holiday" : "Add holiday"}</DialogTitle>
          <DialogDescription>
            {isEdit
              ? "Update the holiday's details."
              : "Add a new holiday to this calendar."}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={onSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="date">Date</Label>
              <Input id="date" type="date" {...form.register("date")} />
              <FieldError name="date" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="type">Type</Label>
              <select
                id="type"
                className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                {...form.register("type")}
              >
                {TYPE_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
              <FieldError name="type" />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="name">Name</Label>
            <Input
              id="name"
              placeholder="e.g. Independence Day"
              {...form.register("name")}
            />
            <FieldError name="name" />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="description">Description (optional)</Label>
            <textarea
              id="description"
              rows={3}
              className="flex min-h-[72px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              {...form.register("description")}
            />
            <FieldError name="description" />
          </div>

          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              className="h-4 w-4 rounded border-input"
              {...form.register("isOptional")}
            />
            Optional (employees may choose to take it)
          </label>

          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline">
                Cancel
              </Button>
            </DialogClose>
            <Button type="submit" disabled={isPending}>
              {isPending ? "Saving…" : isEdit ? "Save changes" : "Add holiday"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
