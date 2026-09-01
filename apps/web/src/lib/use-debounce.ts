"use client";

import { useEffect, useState } from "react";

/**
 * useDebounce — returns a debounced copy of `value` that only updates
 * after `delay` ms have passed without changes.
 *
 * Usage:
 *   const [query, setQuery] = useState("");
 *   const debouncedQuery = useDebounce(query, 300);
 *   useEffect(() => { searchApi(debouncedQuery); }, [debouncedQuery]);
 *
 * Replaces the ad-hoc setTimeout/clearTimeout debounce pattern used in
 * hsn-sac-search.tsx, use-url-filter.ts, and MobileNewMaterialDialog.tsx.
 */
export function useDebounce<T>(value: T, delay: number = 300): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);

  return debounced;
}
