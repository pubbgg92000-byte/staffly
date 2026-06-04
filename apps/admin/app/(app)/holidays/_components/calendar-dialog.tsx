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
  useCreateHolidayCalendar,
  useUpdateHolidayCalendar,
} from "@staffly/ui";
import {
  HolidayCalendarSchema,
  type HolidayCalendarFormValues,
  type HolidayCalendar,
} from "@staffly/types";

const FRIENDLY_ERRORS: Record<string, string> = {
  "holiday.calendar.conflict_name_or_code":
    "A calendar with this name or code already exists.",
  "holiday.calendar.default_required":
    "Cannot un-set the default calendar. Promote another calendar instead.",
};

function friendlyMsg(code: string | undefined): string | undefined {
  if (!code) return undefined;
  return FRIENDLY_ERRORS[code] ?? code;
}

export function CalendarDialog({
  open,
  onOpenChange,
  calendar,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  calendar?: HolidayCalendar | null;
}): React.ReactNode {
  const isEdit = !!calendar;
  const create = useCreateHolidayCalendar();
  const update = useUpdateHolidayCalendar();
  const isPending = create.isPending || update.isPending;

  const form = useForm<HolidayCalendarFormValues>({
    resolver: zodResolver(HolidayCalendarSchema),
    defaultValues: {
      name: "",
      code: "",
      description: "",
      isDefault: false,
    },
  });

  useEffect(() => {
    if (open) {
      form.reset({
        name: calendar?.name ?? "",
        code: calendar?.code ?? "",
        description: calendar?.description ?? "",
        isDefault: calendar?.isDefault ?? false,
      });
    }
  }, [open, calendar, form]);

  const onSubmit = form.handleSubmit(async (values) => {
    try {
      if (isEdit && calendar) {
        await update.mutateAsync({ id: calendar.id, body: values });
        toast.success("Calendar updated");
      } else {
        await create.mutateAsync(values);
        toast.success("Calendar created");
      }
      onOpenChange(false);
    } catch (err) {
      const code =
        err && typeof err === "object" && "code" in err
          ? String((err as { code: unknown }).code)
          : undefined;
      toast.error(friendlyMsg(code) ?? "Failed to save calendar");
    }
  });

  const FieldError = ({ name }: { name: keyof HolidayCalendarFormValues }) => {
    const err = form.formState.errors[name];
    if (!err?.message) return null;
    return (
      <p className="mt-1 text-xs text-destructive">{String(err.message)}</p>
    );
  };

  // When editing the current default, hide the "make default" toggle since
  // the backend rejects un-setting it (default_required error).
  const showDefaultToggle = !isEdit || !calendar?.isDefault;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {isEdit ? "Edit calendar" : "Create calendar"}
          </DialogTitle>
          <DialogDescription>
            {isEdit
              ? "Update the calendar's name, code, or description."
              : "Holiday calendars group public holidays for one or more locations."}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={onSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="name">Name</Label>
            <Input id="name" {...form.register("name")} />
            <FieldError name="name" />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="code">Code (optional)</Label>
            <Input
              id="code"
              placeholder="e.g. US-CA"
              {...form.register("code")}
            />
            <FieldError name="code" />
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

          {showDefaultToggle ? (
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                className="h-4 w-4 rounded border-input"
                {...form.register("isDefault")}
              />
              Use as the default calendar
            </label>
          ) : (
            <p className="text-xs text-muted-foreground">
              This calendar is the organization default.
            </p>
          )}

          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline">
                Cancel
              </Button>
            </DialogClose>
            <Button type="submit" disabled={isPending}>
              {isPending
                ? "Saving…"
                : isEdit
                  ? "Save changes"
                  : "Create calendar"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
