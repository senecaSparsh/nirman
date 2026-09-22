"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * useFetch — a lightweight data-fetching hook with:
 *
 *   1. Stale-while-revalidate — shows cached data immediately, then
 *      refreshes in the background. The user never sees a blank screen
 *      after the first load.
 *   2. Auto-retry — retries on network errors with exponential backoff
 *      (500ms, 1.5s, 3s). Business errors (4xx) are not retried.
 *   3. Error recovery — returns { retry } to manually re-fetch.
 *   4. Optional polling — set `pollMs` to re-fetch on an interval.
 *   5. Conditional fetching — set `skip` to pause fetching.
 *
 * This is NOT a full SWR/React Query replacement. It's a 100-line hook
 * that covers the 80% case without adding a dependency. For complex
 * caching needs (optimistic mutations, invalidation keys, pagination),
 * consider migrating to SWR.
 *
 * Usage:
 *   const { data, error, loading, retry } = useFetch("/api/sales");
 *   if (loading && !data) return <Skeleton />;
 *   if (error) return <ErrorState onRetry={retry} />;
 *   return <SalesList data={data} />;
 */

interface UseFetchOptions {
  /** Skip fetching entirely (e.g. until a dependency is ready). */
  skip?: boolean;
  /** Re-fetch on this interval (ms). Default: off. */
  pollMs?: number;
  /** Max retry attempts on network errors. Default: 2. */
  maxRetries?: number;
  /** Disable stale-while-revalidate (always show loading on refetch). */
  noCache?: boolean;
}

interface UseFetchResult<T> {
  data: T | null;
  error: string | null;
  loading: boolean;
  /** True while revalidating with stale data visible. */
  isValidating: boolean;
  retry: () => void;
}

const RETRY_DELAYS = [500, 1500, 3000];

// Simple in-memory cache (survives navigation, cleared on page reload).
// Bounded at MAX_CACHE_ENTRIES — without a bound, a long session
// accumulates every API response ever fetched in device memory.
const memoryCache = new Map<string, { data: unknown; timestamp: number }>();
const MAX_CACHE_ENTRIES = 100;
// Entries are optimistic read-cache only — a fresh read always revalidates
// in the background. STALE_MS caps how old an entry may be before it's
// ignored entirely (a save older than this can never flash stale data).
const STALE_MS = 30_000;

// The cache is keyed by URL only — not user/company — so a company switch
// would briefly serve the previous tenant's data until revalidation.
// Drop everything when the switch event fires. Sign-out needs no listener:
// it hard-redirects, which drops the whole JS heap.
if (typeof window !== "undefined") {
  window.addEventListener("nirman-company-switched", () => memoryCache.clear());

  // Any successful write can invalidate any cached read — clear the whole
  // map rather than guessing which URLs the mutation touched. Over-eviction
  // just means the next mount fetches fresh — exactly right after a save.
  // Wrap fetch once per page-load.
  if (!(window as unknown as { __nirmanFetchWrapped?: boolean }).__nirmanFetchWrapped) {
    (window as unknown as { __nirmanFetchWrapped?: boolean }).__nirmanFetchWrapped = true;
    const origFetch = window.fetch.bind(window);
    window.fetch = async (...args: Parameters<typeof fetch>) => {
      const res = await origFetch(...args);
      try {
        const init = args[1] as RequestInit | undefined;
        const method = (
          init?.method ??
          (args[0] instanceof Request ? args[0].method : "GET")
        ).toUpperCase();
        if (method !== "GET" && method !== "HEAD" && res.ok) {
          memoryCache.clear();
          // SWR holds its own client cache — revalidate every key so a
          // successful write can't leave a stale view behind.
          void import("swr").then(({ mutate }) => mutate(() => true, undefined, { revalidate: true })).catch(() => {});
        }
      } catch { /* cache hygiene must never break a request */ }
      return res;
    };
  }
}

function cacheSet(url: string, data: unknown) {
  if (memoryCache.size >= MAX_CACHE_ENTRIES && !memoryCache.has(url)) {
    // Map iterates in insertion order — evict the oldest-inserted key.
    const oldest = memoryCache.keys().next().value;
    if (oldest !== undefined) memoryCache.delete(oldest);
  }
  memoryCache.set(url, { data, timestamp: Date.now() });
}

export function useFetch<T = unknown>(
  url: string | null,
  options: UseFetchOptions = {},
): UseFetchResult<T> {
  const { skip = false, pollMs, maxRetries = 2, noCache = false } = options;
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(!skip && !!url);
  const [isValidating, setIsValidating] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const retryCountRef = useRef(0);
  const fetchDataRef = useRef<(() => Promise<void>) | null>(null);

  const fetchData = useCallback(async () => {
    if (!url || skip) return;

    // Abort any in-flight request
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    // Show stale data from cache while revalidating — but only if the entry
    // is fresh enough that "saved but showing old data" can't be mistaken
    // for a failed write.
    if (!noCache) {
      const cached = memoryCache.get(url);
      if (cached && Date.now() - cached.timestamp < STALE_MS) {
        setData(cached.data as T);
        setIsValidating(true);
        setLoading(false);
      }
    }

    try {
      const res = await fetch(url, {
        signal: controller.signal,
        credentials: "include",
      });

      if (!res.ok) {
        const body = await res.json().catch(() => null);
        const msg = body?.error ?? body?.message ?? `HTTP ${res.status}`;
        throw new Error(msg);
      }

      const json = await res.json();
      retryCountRef.current = 0;
      setError(null);
      setData(json);
      setLoading(false);
      setIsValidating(false);

      // Update cache
      if (!noCache) {
        cacheSet(url, json);
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;

      const isNetworkError = err instanceof TypeError;
      if (isNetworkError && retryCountRef.current < maxRetries) {
        // Auto-retry with exponential backoff
        const delay = RETRY_DELAYS[retryCountRef.current] ?? 3000;
        retryCountRef.current++;
        setTimeout(() => fetchDataRef.current?.(), delay);
        return;
      }

      // Final error
      const msg = err instanceof Error ? err.message : "Failed to load data";
      setError(msg);
      setLoading(false);
      setIsValidating(false);
    }
  }, [url, skip, noCache, maxRetries]);

  // Keep ref in sync for retry/poll callbacks
  useEffect(() => {
    fetchDataRef.current = fetchData;
  }, [fetchData]);

  useEffect(() => {
    if (skip || !url) {
      setLoading(false);
      return;
    }
    fetchData();

    // Polling
    let interval: ReturnType<typeof setInterval> | undefined;
    if (pollMs && pollMs > 0) {
      interval = setInterval(() => fetchDataRef.current?.(), pollMs);
    }

    return () => {
      abortRef.current?.abort();
      if (interval) clearInterval(interval);
    };
  }, [fetchData, pollMs, skip, url]);

  const retry = useCallback(() => {
    retryCountRef.current = 0;
    setError(null);
    setLoading(true);
    fetchData();
  }, [fetchData]);

  return { data, error, loading, isValidating, retry };
}

/**
 * Clear the in-memory cache for a specific URL, or all cache if no URL.
 */
export function clearFetchCache(url?: string) {
  if (url) {
    memoryCache.delete(url);
  } else {
    memoryCache.clear();
  }
}
