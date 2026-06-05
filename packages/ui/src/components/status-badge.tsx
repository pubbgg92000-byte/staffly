import type { ReactNode } from "react";
import { Badge } from "./ui/badge";
import { cn } from "../lib/cn";

/**
 * Status-aware badge. Always renders an icon + label pair so the meaning is
 * conveyed without relying on color alone (docs/04 §10 / a11y).
 */
export type StatusTone =
  | "success"
  | "warning"
  | "destructive"
  | "info"
  | "muted"
  | "archived";

export function StatusBadge({
  tone = "muted",
  icon,
  children,
  className,
}: {
  tone?: StatusTone;
  icon?: ReactNode;
  children: ReactNode;
  className?: string;
}): ReactNode {
  return (
    <Badge variant={tone} className={cn("gap-1.5", className)}>
      {icon ? <span aria-hidden>{icon}</span> : null}
      <span>{children}</span>
    </Badge>
  );
}
