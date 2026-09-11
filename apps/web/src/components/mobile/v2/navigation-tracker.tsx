"use client";

/**
 * NavigationTracker is no longer used — the back button now uses the
 * `smartBack()` utility (try router.back(), fall back if popstate doesn't
 * fire) instead of tracking navigation state in sessionStorage.
 *
 * This file is kept as a no-op for backward compatibility in case any
 * imports remain. It can be safely deleted once all imports are removed.
 */
export function NavigationTracker() {
  return null;
}
