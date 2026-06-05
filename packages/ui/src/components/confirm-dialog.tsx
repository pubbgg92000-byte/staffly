"use client";

import * as React from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "./ui/dialog";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { AlertTriangle, Trash2 } from "lucide-react";

export type ConfirmTone = "default" | "destructive" | "warning";

/**
 * Reusable confirmation dialog. Three modes, picked by props:
 *
 *  1. **Standard confirm** (low risk) — no `typeToConfirm`. A single button
 *     submits the action.
 *  2. **Typed confirmation** (medium risk) — pass `typeToConfirm="ARCHIVE"`.
 *     The user must type the exact string into an input before the confirm
 *     button enables. Comparison is case-sensitive.
 *  3. **High-risk typed confirmation** — same as (2) with `tone="destructive"`
 *     and a stronger sentinel like `"REMOVE_ADMIN"`. Visually distinct (red
 *     border, alert icon).
 *
 * `onConfirm` may return a Promise; the button shows `pendingLabel` while it
 * resolves and disables interaction. The dialog stays open if the promise
 * rejects so the caller can surface an error toast; close it manually via
 * `onOpenChange(false)` once the error is handled.
 */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  pendingLabel,
  tone = "default",
  typeToConfirm,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  pendingLabel?: string;
  tone?: ConfirmTone;
  /**
   * If set, the user must type this exact string before the confirm button
   * enables. Use for medium- and high-risk actions.
   */
  typeToConfirm?: string;
  onConfirm: () => void | Promise<void>;
}): React.ReactNode {
  const [typed, setTyped] = React.useState("");
  const [pending, setPending] = React.useState(false);

  // Reset typed value whenever the dialog opens so a previously-typed
  // sentinel doesn't auto-arm the button next time.
  React.useEffect(() => {
    if (open) {
      setTyped("");
      setPending(false);
    }
  }, [open]);

  const matchesSentinel = typeToConfirm ? typed === typeToConfirm : true;
  const canConfirm = matchesSentinel && !pending;

  const handleConfirm = async (): Promise<void> => {
    if (!canConfirm) return;
    setPending(true);
    try {
      await onConfirm();
    } finally {
      setPending(false);
    }
  };

  const ToneIcon =
    tone === "destructive" ? Trash2 : tone === "warning" ? AlertTriangle : null;

  const variant = tone === "destructive" ? "destructive" : "default";

  return (
    <Dialog open={open} onOpenChange={(o) => !pending && onOpenChange(o)}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {ToneIcon ? (
              <ToneIcon
                className={
                  tone === "destructive"
                    ? "h-5 w-5 text-destructive"
                    : "h-5 w-5 text-amber-500"
                }
              />
            ) : null}
            {title}
          </DialogTitle>
          {description ? (
            <DialogDescription className="pt-1">
              {description}
            </DialogDescription>
          ) : null}
        </DialogHeader>

        {typeToConfirm ? (
          <div className="space-y-2">
            <Label htmlFor="confirm-input">
              Type{" "}
              <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">
                {typeToConfirm}
              </code>{" "}
              to confirm
            </Label>
            <Input
              id="confirm-input"
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              placeholder={typeToConfirm}
              autoComplete="off"
              autoFocus
            />
          </div>
        ) : null}

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={pending}
          >
            {cancelLabel}
          </Button>
          <Button
            type="button"
            variant={variant}
            onClick={handleConfirm}
            disabled={!canConfirm}
          >
            {pending && pendingLabel ? pendingLabel : confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
