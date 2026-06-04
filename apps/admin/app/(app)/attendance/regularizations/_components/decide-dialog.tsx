"use client";

import { useEffect, useState } from "react";
import {
  Button,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
  Label,
  Separator,
  toast,
  useDecideRegularization,
} from "@staffly/ui";
import type { AttendanceRegularization } from "@staffly/types";
import { Check, X } from "lucide-react";

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function fmtDateTime(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function DecideDialog({
  reg,
  open,
  onOpenChange,
  employeeLabel,
}: {
  reg: AttendanceRegularization | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  employeeLabel?: string;
}): React.ReactNode {
  const [comment, setComment] = useState("");
  const decide = useDecideRegularization();

  useEffect(() => {
    if (open) setComment("");
  }, [open, reg?.id]);

  if (!reg) return null;

  const submit = async (decision: "approved" | "rejected"): Promise<void> => {
    try {
      await decide.mutateAsync({
        id: reg.id,
        body: { decision, comment: comment.trim() || undefined },
      });
      toast.success(
        decision === "approved" ? "Request approved" : "Request rejected",
      );
      onOpenChange(false);
    } catch (err) {
      const msg =
        err && typeof err === "object" && "message" in err
          ? String((err as { message: unknown }).message)
          : "Failed to update request";
      toast.error(msg);
    }
  };

  const alreadyDecided = reg.status !== "pending";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Review regularization</DialogTitle>
          <DialogDescription>
            {employeeLabel ? employeeLabel + " · " : ""}
            {fmtDate(reg.attendanceDate)}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Requested check-in</span>
            <span className="font-medium">
              {fmtDateTime(reg.requestedCheckInAt)}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Requested check-out</span>
            <span className="font-medium">
              {fmtDateTime(reg.requestedCheckOutAt)}
            </span>
          </div>
          <Separator />
          <div>
            <p className="mb-1 text-muted-foreground">Reason</p>
            <p className="whitespace-pre-wrap rounded-md bg-muted/40 p-3 text-sm">
              {reg.reason}
            </p>
          </div>

          {alreadyDecided ? (
            <div className="rounded-md border bg-muted/30 p-3 text-xs text-muted-foreground">
              This request was already {reg.status}
              {reg.decidedAt ? ` on ${fmtDateTime(reg.decidedAt)}` : ""}.
              {reg.decisionComment ? (
                <>
                  <br />
                  <span className="italic">"{reg.decisionComment}"</span>
                </>
              ) : null}
            </div>
          ) : (
            <div className="space-y-1.5">
              <Label htmlFor="decideComment">Comment (optional)</Label>
              <textarea
                id="decideComment"
                rows={2}
                className="flex min-h-[60px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                placeholder="Add a note for the employee…"
                value={comment}
                onChange={(e) => setComment(e.target.value)}
              />
            </div>
          )}
        </div>

        <DialogFooter className="gap-2">
          {alreadyDecided ? (
            <DialogClose asChild>
              <Button variant="outline">Close</Button>
            </DialogClose>
          ) : (
            <>
              <Button
                variant="destructive"
                onClick={() => void submit("rejected")}
                disabled={decide.isPending}
              >
                <X className="h-4 w-4" />
                Reject
              </Button>
              <Button
                onClick={() => void submit("approved")}
                disabled={decide.isPending}
              >
                <Check className="h-4 w-4" />
                Approve
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
