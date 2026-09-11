/**
 * Mobile navigation back-button logic.
 *
 * The back button should call `router.back()` when there's a real previous
 * page in the browser history (user navigated within the app), and fall back
 * to a logical parent URL when there isn't (deep link, refresh, external
 * referral).
 *
 * Previous approaches tried to track this state with sessionStorage flags
 * and depth counters, but both had issues:
 * - The pathname-flag approach set the flag on the destination page after
 *   `router.back()`, causing the next back click to navigate OUT of the app.
 * - The depth-counter approach relied on `popstate` to distinguish forward
 *   from back navigations, but `popstate` fires for BOTH directions and has
 *   timing issues with React's effect lifecycle.
 *
 * The current approach is simpler and more reliable: always try
 * `router.back()` first, then detect if it actually navigated by listening
 * for the `popstate` event. If `popstate` fires within 150ms, the
 * navigation worked. If it doesn't fire, `router.back()` was a no-op (no
 * history entry to go back to), so we call the fallback.
 *
 * This requires no state tracking, no sessionStorage, and no lifecycle
 * dependencies — it works correctly regardless of how the user arrived at
 * the current page.
 */

/**
 * Normalize a pathname for comparison (strip trailing slash except for root,
 * ignore query/hash).
 */
export function normalizePath(path: string): string {
  let p = path.split("?")[0]!.split("#")[0]!;
  if (p.length > 1 && p.endsWith("/")) p = p.slice(0, -1);
  return p;
}

/**
 * Smart back navigation: tries `router.back()` first, and if it doesn't
 * actually navigate (no `popstate` event within 150ms), calls the fallback.
 *
 * This handles all cases correctly:
 *  - User navigated A → B within the app: `router.back()` works, popstate
 *    fires, fallback is NOT called. User goes back to A.
 *  - User deep-linked/refreshed (no history): `router.back()` is a no-op,
 *    popstate doesn't fire, fallback IS called after 150ms.
 *  - User came from an external site: `router.back()` navigates to the
 *    external page, which unloads the current page. The fallback never
 *    fires (page is gone), which is the correct behavior — the user goes
 *    back to where they came from.
 *
 * @param back Function that calls router.back() / history.back()
 * @param fallback Function to call if back() doesn't navigate
 * @param timeoutMs How long to wait for popstate before falling back (default 150ms)
 */
export function smartBack(
  back: () => void,
  fallback: () => void,
  timeoutMs = 150,
): void {
  if (typeof window === "undefined") {
    // SSR — just call the fallback
    fallback();
    return;
  }

  let didNavigate = false;

  const onPopState = () => {
    didNavigate = true;
    cleanup();
  };
  const cleanup = () => {
    window.removeEventListener("popstate", onPopState);
  };

  window.addEventListener("popstate", onPopState);

  // Call router.back() — if there's a history entry, the browser fires
  // popstate synchronously (or within a microtask), which sets didNavigate.
  back();

  // Safety net: if popstate didn't fire within the timeout, router.back()
  // was a no-op (no history to go back to). Clean up and use the fallback.
  setTimeout(() => {
    cleanup();
    if (!didNavigate) {
      fallback();
    }
  }, timeoutMs);
}
