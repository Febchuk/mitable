type PageLoadingProps = {
  label?: string;
};

/** A shared page-shaped placeholder for route loading boundaries. */
export function PageLoading({ label = "Loading page…" }: PageLoadingProps) {
  return (
    <main className="min-h-[50vh] px-5 py-8 sm:px-8" role="status" aria-live="polite">
      <span className="sr-only">{label}</span>
      <div className="mb-8 h-7 w-44 animate-pulse rounded bg-muted" />
      <div className="mb-3 h-4 w-72 max-w-full animate-pulse rounded bg-muted" />
      <div className="rounded-2xl border border-border bg-surface p-5">
        <div className="mb-6 h-5 w-40 animate-pulse rounded bg-muted" />
        <div className="space-y-3">
          <div className="h-4 w-full animate-pulse rounded bg-muted" />
          <div className="h-4 w-11/12 animate-pulse rounded bg-muted" />
          <div className="h-4 w-4/5 animate-pulse rounded bg-muted" />
        </div>
      </div>
    </main>
  );
}
