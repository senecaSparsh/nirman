"use client";

import { useState, useCallback } from "react";
import { useSearchParams, useRouter, usePathname } from "next/navigation";

/**
 * useUrlFilter — syncs a filter value to a URL search param.
 *
 * The filter persists across navigation: when the user navigates away
 * and comes back, the filter is restored from the URL. This solves the
 * "never lose place" requirement — a manager filtering to "pending
 * approvals", approving one, and returning to the list still sees the
 * pending approvals filter active.
 *
 * Derives the value directly from `searchParams` during render (no
 * `useEffect` sync loop), which avoids a cascading render on every
 * filter change. A small piece of local "pending" state holds the
 * optimistic value between the user's click and `router.replace`
 * propagating back to `useSearchParams` — typically one render cycle.
 *
 * Uses React's "adjust state during render" pattern (calling setState
 * conditionally during render when a prop changed) instead of an effect,
 * per https://react.dev/learn/you-might-not-need-an-effect — this
 * re-renders immediately without committing, so there's no flash.
 *
 * Usage:
 *   const [status, setStatus] = useUrlFilter("status", "ALL");
 *   // status is initialized from ?status=DRAFT (or "ALL" if not set)
 *   // setStatus("DRAFT") updates the URL to ?status=DRAFT
 *
 * @param key - the URL search param name
 * @param defaultValue - value used when the param is not in the URL
 */
export function useUrlFilter<T extends string>(
  key: string,
  defaultValue: T,
): [T, (value: T) => void] {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  const urlValue = searchParams.get(key) as T | null;
  const [pending, setPending] = useState<T | null>(null);
  const [prevUrlValue, setPrevUrlValue] = useState<T | null | undefined>(urlValue);

  // Clear the optimistic override once the URL has caught up so the
  // value reverts to being URL-derived (handles back/forward navigation
  // and external URL changes). This is the documented "adjust state
  // when a prop changes" pattern — not an effect, so no cascading render.
  if (urlValue !== prevUrlValue) {
    setPrevUrlValue(urlValue);
    setPending(null);
  }

  const value: T = pending ?? (urlValue ?? defaultValue);

  const update = useCallback(
    (newValue: T) => {
      setPending(newValue);
      const params = new URLSearchParams(searchParams.toString());
      if (newValue === defaultValue || !newValue) {
        params.delete(key);
      } else {
        params.set(key, newValue);
      }
      const qs = params.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [key, defaultValue, searchParams, router, pathname],
  );

  return [value, update];
}

/**
 * useUrlQuery — same as useUrlFilter but for free-text search queries.
 * Debounced URL updates to avoid thrashing on every keystroke.
 */
export function useUrlQuery(
  key: string = "q",
  defaultValue: string = "",
  debounceMs: number = 300,
): [string, (value: string) => void] {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  const urlValue = searchParams.get(key) ?? defaultValue;
  const [pending, setPending] = useState<string | null>(null);
  const [prevUrlValue, setPrevUrlValue] = useState<string | undefined>(urlValue);

  // Clear the optimistic override once the URL has caught up.
  if (urlValue !== prevUrlValue) {
    setPrevUrlValue(urlValue);
    setPending(null);
  }

  const value: string = pending ?? urlValue;

  const update = useCallback(
    (newValue: string) => {
      setPending(newValue);
      // Debounce the URL update
      const timeout = setTimeout(() => {
        const params = new URLSearchParams(searchParams.toString());
        if (!newValue) {
          params.delete(key);
        } else {
          params.set(key, newValue);
        }
        const qs = params.toString();
        router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
      }, debounceMs);
      return () => clearTimeout(timeout);
    },
    [key, searchParams, router, pathname, debounceMs],
  );

  return [value, update];
}
