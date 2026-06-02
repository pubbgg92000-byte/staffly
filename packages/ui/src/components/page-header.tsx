import type { ReactNode } from "react";
import { cn } from "../lib/cn";

/**
 * Page-level header used at the top of every authenticated screen. Matches
 * docs/04 §6.4 (PageHeader). Subtitle and actions are optional.
 */
export function PageHeader({
  title,
  subtitle,
  actions,
  className,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  className?: string;
}): ReactNode {
  return (
    <header
      className={cn(
        "flex flex-col gap-2 pb-6 md:flex-row md:items-end md:justify-between",
        className,
      )}
    >
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {subtitle ? (
          <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>
        ) : null}
      </div>
      {actions ? (
        <div className="flex items-center gap-2">{actions}</div>
      ) : null}
    </header>
  );
}
