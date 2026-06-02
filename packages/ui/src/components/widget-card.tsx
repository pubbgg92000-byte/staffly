import type { ReactNode } from "react";
import { Skeleton } from "./ui/skeleton";
import { Button } from "./ui/button";
import { AlertCircle } from "lucide-react";
import { cn } from "../lib/cn";

/**
 * Shared wrapper for every dashboard widget. Centralizes the loading /
 * error / empty / populated four-state story so each widget can stay tiny.
 *
 *   <WidgetCard title="Headcount" loading={isLoading} error={err} onRetry={...}>
 *     ...
 *   </WidgetCard>
 */
export function WidgetCard({
  title,
  action,
  loading,
  error,
  empty,
  onRetry,
  children,
  className,
  colSpan,
}: {
  title: ReactNode;
  action?: ReactNode;
  loading?: boolean;
  error?: { message: string } | null;
  empty?: ReactNode;
  onRetry?: () => void;
  children?: ReactNode;
  className?: string;
  /** Optional column-span in the dashboard grid. */
  colSpan?: 1 | 2 | 3;
}): ReactNode {
  const spanCls =
    colSpan === 2
      ? "lg:col-span-2"
      : colSpan === 3
        ? "lg:col-span-3"
        : undefined;
  return (
    <section
      className={cn(
        "flex flex-col rounded-lg border bg-card text-card-foreground shadow-sm",
        spanCls,
        className,
      )}
    >
      <header className="flex items-center justify-between border-b px-5 py-4">
        <h2 className="text-sm font-semibold tracking-tight">{title}</h2>
        {action ? <div className="text-sm">{action}</div> : null}
      </header>
      <div className="flex-1 p-5">
        {loading ? (
          <div className="space-y-2">
            <Skeleton className="h-6 w-1/3" />
            <Skeleton className="h-4 w-1/2" />
            <Skeleton className="h-4 w-2/3" />
          </div>
        ) : error ? (
          <div className="flex items-start gap-3 text-sm">
            <AlertCircle className="mt-0.5 h-4 w-4 text-destructive" />
            <div className="flex-1">
              <p className="text-destructive">{error.message}</p>
              {onRetry ? (
                <Button
                  variant="link"
                  size="sm"
                  className="h-auto px-0"
                  onClick={onRetry}
                >
                  Retry
                </Button>
              ) : null}
            </div>
          </div>
        ) : empty !== undefined && empty !== null && empty !== false ? (
          <div className="text-sm text-muted-foreground">{empty}</div>
        ) : (
          children
        )}
      </div>
    </section>
  );
}
