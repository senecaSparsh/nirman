import { MobileSkeletonList } from "@/components/mobile/mobile-skeleton";

/**
 * Root mobile loading fallback.
 *
 * Cascades to every /m/* route segment that doesn't define its own
 * loading.tsx. Uses the list skeleton (the most common mobile layout).
 * Form pages (new) and home/dashboard pages override with their own
 * loading.tsx that uses MobileSkeletonForm / MobileSkeletonHome.
 */
export default function Loading() {
  return <MobileSkeletonList rows={8} />;
}
