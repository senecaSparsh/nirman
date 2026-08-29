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
        "animate-pulse rounded-[0.375rem]",
        className,
      )}
    />
  );
}

export function SkeletonCard({ className }: { className?: string }) {
  return (
    <div className={cn("animate-pulse rounded-[0.625rem] border p-3", className)}>
      <div className="flex items-center gap-3">
        <SkeletonLine className="h-8 w-8 shrink-0 rounded-[0.375rem]" />
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
        <div key={i} className="animate-pulse rounded-[0.625rem] border p-2.5">
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
      <div className="animate-pulse px-4 py-3 border-b">
        <SkeletonLine className="h-6 w-32" />
        <SkeletonLine className="mt-1.5 h-3 w-24" />
      </div>
      <div className="divide-y divide-line">
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
      <div className="animate-pulse px-4 py-3 border-b">
        <SkeletonLine className="h-6 w-28" />
        <SkeletonLine className="mt-1.5 h-3 w-20" />
      </div>
      <SkeletonStatGrid />
      <div className="space-y-1.5 px-3">
        <SkeletonLine className="h-11 w-full rounded-[0.625rem]" />
        <SkeletonLine className="h-11 w-full rounded-[0.625rem]" />
      </div>
      <div className="mt-3.5 divide-y divide-line">
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
      <div className="animate-pulse px-4 py-3 border-b">
        <SkeletonLine className="h-6 w-32" />
      </div>
      <div className="space-y-4 px-4 py-4">
        {Array.from({ length: fields }).map((_, i) => (
          <div key={i}>
            <SkeletonLine className="mb-1.5 h-3 w-20" />
            <SkeletonLine className="h-11 w-full rounded-[0.375rem]" />
          </div>
        ))}
      </div>
    </div>
  );
}

/** Detail page skeleton — hero card + key-value grid + action bar */
export function MobileSkeletonDetail({ sections = 3 }: { sections?: number }) {
  return (
    <div>
      {/* Hero card */}
      <div className="animate-pulse px-4 py-4 border-b">
        <div className="flex items-start gap-3">
          <SkeletonLine className="h-11 w-11 shrink-0 rounded-[0.625rem]" />
          <div className="flex-1 space-y-2">
            <SkeletonLine className="h-5 w-2/3" />
            <SkeletonLine className="h-3 w-1/2" />
            <SkeletonLine className="h-3 w-1/3" />
          </div>
        </div>
      </div>

      {/* Key-value grid */}
      <div className="grid grid-cols-2 gap-px bg-border/30">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="animate-pulse p-3 space-y-1.5">
            <SkeletonLine className="h-2.5 w-12" />
            <SkeletonLine className="h-4 w-20" />
          </div>
        ))}
      </div>

      {/* Content sections */}
      {Array.from({ length: sections }).map((_, i) => (
        <div key={i} className="animate-pulse px-4 py-3 border-t space-y-2">
          <SkeletonLine className="h-4 w-24" />
          <SkeletonLine className="h-3 w-full" />
          <SkeletonLine className="h-3 w-5/6" />
          <SkeletonLine className="h-3 w-3/4" />
        </div>
      ))}

      {/* Action bar placeholder */}
      <div className="animate-pulse px-4 py-3 mt-4 border-t">
        <SkeletonLine className="h-11 w-full rounded-[0.625rem]" />
      </div>
    </div>
  );
}
