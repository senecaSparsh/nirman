"use client";

import { useState, useEffect, useCallback } from "react";
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
  const [value, setValue] = useState<T>(urlValue ?? defaultValue);

  // Sync from URL → state (handles back/forward navigation)
  useEffect(() => {
    setValue(urlValue ?? defaultValue);
  }, [urlValue, defaultValue]);

  const update = useCallback(
    (newValue: T) => {
      setValue(newValue);
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
  const [value, setValue] = useState<string>(urlValue);

  // Sync from URL → state (handles back/forward navigation)
  useEffect(() => {
    setValue(searchParams.get(key) ?? defaultValue);
  }, [searchParams, key, defaultValue]);

  const update = useCallback(
    (newValue: string) => {
      setValue(newValue);
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
