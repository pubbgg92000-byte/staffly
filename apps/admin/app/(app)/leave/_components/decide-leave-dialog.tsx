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
  StatusBadge,
  type StatusTone,
  toast,
  useCancelLeaveRequest,
  useDecideLeaveRequest,
} from "@staffly/ui";
import type { LeaveRequest } from "@staffly/types";
import { Check, Trash2, X } from "lucide-react";

const STATUS_TONE: Record<string, StatusTone> = {
  pending: "warning",
  approved: "success",
  rejected: "destructive",
  cancelled: "muted",
};

const STATUS_LABEL: Record<string, string> = {
  pending: "Pending",
  approved: "Approved",
  rejected: "Rejected",
  cancelled: "Cancelled",
};

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function fmtDatetime(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function Row({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}): React.ReactNode {
  return (
    <div className="flex justify-between gap-2 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right font-medium">{value ?? "—"}</span>
    </div>
  );
}

export function DecideLeaveDialog({
  request: req,
  open,
  onOpenChange,
  employeeLabel,
}: {
  request: LeaveRequest | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  employeeLabel?: string;
}): React.ReactNode {
  const [comment, setComment] = useState("");
  const [confirmCancel, setConfirmCancel] = useState(false);
  const decide = useDecideLeaveRequest();
  const cancelReq = useCancelLeaveRequest();

  useEffect(() => {
    if (open) {
      setComment("");
      setConfirmCancel(false);
    }
  }, [open, req?.id]);

  if (!req) return null;

  const isPending = req.status === "pending";
  const canCancel = isPending || req.status === "approved";
  const units = Number(req.units);

  const submit = async (decision: "approved" | "rejected"): Promise<void> => {
    try {
      await decide.mutateAsync({
        id: req.id,
        decision,
        body: { comment: comment.trim() || undefined },
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

  const handleCancel = async () => {
    try {
      await cancelReq.mutateAsync(req.id);
      toast.success("Leave request cancelled");
      onOpenChange(false);
    } catch {
      toast.error("Failed to cancel request");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {req.leaveType.name}
            <span
              className="ml-2 inline-block h-2.5 w-2.5 rounded-full align-middle"
              style={{
                backgroundColor: req.leaveType.color ?? "#94A3B8",
              }}
            />
          </DialogTitle>
          <DialogDescription>
            {employeeLabel ? employeeLabel + " · " : ""}
            {fmtDate(req.startDate)}
            {req.startDate !== req.endDate ? ` – ${fmtDate(req.endDate)}` : ""}
            {" · "}
            {units} day{units !== 1 ? "s" : ""}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 text-sm">
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Status</span>
            <StatusBadge tone={STATUS_TONE[req.status] ?? "muted"}>
              {STATUS_LABEL[req.status] ?? req.status}
            </StatusBadge>
          </div>

          <Row label="Submitted" value={fmtDatetime(req.createdAt)} />

          {(req.halfDayStart || req.halfDayEnd) && (
            <Row
              label="Half days"
              value={
                [req.halfDayStart && "Start", req.halfDayEnd && "End"]
                  .filter(Boolean)
                  .join(", ") || "—"
              }
            />
          )}

          {req.reason ? (
            <>
              <Separator />
              <div>
                <p className="mb-1 text-muted-foreground">Reason</p>
                <p className="whitespace-pre-wrap rounded-md bg-muted/40 p-3 text-sm">
                  {req.reason}
                </p>
              </div>
            </>
          ) : null}

          {req.attachmentUrl ? (
            <Row
              label="Attachment"
              value={
                <a
                  href={req.attachmentUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary underline"
                >
                  View
                </a>
              }
            />
          ) : null}

          {(req.decidedAt || req.cancelledAt) && (
            <>
              <Separator />
              {req.decidedAt ? (
                <>
                  <Row label="Decided" value={fmtDatetime(req.decidedAt)} />
                  {req.decisionComment ? (
                    <div>
                      <p className="mb-1 text-muted-foreground">
                        Decision comment
                      </p>
                      <p className="rounded-md bg-muted/40 p-2 text-xs italic">
                        "{req.decisionComment}"
                      </p>
                    </div>
                  ) : null}
                </>
              ) : null}
              {req.cancelledAt ? (
                <Row label="Cancelled" value={fmtDatetime(req.cancelledAt)} />
              ) : null}
            </>
          )}

          {isPending ? (
            <div className="space-y-1.5">
              <Label htmlFor="decideComment">Comment (optional)</Label>
              <textarea
                id="decideComment"
                rows={2}
                className="flex min-h-[60px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                placeholder="Add a note for the employee…"
                value={comment}
                onChange={(e) => setComment(e.target.value)}
              />
            </div>
          ) : null}
        </div>

        <DialogFooter className="gap-2">
          {isPending ? (
            <>
              {canCancel && !confirmCancel ? (
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => setConfirmCancel(true)}
                  disabled={cancelReq.isPending}
                >
                  <Trash2 className="h-4 w-4" />
                  Cancel request
                </Button>
              ) : confirmCancel ? (
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={handleCancel}
                  disabled={cancelReq.isPending}
                >
                  {cancelReq.isPending ? "Cancelling…" : "Yes, cancel"}
                </Button>
              ) : null}
              <div className="flex-1" />
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
          ) : canCancel && !confirmCancel ? (
            <Button
              variant="destructive"
              size="sm"
              onClick={() => setConfirmCancel(true)}
              disabled={cancelReq.isPending}
            >
              <Trash2 className="h-4 w-4" />
              Cancel request
            </Button>
          ) : null}
          <DialogClose asChild>
            <Button variant="outline" size="sm">
              Close
            </Button>
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
