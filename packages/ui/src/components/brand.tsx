"use client";

import { useSession } from "../api/session";
import { cn } from "../lib/cn";

/**
 * Word-mark. Wired to the tenant's logo and display name from the session
 * payload — falls back to the static "Staffly" wordmark for signed-out
 * surfaces (auth pages) or while `/auth/me` is in flight.
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
  const { data: session } = useSession();
  const org = session?.organization;
  const heightCls =
    size === "sm" ? "h-6 w-6" : size === "lg" ? "h-9 w-9" : "h-8 w-8";
  const textCls =
    size === "sm" ? "text-sm" : size === "lg" ? "text-xl" : "text-base";
  const displayName = org?.name ?? "Staffly";
  return (
    <span
      className={cn("inline-flex items-center gap-2 font-semibold", className)}
    >
      {org?.logoUrl ? (
        <img
          src={org.logoUrl}
          alt=""
          aria-hidden
          className={cn("rounded-md object-contain", heightCls)}
        />
      ) : (
        <span
          className={cn(
            "grid place-items-center rounded-md bg-primary font-semibold text-primary-foreground",
            heightCls,
          )}
          aria-hidden
        >
          {displayName.charAt(0).toUpperCase()}
        </span>
      )}
      <span className={cn("tracking-tight", textCls)}>
        {displayName}
        {portalLabel ? (
          <span className="ml-1.5 text-xs font-normal text-muted-foreground">
            {portalLabel}
          </span>
        ) : null}
      </span>
    </span>
  );
}
