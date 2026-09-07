/**
 * Mobile navigation arrival tracking.
 *
 * Used by {@link MobileBackButton} to decide between `router.back()` and a
 * fallback URL. The previous heuristic (`window.history.length <= 1`) was
 * unreliable: `history.length` counts ALL session entries (including forward
 * ones), so a deep-link from WhatsApp/SMS (length=2: blank tab + link) would
 * call `router.back()` and navigate the user OUT of the app to a blank page,
 * while a forward-then-back navigation would loop the user forward.
 *
 * This module tracks whether the CURRENT page was reached via an in-app
 * (client-side) navigation. The {@link NavigationTracker} component (mounted
 * in the mobile layout) sets a sessionStorage flag on every client-side route
 * change and clears it on full page loads (deep links, refreshes, external
 * referrals). `arrivedInternally()` reads that flag.
 *
 * Decision rule for the back button:
 *   - arrived internally  -> `router.back()`  (return to where the user came from)
 *   - deep-linked/refreshed -> `router.push(fallback)`  (go to the logical parent)
 */

export const INTERNAL_ARRIVAL_FLAG = "__nirman_internal_arrival";

/**
 * Normalize a pathname for comparison (strip trailing slash except for root,
 * ignore query/hash). The flag stores a normalized pathname so that
 * `/m/leads/` and `/m/leads` match.
 */
export function normalizePath(path: string): string {
  let p = path.split("?")[0]!.split("#")[0]!;
  if (p.length > 1 && p.endsWith("/")) p = p.slice(0, -1);
  return p;
}

/**
 * Returns true if the current page was reached via an in-app client-side
 * navigation (i.e. there is a safe history entry to go back to within the app).
 * Returns false for deep links, full reloads, and external referrals — in
 * those cases the back button should fall back to a logical parent URL.
 */
export function arrivedInternally(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const flag = sessionStorage.getItem(INTERNAL_ARRIVAL_FLAG);
    if (!flag) return false;
    return normalizePath(flag) === normalizePath(window.location.pathname);
  } catch (err) {
    console.warn("mobile-nav sessionStorage read failed:", err);
    return false;
  }
}
