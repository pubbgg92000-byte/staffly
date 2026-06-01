export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col items-start justify-center gap-3 px-6">
      <span className="rounded-full bg-secondary px-2.5 py-0.5 text-xs font-medium text-secondary-foreground">
        Sprint 0 · Batch 1
      </span>
      <h1 className="text-3xl font-semibold tracking-tight">Staffly</h1>
      <p className="text-muted-foreground">
        The employee self-service portal. Sign-in and dashboards arrive in later
        batches.
      </p>
    </main>
  );
}
