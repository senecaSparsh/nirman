import { Skeleton } from "@/components/ui/skeleton";

/**
 * Root desktop loading fallback.
 *
 * Next.js cascades this to every desktop route segment that doesn't
 * define its own loading.tsx. Shows the shape of a standard list page
 * (header bar + content block) so the loading feels fast and structural
 * rather than a blank screen or spinner.
 */
export default function Loading() {
  return (
    <div className="space-y-4 p-6">
      <Skeleton className="h-8 w-48" />
      <Skeleton className="h-64 w-full" />
    </div>
  );
}
