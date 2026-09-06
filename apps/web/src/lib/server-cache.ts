/**
 * Server-side in-memory response cache.
 *
 * Caches the *result* of expensive read-only API handlers so repeated
 * requests within the TTL window are served from memory without hitting
 * the DB. This dramatically reduces DB load under concurrent traffic
 * (e.g. 50 users polling /api/dashboard-counts every 30s → 1 DB query
 * per 15s, not 50 per 30s).
 *
 * Design:
 *  - Per-company + per-user cache key (data is scoped, not global).
 *  - TTL-based expiry (default 15s, configurable per route).
 *  - Tag-based invalidation — mutations call `invalidateCache(tag)`
 *    to bust all entries with that tag (e.g. "dashboard" after a PO
 *    is created).
 *  - Stale-while-revalidate: expired entries are served immediately
 *    while a background refresh runs (the caller gets fast response,
 *    the next request gets fresh data).
 *  - Memory-bounded: max 500 entries, LRU eviction when full.
 *  - Auto-scales: max entries = memoryMultiplier × 125 (500 on 512MB,
 *    2000 on 8GB+).
 *
 * Usage in a route handler:
 *   import { cached } from "@/lib/server-cache";
 *
 *   export const GET = apiHandler(cached(
 *     "dashboard",          // tag for invalidation
 *     15_000,               // TTL: 15s
 *     async (req, ctx) => { // the actual handler
 *       const data = await expensiveQuery();
 *       return json(data);
 *     }
 *   ));
 *
 * In a mutation handler, after changing data:
 *   import { invalidateCache } from "@/lib/server-cache";
 *   invalidateCache("dashboard");
 *   invalidateCache("approvals");
 */

interface CacheEntry {
  body: string;
  status: number;
  headers: Record<string, string>;
  expiresAt: number;
  /** Background refresh in progress (prevents thundering herd). */
  refreshing?: boolean;
  /** When the entry was last accessed (for LRU eviction). */
  lastAccessed: number;
}

const cache = new Map<string, CacheEntry>();
const tagIndex = new Map<string, Set<string>>(); // tag → set of cache keys

// Auto-scale max entries based on available memory.
function getMaxEntries(): number {
  try {
    const totalMB = Math.floor(
      (eval("require") as NodeRequire)("node:os").totalmem() / (1024 * 1024),
    );
    // 500 entries per 2GB, capped at 2000. Each entry ~1-50KB.
    return Math.max(200, Math.min(2000, Math.floor(totalMB / 16)));
  } catch {
    return 500;
  }
}

const MAX_ENTRIES = getMaxEntries();

/** Evict least-recently-used entries when cache is full. */
function evictIfNeeded() {
  if (cache.size <= MAX_ENTRIES) return;
  // Sort by lastAccessed, evict oldest 10%
  const toEvict = Math.ceil(MAX_ENTRIES * 0.1);
  const entries = [...cache.entries()].sort(
    (a, b) => a[1].lastAccessed - b[1].lastAccessed,
  );
  for (let i = 0; i < toEvict; i++) {
    const key = entries[i]?.[0];
    if (!key) break;
    cache.delete(key);
    // Clean up tag index
    for (const [tag, keys] of tagIndex) {
      keys.delete(key);
      if (keys.size === 0) tagIndex.delete(tag);
    }
  }
}

/** Add a key to a tag's index. */
function indexTag(tag: string, key: string) {
  let keys = tagIndex.get(tag);
  if (!keys) {
    keys = new Set();
    tagIndex.set(tag, keys);
  }
  keys.add(key);
}

/**
 * Invalidate all cache entries with the given tag.
 * Call this after mutations that change the cached data.
 */
export function invalidateCache(tag: string) {
  const keys = tagIndex.get(tag);
  if (!keys) return;
  for (const key of keys) {
    cache.delete(key);
  }
  tagIndex.delete(tag);
}

/**
 * Invalidate multiple tags at once.
 */
export function invalidateTags(...tags: string[]) {
  for (const tag of tags) invalidateCache(tag);
}

