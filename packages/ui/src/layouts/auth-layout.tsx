import type { ReactNode } from "react";
import { Brand } from "../components/brand";
import { cn } from "../lib/cn";

/**
 * Centered-card auth shell (docs/05 § AuthLayout). Used for sign-in,
 * forgot/reset, 2FA, accept-invite on both portals. No sidebar, no topbar.
 */
export function AuthLayout({
  children,
  portalLabel,
  className,
}: {
  children: ReactNode;
  portalLabel?: string;
  className?: string;
}): ReactNode {
  return (
    <div
      className={cn(
        "flex min-h-screen flex-col items-center justify-center bg-muted/40 px-4 py-12",
        className,
      )}
    >
      <div className="mb-8">
        <Brand size="lg" portalLabel={portalLabel} />
      </div>
      <main className="w-full max-w-sm">
        <div className="rounded-lg border bg-card p-6 shadow-sm sm:p-8">
          {children}
        </div>
      </main>
      <p className="mt-6 text-xs text-muted-foreground">
        &copy; {new Date().getFullYear()} Staffly
      </p>
    </div>
  );
}
