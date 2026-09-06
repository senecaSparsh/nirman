"use client";

import * as React from "react";
import { useDeviceTier } from "@/lib/device-tier-client";

/**
 * AdaptiveData — the core adaptive rendering component.
 *
 * On high-tier devices: renders children with client-fetched data.
 * The server sends a lightweight skeleton, the client fetches via the
 * provided fetcher, and SWR-style caching keeps repeat visits instant.
 *
 * On low/mid-tier devices: uses server-provided data (SSR). The server
 * already fetched the data and rendered full HTML — no client fetching,
 * minimal JS, fast first paint on slow networks.
 *
 * Usage in a Server Component:
 *
 * ```tsx
 * // The server ALWAYS fetches data (for low-tier + first visit + SEO)
 * const data = await fetchData();
 *
 * return (
 *   <AdaptiveData
 *     serverData={data}
 *     clientFetcher={() => fetch("/api/dprs").then(r => r.json())}
 *     renderSkeleton={<Skeleton />}
 *   >
 *     {(data) => <List items={data} />}
 *   </AdaptiveData>
 * );
 * ```
 *
 * On high-tier devices, the server can SKIP the fetch and pass
 * `serverData={null}` — the client will fetch instead:
 *
 * ```tsx
 * const tier = getDeviceTierFromCookies(headers.cookie);
 * const data = tier === "high" ? null : await fetchData();
 *
 * return (
 *   <AdaptiveData
 *     serverData={data}
 *     clientFetcher={() => fetch("/api/dprs").then(r => r.json())}
 *     renderSkeleton={<Skeleton />}
 *   >
 *     {(data) => <List items={data} />}
 *   </AdaptiveData>
 * );
 * ```
 */

interface AdaptiveDataProps<T> {
  /** Data from the server (SSR). null = server skipped fetch (high-tier). */
  serverData: T | null;
  /** Client-side fetcher — called on high-tier devices. */
  clientFetcher: () => Promise<T>;
  /** Skeleton shown while client fetch is in progress (high-tier only). */
  renderSkeleton?: React.ReactNode;
  /** Cache key for SWR-style deduplication. Defaults to a random key. */
  cacheKey?: string;
  /** Children render prop. */
  children: (data: T) => React.ReactNode;
}

interface AdaptiveDataState<T> {
  data: T | null;
  loading: boolean;
  error: Error | null;
}

export function AdaptiveData<T>({
  serverData,
  clientFetcher,
  renderSkeleton,
  cacheKey,
  children,
}: AdaptiveDataProps<T>) {
  const tier = useDeviceTier();
  const autoKey = React.useId();

  // Module-level cache for SWR-style deduplication across components
  const key = cacheKey ?? `adaptive-${autoKey}`;
  const cached = AdaptiveCache.get<T>(key);

  const [state, setState] = React.useState<AdaptiveDataState<T>>({
    data: serverData ?? cached ?? null,
    loading: serverData === null && cached === null,
    error: null,
  });

  // If server provided data, cache it
  React.useEffect(() => {
    if (serverData !== null) {
      AdaptiveCache.set(key, serverData);
    }
  }, [serverData, key]);

  // On high-tier devices with no server data, fetch client-side
  React.useEffect(() => {
    if (tier !== "high") return;
    if (state.data !== null && !state.loading) return;  // already have data

    let cancelled = false;
    setState((s) => ({ ...s, loading: true, error: null }));

    clientFetcher()
      .then((data) => {
        if (cancelled) return;
        AdaptiveCache.set(key, data);
        setState({ data, loading: false, error: null });
      })
      .catch((error) => {
        if (cancelled) return;
        setState((s) => ({ ...s, loading: false, error }));
      });

    return () => { cancelled = true; };
  }, [tier, key, state.data, state.loading, clientFetcher]);

  // Low/mid-tier: use server data directly (no client fetch)
  if (tier !== "high") {
    if (state.data !== null) {
      return <>{children(state.data)}</>;
    }
    return <>{renderSkeleton ?? null}</>;
  }

  // High-tier: show skeleton while loading, then render
  if (state.loading && state.data === null) {
    return <>{renderSkeleton ?? null}</>;
  }

  if (state.error && state.data === null) {
    // Fallback: try to refetch on next interaction
    return <>{renderSkeleton ?? null}</>;
  }

  if (state.data === null) {
    return <>{renderSkeleton ?? null}</>;
  }

  return <>{children(state.data)}</>;
}

/**
 * Simple module-level cache for adaptive data.
 * Prevents refetching the same data when navigating back to a page.
 * Entries expire after 30 seconds (stale-while-revalidate pattern).
 */
class AdaptiveCacheImpl {
  private cache = new Map<string, { data: unknown; expires: number }>();
  private readonly TTL = 30_000;  // 30 seconds

  get<T>(key: string): T | null {
    const entry = this.cache.get(key);
    if (!entry) return null;
    if (Date.now() > entry.expires) {
      this.cache.delete(key);
      return null;
    }
    return entry.data as T;
  }

  set<T>(key: string, data: T): void {
    this.cache.set(key, { data, expires: Date.now() + this.TTL });
  }

  invalidate(key: string): void {
    this.cache.delete(key);
  }

  clear(): void {
    this.cache.clear();
  }
}

export const AdaptiveCache = new AdaptiveCacheImpl();
