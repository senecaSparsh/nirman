import { cn } from "@/lib/utils";

/**
 * Skeleton loading fallback for Suspense boundaries.
 *
 * Instead of a spinner, shows the SHAPE of the content that's loading —
 * pulsing bars that match the layout. This makes the loading feel faster
 * and less jarring (no layout shift when content arrives).
 *
 * Variants:
 * - "list" — for table/list pages (rows of varying width)
 * - "cards" — for card grid pages (grid of card-shaped skeletons)
 * - "board" — for kanban pages (columns of card skeletons)
 * - "default" — centered spinner (fallback for unknown layouts)
 */
export function PageLoading({
  label = "Loading…",
  variant = "default",
  className,
}: {
  label?: string;
  variant?: "default" | "list" | "cards" | "board";
  className?: string;
}) {
  if (variant === "list") {
    return (
      <div className={cn("space-y-1", className)}>
        {/* Header skeleton */}
        <div className="flex gap-4 px-4 py-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-3 flex-1 animate-pulse rounded bg-muted" style={{ maxWidth: `${60 + (i % 3) * 40}px` }} />
          ))}
        </div>
        {/* Row skeletons */}
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="flex gap-4 px-4 py-2.5">
            {Array.from({ length: 5 }).map((_, j) => (
              <div key={j} className="h-3 flex-1 animate-pulse rounded bg-muted/70" style={{ maxWidth: `${50 + ((i + j) % 4) * 30}px`, animationDelay: `${i * 50}ms` }} />
            ))}
          </div>
        ))}
      </div>
    );
  }

  if (variant === "cards") {
    return (
      <div className={cn("grid gap-2.5 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6", className)}>
        {Array.from({ length: 12 }).map((_, i) => (
          <div key={i} className="rounded-lg border border-border bg-card p-2.5">
            <div className="flex items-start justify-between gap-2">
              <div className="w-2/3">
                <div className="mb-1 h-2.5 w-14 animate-pulse rounded bg-muted" style={{ animationDelay: `${i * 50}ms` }} />
                <div className="h-3 w-20 animate-pulse rounded bg-muted" style={{ animationDelay: `${i * 50 + 50}ms` }} />
              </div>
              <div className="h-2 w-2 animate-pulse rounded-full bg-muted" />
            </div>
            <div className="mt-2 h-3 w-16 animate-pulse rounded bg-muted" style={{ animationDelay: `${i * 50 + 100}ms` }} />
            <div className="mt-1.5 h-2 w-12 animate-pulse rounded bg-muted" style={{ animationDelay: `${i * 50 + 150}ms` }} />
          </div>
        ))}
      </div>
    );
  }

  if (variant === "board") {
    return (
      <div className={cn("flex gap-3 overflow-x-auto pb-2", className)}>
        {Array.from({ length: 4 }).map((_, col) => (
          <div key={col} className="flex w-64 shrink-0 flex-col">
            <div className="mb-2 flex items-center gap-2 px-1">
              <div className="h-1.5 w-1.5 animate-pulse rounded-full bg-muted" style={{ animationDelay: `${col * 80}ms` }} />
              <div className="h-2.5 w-20 animate-pulse rounded bg-muted" style={{ animationDelay: `${col * 80 + 40}ms` }} />
            </div>
            <div className="space-y-2">
              {Array.from({ length: 3 }).map((_, row) => (
                <div key={row} className="rounded-lg border border-border bg-card p-3">
                  <div className="mb-1 h-2 w-12 animate-pulse rounded bg-muted" style={{ animationDelay: `${(col * 3 + row) * 60}ms` }} />
                  <div className="mb-2 h-3.5 w-32 animate-pulse rounded bg-muted" style={{ animationDelay: `${(col * 3 + row) * 60 + 30}ms` }} />
                  <div className="h-3 w-20 animate-pulse rounded bg-muted" style={{ animationDelay: `${(col * 3 + row) * 60 + 60}ms` }} />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    );
  }

  // Default — minimal centered label (no spinner, just text)
  return (
    <div className={cn("flex items-center justify-center py-20 text-meta text-muted-foreground", className)}>
      <span className="animate-pulse">{label}</span>
    </div>
  );
}
