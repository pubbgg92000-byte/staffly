"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  Button,
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
  Input,
  Label,
  toast,
  useCreateRegularization,
} from "@staffly/ui";
import {
  CreateRegularizationSchema,
  type CreateRegularizationFormValues,
} from "@staffly/types";
import { CalendarClock } from "lucide-react";

function yesterdayIso(): string {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function combineLocal(dateIso: string, time: string): string {
  return new Date(`${dateIso}T${time}:00`).toISOString();
}

export function RegularizationDialog(): React.ReactNode {
  const [open, setOpen] = useState(false);
  const create = useCreateRegularization();

  const form = useForm<CreateRegularizationFormValues>({
    resolver: zodResolver(CreateRegularizationSchema),
    defaultValues: {
      attendanceDate: yesterdayIso(),
      checkInTime: "",
      checkOutTime: "",
      reason: "",
    },
  });

  const onSubmit = form.handleSubmit(async (values) => {
    try {
      await create.mutateAsync({
        attendanceDate: values.attendanceDate,
        requestedCheckInAt: values.checkInTime
          ? combineLocal(values.attendanceDate, values.checkInTime)
          : undefined,
        requestedCheckOutAt: values.checkOutTime
          ? combineLocal(values.attendanceDate, values.checkOutTime)
          : undefined,
        reason: values.reason,
      });
      toast.success("Regularization submitted");
      form.reset({
        attendanceDate: yesterdayIso(),
        checkInTime: "",
        checkOutTime: "",
        reason: "",
      });
      setOpen(false);
    } catch (err) {
      const msg =
        err && typeof err === "object" && "message" in err
          ? String((err as { message: unknown }).message)
          : "Failed to submit request";
      toast.error(msg);
    }
  });

  const FieldError = ({
    name,
  }: {
    name: keyof CreateRegularizationFormValues;
  }) => {
    const err = form.formState.errors[name];
    if (!err?.message) return null;
    return (
      <p className="text-xs text-destructive mt-1">{String(err.message)}</p>
    );
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" className="w-full sm:w-auto">
          <CalendarClock className="h-4 w-4" />
          Request regularization
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Request regularization</DialogTitle>
          <DialogDescription>
            Ask your manager to correct missing or incorrect punches for a past
            day.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={onSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="attendanceDate">Date</Label>
            <Input
              id="attendanceDate"
              type="date"
              {...form.register("attendanceDate")}
            />
            <FieldError name="attendanceDate" />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="checkInTime">Check-in</Label>
              <Input
                id="checkInTime"
                type="time"
                {...form.register("checkInTime")}
              />
              <FieldError name="checkInTime" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="checkOutTime">Check-out</Label>
              <Input
                id="checkOutTime"
                type="time"
                {...form.register("checkOutTime")}
              />
              <FieldError name="checkOutTime" />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="reason">Reason</Label>
            <textarea
              id="reason"
              rows={3}
              className="flex min-h-[72px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
              placeholder="Explain why this correction is needed…"
              {...form.register("reason")}
            />
            <FieldError name="reason" />
          </div>

          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline">
                Cancel
              </Button>
            </DialogClose>
            <Button type="submit" disabled={create.isPending}>
              {create.isPending ? "Submitting…" : "Submit request"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
