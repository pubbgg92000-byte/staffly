import type { ReactNode } from "react";
import { cn } from "../lib/cn";

/**
 * Headline number card for dashboards (docs/04 §6.5). Optional delta line
 * rendered with semantic color and an arrow glyph.
 */
export function StatCard({
  label,
  value,
  delta,
  icon,
  href,
  className,
}: {
  label: ReactNode;
  value: ReactNode;
  delta?: { value: ReactNode; tone?: "positive" | "negative" | "neutral" };
  icon?: ReactNode;
  href?: string;
  className?: string;
}): ReactNode {
  const body = (
    <div
      className={cn(
        "flex h-full flex-col justify-between rounded-lg border bg-card p-5 text-card-foreground shadow-sm transition-colors",
        href ? "hover:bg-accent/40" : undefined,
        className,
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm font-medium text-muted-foreground">{label}</p>
        {icon ? <span className="text-muted-foreground">{icon}</span> : null}
      </div>
      <div className="mt-3 flex items-baseline gap-2 tabular-nums">
        <span className="text-3xl font-semibold">{value}</span>
        {delta ? (
          <span
            className={cn(
              "text-xs font-medium",
              delta.tone === "positive"
                ? "text-success"
                : delta.tone === "negative"
                  ? "text-destructive"
                  : "text-muted-foreground",
            )}
          >
            {delta.value}
          </span>
        ) : null}
      </div>
    </div>
  );
  if (href) {
    return (
      <a href={href} className="block h-full focus:outline-none">
        {body}
      </a>
    );
  }
  return body;
}
