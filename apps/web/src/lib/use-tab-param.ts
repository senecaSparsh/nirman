"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useMemo } from "react";

/**
 * ═══════════════════════════════════════════════════════════════════
 * useTabParam — put the active tab in the URL.
 *
 * Every hub in this app used to hold its active tab in `useState`. That
 * looks harmless and breaks four things people do constantly:
 *
 *   · Refresh          → you're thrown back to the first tab.
 *   · Back button      → leaves the page entirely instead of the tab.
 *   · Sharing a link   → "look at the Variance tab" can't be sent.
 *   · Deep-linking     → nothing else in the app can link to a tab, so
 *                        flows like "receive → issue this material" have
 *                        to hack around it.
 *
 * The tab is a *location*, so it belongs in the address bar. This hook
 * makes that a one-line change at each call site:
 *
 *     const [tab, setTab] = useTabParam(TABS, "overview");
 *
 * Notes on the implementation:
 *  · The value is validated against the allowed list, so a hand-edited
 *    `?tab=nonsense` degrades to the default rather than rendering an
 *    empty page.
 *  · Switching to the default tab *removes* the param, keeping the
 *    canonical URL clean (`/projects/x`, not `/projects/x?tab=overview`).
 *  · `scroll: false` — changing tab must not jump you to the top of the
 *    page; you're staying in the same place, just looking at another
 *    facet of it.
 *  · `replace` is opt-in per call. Default is `push`, so the browser back
 *    button walks back through the tabs you visited, which is what
 *    people expect after clicking four of them.
 * ═══════════════════════════════════════════════════════════════════
 */
export function useTabParam<T extends string>(
  allowed: readonly T[],
  fallback: T,
  options?: {
    /** Query-string key. Defaults to "tab" — use another for a second tab strip. */
    param?: string;
    /** Replace history instead of pushing. Use for view toggles, not navigation. */
    replace?: boolean;
  },
): [T, (next: T) => void] {
  const param = options?.param ?? "tab";
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const raw = searchParams.get(param);
  // `allowed` is typically an inline literal, so compare by content, not identity.
  const allowedKey = allowed.join(",");
  const value = useMemo<T>(
    () => (raw && (allowed as readonly string[]).includes(raw) ? (raw as T) : fallback),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [raw, fallback, allowedKey],
  );

  const setValue = useCallback(
    (next: T) => {
      const params = new URLSearchParams(searchParams.toString());
      if (next === fallback) params.delete(param);
      else params.set(param, next);
      const qs = params.toString();
      const url = qs ? `${pathname}?${qs}` : pathname;
      if (options?.replace) router.replace(url, { scroll: false });
      else router.push(url, { scroll: false });
    },
    [searchParams, pathname, param, fallback, router, options?.replace],
  );

  return [value, setValue];
}

/**
 * The same idea for any single query-string value a view needs to
 * remember — a location filter, a date range preset, a status filter.
 *
 * Filters belong in the URL for exactly the reasons tabs do: an
 * accountant who has filtered the ledger to one project and one quarter
 * should be able to send that screen to someone else.
 */
export function useQueryParam(
  key: string,
  fallback = "",
): [string, (next: string) => void] {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const value = searchParams.get(key) ?? fallback;

  const setValue = useCallback(
    (next: string) => {
      const params = new URLSearchParams(searchParams.toString());
      if (!next || next === fallback) params.delete(key);
      else params.set(key, next);
      const qs = params.toString();
      // Filters use `replace`: twelve filter tweaks should not mean
      // twelve presses of the back button to leave the page.
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [searchParams, pathname, key, fallback, router],
  );

  return [value, setValue];
}
