"use client";

/**
 * Root error boundary for the admin app. Replaces the root layout when an
 * error escapes it, so it must render its own <html>/<body>. Kept dependency-
 * free (no providers available at this level) and self-styled.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}): React.ReactNode {
  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: "12px",
          padding: "24px",
          textAlign: "center",
          fontFamily:
            "ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
          background: "#0f172a",
          color: "#e2e8f0",
        }}
      >
        <p style={{ fontSize: "14px", color: "#94a3b8", margin: 0 }}>Staffly</p>
        <h1 style={{ fontSize: "24px", fontWeight: 600, margin: 0 }}>
          Something went wrong
        </h1>
        <p style={{ fontSize: "14px", color: "#94a3b8", maxWidth: "40ch" }}>
          The application hit an unexpected error. Please try again.
        </p>
        {error.digest ? (
          <p style={{ fontSize: "12px", color: "#64748b" }}>
            Reference: {error.digest}
          </p>
        ) : null}
        <button
          type="button"
          onClick={reset}
          style={{
            marginTop: "8px",
            borderRadius: "6px",
            border: "none",
            background: "#4f46e5",
            color: "#fff",
            padding: "8px 16px",
            fontSize: "14px",
            fontWeight: 500,
            cursor: "pointer",
          }}
        >
          Try again
        </button>
      </body>
    </html>
  );
}
