"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { INTERNAL_ARRIVAL_FLAG, normalizePath } from "@/lib/mobile-nav";

/**
 * Tracks in-app (client-side) arrivals so that {@link MobileBackButton} can
 * distinguish "user navigated here from another app screen" (safe to
 * `router.back()`) from "user deep-linked / refreshed / came from outside"
 * (should fall back to a logical parent URL).
 *
 * Mount once in the mobile layout (`/m/*`). It persists across client-side
 * route changes (App Router keeps layout components mounted), so the
 * `prevPath` ref correctly distinguishes the first render (full page load) from
 * subsequent client-side navigations.
 *
 * - On the first render (full page load): clear any stale flag from a previous
 *   session. This covers deep links, reloads, and external referrals — all of
 *   which should use the back button's fallback, not `router.back()`.
 * - On every subsequent pathname change (client-side navigation): set the flag
 *   to the new pathname, marking it as "arrived at internally".
 */
export function NavigationTracker() {
  const pathname = usePathname();
  const prevPath = useRef<string | null>(null);

  useEffect(() => {
    if (prevPath.current === null) {
      // Full page load (deep link / refresh / external referral) — clear any
      // stale flag so the back button uses its fallback on this page.
      try {
        sessionStorage.removeItem(INTERNAL_ARRIVAL_FLAG);
      } catch {
        // ignore (private mode / sandboxed)
      }
    } else {
      // Client-side route change — mark the new page as arrived-at-internally.
      try {
        sessionStorage.setItem(INTERNAL_ARRIVAL_FLAG, normalizePath(pathname));
      } catch {
        // ignore
      }
    }
    prevPath.current = normalizePath(pathname);
  }, [pathname]);

  return null;
}
