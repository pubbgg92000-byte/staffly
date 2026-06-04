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
  useApplyLeave,
} from "@staffly/ui";
import {
  ApplyLeaveSchema,
  type ApplyLeaveFormValues,
  type LeaveBalance,
} from "@staffly/types";
import { Plus } from "lucide-react";

const FRIENDLY_ERRORS: Record<string, string> = {
  "leave.overlap": "Overlaps with an existing request for the same dates.",
  "leave.insufficient_balance": "Not enough leave balance remaining.",
  "leave.units.invalid": "The selected dates produce zero leave units.",
  "leave.units.below_minimum":
    "Below the minimum units allowed for this leave type.",
  "leave.units.above_maximum":
    "Above the maximum units allowed for this leave type.",
  "leave.type.not_found": "The selected leave type was not found.",
  "employee.not_found": "Employee record not found.",
};

function friendlyMsg(msg: string | undefined): string | undefined {
  if (!msg) return undefined;
  return FRIENDLY_ERRORS[msg] ?? msg;
}

export function ApplyLeaveDialog({
  balances,
}: {
  balances: LeaveBalance[];
}): React.ReactNode {
  const [open, setOpen] = useState(false);
  const apply = useApplyLeave();

  const form = useForm<ApplyLeaveFormValues>({
    resolver: zodResolver(ApplyLeaveSchema),
    defaultValues: {
      leaveTypeId: "",
      startDate: "",
      endDate: "",
      halfDayStart: false,
      halfDayEnd: false,
      reason: "",
    },
  });

  const onSubmit = form.handleSubmit(async (values) => {
    try {
      await apply.mutateAsync({
        leaveTypeId: values.leaveTypeId,
        startDate: values.startDate,
        endDate: values.endDate,
        halfDayStart: values.halfDayStart,
        halfDayEnd: values.halfDayEnd,
        reason: values.reason,
      });
      toast.success("Leave request submitted");
      form.reset();
      setOpen(false);
    } catch (err) {
      const code =
        err && typeof err === "object" && "code" in err
          ? String((err as { code: unknown }).code)
          : undefined;
      toast.error(friendlyMsg(code) ?? "Failed to submit request");
    }
  });

  const FieldError = ({ name }: { name: keyof ApplyLeaveFormValues }) => {
    const err = form.formState.errors[name];
    if (!err?.message) return null;
    return (
      <p className="mt-1 text-xs text-destructive">{String(err.message)}</p>
    );
  };

  const selectedType = balances.find(
    (b) => b.leaveTypeId === form.watch("leaveTypeId"),
  );

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="h-4 w-4" />
          Apply for leave
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Apply for leave</DialogTitle>
          <DialogDescription>
            Select the leave type and dates. Weekends and holidays are
            automatically excluded.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={onSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="leaveTypeId">Leave type</Label>
            <select
              id="leaveTypeId"
              className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              {...form.register("leaveTypeId")}
            >
              <option value="">Select a type…</option>
              {balances.map((b) => (
                <option key={b.leaveTypeId} value={b.leaveTypeId}>
                  {b.leaveType.name}
                  {b.available != null ? ` (${b.available}d left)` : ""}
                </option>
              ))}
            </select>
            <FieldError name="leaveTypeId" />
            {selectedType ? (
              <p className="text-xs text-muted-foreground">
                {selectedType.allocated}d allocated · {selectedType.used}d used
                · {selectedType.pending}d pending · {selectedType.available}d
                available
              </p>
            ) : null}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="startDate">Start date</Label>
              <Input
                id="startDate"
                type="date"
                {...form.register("startDate")}
              />
              <FieldError name="startDate" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="endDate">End date</Label>
              <Input id="endDate" type="date" {...form.register("endDate")} />
              <FieldError name="endDate" />
            </div>
          </div>

          <div className="flex gap-4">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                className="h-4 w-4 rounded border-input"
                {...form.register("halfDayStart")}
              />
              Half-day start
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                className="h-4 w-4 rounded border-input"
                {...form.register("halfDayEnd")}
              />
              Half-day end
            </label>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="reason">Reason (optional)</Label>
            <textarea
              id="reason"
              rows={3}
              className="flex min-h-[72px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              placeholder="Brief reason for your leave…"
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
            <Button type="submit" disabled={apply.isPending}>
              {apply.isPending ? "Submitting…" : "Submit request"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
