"use client";

import Link from "next/link";

/**
 * Route-segment error boundary for the employee app. Catches render/runtime
 * errors below the root layout while keeping the app shell mounted.
 * `reset()` re-renders the segment to retry.
 */
export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}): React.ReactNode {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3 p-6 text-center">
      <p className="text-sm font-medium text-muted-foreground">
        Something went wrong
      </p>
      <h1 className="text-2xl font-semibold">We hit an unexpected error</h1>
      <p className="max-w-prose text-sm text-muted-foreground">
        The page failed to load. You can try again, or head back to the
        dashboard.
      </p>
      {error.digest ? (
        <p className="text-xs text-muted-foreground/70">
          Reference: {error.digest}
        </p>
      ) : null}
      <div className="mt-2 flex gap-2">
        <button
          type="button"
          onClick={reset}
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
        >
          Try again
        </button>
        <Link
          href="/dashboard"
          className="rounded-md border px-4 py-2 text-sm font-medium hover:bg-accent"
        >
          Go to dashboard
        </Link>
      </div>
    </div>
  );
}
