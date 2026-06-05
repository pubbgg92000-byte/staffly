"use client";

import { ConfirmDialog } from "@staffly/ui";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  noun: string;
  description?: string;
  onConfirm: () => void | Promise<void>;
  isPending: boolean;
}

/**
 * Thin wrapper over the shared ConfirmDialog. Kept as a named local component
 * so the three org-structure views can call it with their `noun` semantics
 * (department / team / designation / location) without inlining ConfirmDialog
 * props each time.
 */
export function DeleteConfirmDialog({
  open,
  onOpenChange,
  noun,
  description,
  onConfirm,
  isPending,
}: Props): React.ReactNode {
  return (
    <ConfirmDialog
      open={open}
      onOpenChange={onOpenChange}
      tone="destructive"
      title={`Delete this ${noun}?`}
      description={
        description ??
        `This will soft-delete the ${noun}. Employees assigned to it keep their references.`
      }
      confirmLabel="Delete"
      pendingLabel={isPending ? "Deleting…" : undefined}
      onConfirm={onConfirm}
    />
  );
}
