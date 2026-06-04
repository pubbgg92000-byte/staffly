"use client";

import {
  Badge,
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
} from "@staffly/ui";
import type { Holiday, HolidayType } from "@staffly/types";

const TYPE_TONE: Record<HolidayType, StatusTone> = {
  public: "info",
  restricted: "warning",
  optional: "muted",
  company: "success",
};

const TYPE_LABEL: Record<HolidayType, string> = {
  public: "Public",
  restricted: "Restricted",
  optional: "Optional",
  company: "Company",
};

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

export function HolidayDetailDialog({
  holiday,
  open,
  onOpenChange,
}: {
  holiday: Holiday | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}): React.ReactNode {
  if (!holiday) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>{holiday.name}</DialogTitle>
          <DialogDescription>{fmtDate(holiday.date)}</DialogDescription>
        </DialogHeader>

        <div className="space-y-3 text-sm">
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Type</span>
            <StatusBadge tone={TYPE_TONE[holiday.type]}>
              {TYPE_LABEL[holiday.type]}
            </StatusBadge>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Optional</span>
            {holiday.isOptional ? (
              <Badge variant="muted">Optional</Badge>
            ) : (
              <span className="font-medium">No</span>
            )}
          </div>
          {holiday.description ? (
            <>
              <Separator />
              <div>
                <p className="mb-1 text-muted-foreground">Details</p>
                <p className="whitespace-pre-wrap text-sm">
                  {holiday.description}
                </p>
              </div>
            </>
          ) : null}
        </div>

        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline">Close</Button>
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
