"use client";

import { useRouter } from "next/navigation";
import { useCallback } from "react";

/**
 * Touch prefetch — the mobile equivalent of desktop hover prefetch.
 *
 * On touchstart, prefetch the route so by the time the user lifts their
 * finger (tap → click), the page is already loaded. This makes navigation
 * feel instant on mobile without the battery drain of prefetching every
 * link in the viewport.
 *
 * Usage:
 *   const prefetch = useTouchPrefetch();
 *   <Link href="/m/procurement/123" onTouchStart={prefetch("/m/procurement/123")}>…
 *
 * Or on a list wrapper:
 *   <div onTouchStart={prefetchHandler}>…</div>
 */
export function useTouchPrefetch() {
  const router = useRouter();

  return useCallback(
    (href: string) => () => {
      // Prefetch the route — Next.js will warm the cache so the
      // subsequent navigation is instant.
      router.prefetch(href);
    },
    [router],
  );
}

/**
 * Batch prefetch — prefetch multiple likely-next routes at once.
 * Useful for list pages where the user might tap any of the top N items.
 */
export function useBatchPrefetch() {
  const router = useRouter();

  return useCallback(
    (hrefs: string[]) => {
      for (const href of hrefs) {
        router.prefetch(href);
      }
    },
    [router],
  );
}
