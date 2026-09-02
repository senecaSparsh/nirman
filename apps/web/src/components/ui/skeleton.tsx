import { cn } from "@/lib/utils";

/**
 * Skeleton — animated shimmer placeholder primitive (shadcn-style).
 *
 * Render with width/height utility classes, e.g.
 *   <Skeleton className="h-8 w-48" />
 */
function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      className={cn("animate-pulse rounded-md bg-muted", className)}
      {...props}
    />
  );
}

export { Skeleton };
