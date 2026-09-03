import { cn } from "@/lib/utils";

/**
 * Skeleton — animated shimmer placeholder primitive (shadcn-style).
 *
 * Uses the shared `.skeleton` gradient-sweep utility so every loading
 * surface in the app — this primitive, `PageLoading`, `SkeletonRows` —
 * shimmers with one consistent motion instead of a mix of opacity-blink
 * and gradient-sweep. Render with width/height utility classes, e.g.
 *   <Skeleton className="h-8 w-48" />
 */
function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      className={cn("skeleton rounded-md", className)}
      {...props}
    />
  );
}

export { Skeleton };
