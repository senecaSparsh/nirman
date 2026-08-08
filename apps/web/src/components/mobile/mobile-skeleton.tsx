import { cn } from "@/lib/utils";

/**
 * MobileSkeleton — animated shimmer placeholders that match content layout.
 *
 * Why this matters: on a job site with slow 3G, the user sees "Loading…"
 * text for 2-5 seconds. A skeleton that mirrors the content shape tells
 * the brain "this is loading, here's what's coming" — perceived performance
 * doubles even when actual load time is the same.
 *
 * Usage: pick a variant that matches the page's content layout, or compose
 * individual <SkeletonLine> / <SkeletonCard> blocks.
 */

export function SkeletonLine({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "animate-pulse rounded-md bg-muted/60",
        className,
      )}
    />
  );
}

export function SkeletonCard({ className }: { className?: string }) {
  return (
    <div className={cn("animate-pulse rounded-lg border border-border/50 bg-card p-3", className)}>
      <div className="flex items-center gap-3">
        <SkeletonLine className="h-8 w-8 shrink-0 rounded-md" />
        <div className="flex-1 space-y-2">
          <SkeletonLine className="h-4 w-3/4" />
          <SkeletonLine className="h-3 w-1/2" />
        </div>
        <SkeletonLine className="h-4 w-12" />
      </div>
    </div>
  );
}

export function SkeletonStatGrid() {
  return (
    <div className="grid grid-cols-2 gap-2 p-3">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="animate-pulse rounded-lg border border-border/50 bg-card p-2.5">
          <SkeletonLine className="mb-1.5 h-3 w-16" />
          <SkeletonLine className="h-5 w-20" />
        </div>
      ))}
    </div>
  );
}

/** List page skeleton — header + N rows */
export function MobileSkeletonList({ rows = 5 }: { rows?: number }) {
  return (
    <div>
      <div className="animate-pulse px-4 py-3 border-b border-border/50">
        <SkeletonLine className="h-6 w-32" />
        <SkeletonLine className="mt-1.5 h-3 w-24" />
      </div>
      <div className="divide-y divide-border/30">
        {Array.from({ length: rows }).map((_, i) => (
          <SkeletonCard key={i} className="rounded-none border-0" />
        ))}
      </div>
    </div>
  );
}

/** Home page skeleton — stats + CTAs + list */
export function MobileSkeletonHome() {
  return (
    <div>
      <div className="animate-pulse px-4 py-3 border-b border-border/50">
        <SkeletonLine className="h-6 w-28" />
        <SkeletonLine className="mt-1.5 h-3 w-20" />
      </div>
      <SkeletonStatGrid />
      <div className="space-y-1.5 px-3">
        <SkeletonLine className="h-11 w-full rounded-lg" />
        <SkeletonLine className="h-11 w-full rounded-lg" />
      </div>
      <div className="mt-3.5 divide-y divide-border/30">
        {Array.from({ length: 4 }).map((_, i) => (
          <SkeletonCard key={i} className="rounded-none border-0" />
        ))}
      </div>
    </div>
  );
}

/** Form page skeleton — header + form fields */
export function MobileSkeletonForm({ fields = 4 }: { fields?: number }) {
  return (
    <div>
      <div className="animate-pulse px-4 py-3 border-b border-border/50">
        <SkeletonLine className="h-6 w-32" />
      </div>
      <div className="space-y-4 px-4 py-4">
        {Array.from({ length: fields }).map((_, i) => (
          <div key={i}>
            <SkeletonLine className="mb-1.5 h-3 w-20" />
            <SkeletonLine className="h-11 w-full rounded-md" />
          </div>
        ))}
      </div>
    </div>
  );
}
