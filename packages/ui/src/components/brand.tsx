import { cn } from "../lib/cn";

/**
 * Word-mark. Wired to read the tenant's primary color in a later phase
 * (currently uses the token fallback). Sized via `size` prop.
 */
export function Brand({
  size = "md",
  className,
  portalLabel,
}: {
  size?: "sm" | "md" | "lg";
  className?: string;
  /** Optional portal sub-label, e.g. "Admin" or "Employee". */
  portalLabel?: string;
}): React.ReactNode {
  const heightCls =
    size === "sm" ? "h-6 w-6" : size === "lg" ? "h-9 w-9" : "h-8 w-8";
  const textCls =
    size === "sm" ? "text-sm" : size === "lg" ? "text-xl" : "text-base";
  return (
    <span
      className={cn("inline-flex items-center gap-2 font-semibold", className)}
    >
      <span
        className={cn(
          "grid place-items-center rounded-md bg-primary font-semibold text-primary-foreground",
          heightCls,
        )}
        aria-hidden
      >
        S
      </span>
      <span className={cn("tracking-tight", textCls)}>
        Staffly
        {portalLabel ? (
          <span className="ml-1.5 text-xs font-normal text-muted-foreground">
            {portalLabel}
          </span>
        ) : null}
      </span>
    </span>
  );
}
