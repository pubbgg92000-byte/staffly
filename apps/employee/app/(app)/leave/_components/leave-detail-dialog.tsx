"use client";

import { useState } from "react";
import {
  Button,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
  Separator,
  StatusBadge,
  type StatusTone,
  toast,
  useCancelLeaveRequest,
} from "@staffly/ui";
import type { LeaveRequest } from "@staffly/types";
import { Trash2 } from "lucide-react";

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
    <div className="flex justify-between gap-2">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right font-medium">{value ?? "—"}</span>
    </div>
  );
}

export function LeaveDetailDialog({
  request: req,
  open,
  onOpenChange,
}: {
  request: LeaveRequest | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}): React.ReactNode {
  const [confirmCancel, setConfirmCancel] = useState(false);
  const cancel = useCancelLeaveRequest();

  if (!req) return null;

  const canCancel = req.status === "pending" || req.status === "approved";
  const units = Number(req.units);

  const handleCancel = async () => {
    try {
      await cancel.mutateAsync(req.id);
      toast.success("Leave request cancelled");
      setConfirmCancel(false);
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
            {fmtDate(req.startDate)}
            {req.startDate !== req.endDate ? ` – ${fmtDate(req.endDate)}` : ""}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 text-sm">
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Status</span>
            <StatusBadge tone={STATUS_TONE[req.status] ?? "muted"}>
              {STATUS_LABEL[req.status] ?? req.status}
            </StatusBadge>
          </div>

          <Row label="Units" value={`${units} day${units !== 1 ? "s" : ""}`} />
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

          {(req.decidedAt || req.cancelledAt) && (
            <>
              <Separator />
              {req.decidedAt ? (
                <>
                  <Row label="Decided" value={fmtDatetime(req.decidedAt)} />
                  {req.decisionComment ? (
                    <div>
                      <p className="mb-1 text-muted-foreground">Comment</p>
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
        </div>

        <DialogFooter>
          {canCancel && !confirmCancel ? (
            <Button
              variant="destructive"
              size="sm"
              onClick={() => setConfirmCancel(true)}
              disabled={cancel.isPending}
            >
              <Trash2 className="h-4 w-4" />
              Cancel request
            </Button>
          ) : confirmCancel ? (
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setConfirmCancel(false)}
              >
                Keep
              </Button>
              <Button
                variant="destructive"
                size="sm"
                onClick={handleCancel}
                disabled={cancel.isPending}
              >
                {cancel.isPending ? "Cancelling…" : "Yes, cancel"}
              </Button>
            </div>
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