/**
 * Build a cache key from the request URL + user/company context.
 * This ensures different companies/users don't see each other's data.
 *
 * **Security**: the user ID and company ID MUST be part of the key.
 * Without them, two users in different companies hitting the same URL
 * (e.g. /api/dashboard-counts) would share a single cache entry —
 * a cross-company data leak. The previous implementation only used
 * `${tag}:${path}` which was vulnerable to this.
 *
 * `getCurrentUser` and `getCompany` are memoized per-request via
 * AsyncLocalStorage (see server.ts), so the overhead here is a single
 * in-memory map lookup, not a DB round-trip. The dynamic import avoids
 * a circular dependency (server.ts imports `cached` from this module).
 */
async function buildCacheKey(
  req: Request,
  tag: string,
): Promise<string> {
  const url = new URL(req.url);
  const path = url.pathname + url.search;
  const { getCurrentUser, getCompany } = await import("@/lib/server");
  const [user, company] = await Promise.all([getCurrentUser(), getCompany()]);
  return `${tag}:u:${user?.id ?? "anon"}:c:${company?.id ?? "none"}:${path}`;
}

/**
 * Wrap an API handler with in-memory caching.
 *
 * @param tag Cache tag for invalidation (e.g. "dashboard", "approvals")
 * @param ttlMs Time-to-live in milliseconds (default 15s)
 * @param fn The original handler function
 * @returns A cached version of the handler
 */
export function cached<TReq extends Request = Request, TCtx = unknown>(
  tag: string,
  ttlMs: number,
  fn: (req: TReq, ctx: TCtx) => Promise<Response>,
): (req: TReq, ctx: TCtx) => Promise<Response> {
  return async (req: TReq, ctx: TCtx): Promise<Response> => {
    // Only cache GET requests
    if (req.method !== "GET") return fn(req, ctx);

    const key = await buildCacheKey(req, tag);
    const now = Date.now();
    const entry = cache.get(key);

    if (entry) {
      entry.lastAccessed = now;

      if (entry.expiresAt > now) {
        // Fresh cache hit — serve immediately
        return new Response(entry.body, {
          status: entry.status,
          headers: entry.headers,
        });
      }

      // Stale entry — serve it immediately but refresh in background
      // (stale-while-revalidate). This gives instant responses while
      // keeping data fresh.
      if (!entry.refreshing) {
        entry.refreshing = true;
        // Fire-and-forget background refresh
        void fn(req, ctx)
          .then(async (res) => {
            const body = await res.text();
            const headers: Record<string, string> = {};
            res.headers.forEach((value, key2) => {
              headers[key2] = value;
            });
            cache.set(key, {
              body,
              status: res.status,
              headers,
              expiresAt: Date.now() + ttlMs,
              lastAccessed: Date.now(),
            });
            indexTag(tag, key);
          })
          .catch(() => {
            // Refresh failed — leave stale entry, it'll be retried on next request
          })
          .finally(() => {
            const e = cache.get(key);
            if (e) e.refreshing = false;
          });
      }

      // Serve stale data immediately
      return new Response(entry.body, {
        status: entry.status,
        headers: entry.headers,
      });
    }

    // Cache miss — execute the handler and cache the result
    const res = await fn(req, ctx);
    const body = await res.text();
    const headers: Record<string, string> = {};
    res.headers.forEach((value, k) => {
      headers[k] = value;
    });

    // Only cache successful responses
    if (res.status >= 200 && res.status < 300) {
      evictIfNeeded();
      cache.set(key, {
        body,
        status: res.status,
        headers,
        expiresAt: now + ttlMs,
        lastAccessed: now,
      });
      indexTag(tag, key);
    }

    // Return a new Response since we consumed the body
    return new Response(body, {
      status: res.status,
      headers,
    });
  };
}

/**
 * Get cache stats for monitoring/debugging.
 */
export function getCacheStats() {
  let totalBytes = 0;
  for (const entry of cache.values()) {
    totalBytes += entry.body.length;
  }
  return {
    entries: cache.size,
    maxEntries: MAX_ENTRIES,
    tags: tagIndex.size,
    approxBytes: totalBytes,
    approxMB: Math.round(totalBytes / (1024 * 1024) * 100) / 100,
  };
}
