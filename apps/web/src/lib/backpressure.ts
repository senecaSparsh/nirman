/**
 * Server-side backpressure / overload protection.
 *
 * When the server is under heavy load, instead of letting requests
 * queue up until they timeout (which wastes DB connections and memory),
 * we proactively reject excess requests with a 503 + Retry-After.
 * This tells the client (SWR) to retry after a short delay, and tells
 * the load balancer (Render) to route to another instance or queue.
 *
 * The active request counter is shared across all handlers. When it
 * exceeds the concurrency limit, new requests get 503. The limit
 * auto-scales with available memory:
 *   512MB → 12 concurrent, 1GB → 25, 2GB → 50, 4GB → 100, 8GB+ → 200
 *
 * This is a **circuit breaker**, not a rate limiter. Rate limiting
 * (per-user/IP) is handled by rate-limit.ts. Backpressure is about
 * protecting the *server* from overload, regardless of who's making
 * the request.
 */

let activeRequests = 0;
let totalRejected = 0;
let peakConcurrency = 0;

function getMaxConcurrency(): number {
  try {
    const _require = eval("require") as NodeRequire;
    // cgroup v2 (Render, Docker, K8s)
    try {
      const max = _require("node:fs").readFileSync("/sys/fs/cgroup/memory.max", "utf8").trim();
      if (max && max !== "max") {
        const mb = Math.floor(parseInt(max, 10) / (1024 * 1024));
        if (mb > 0) return Math.max(12, Math.min(200, Math.floor(mb / 32)));
      }
    } catch {}
    // cgroup v1
    try {
      const limit = _require("node:fs").readFileSync("/sys/fs/cgroup/memory/memory.limit_in_bytes", "utf8").trim();
      if (limit) {
        const bytes = parseInt(limit, 10);
        if (bytes > 0 && bytes < 1e15) {
          const mb = Math.floor(bytes / (1024 * 1024));
          return Math.max(12, Math.min(200, Math.floor(mb / 32)));
        }
      }
    } catch {}
    // Fallback: OS total
    const mb = Math.floor(_require("node:os").totalmem() / (1024 * 1024));
    return Math.max(12, Math.min(200, Math.floor(mb / 32)));
  } catch {
    return 50;
  }
}

const MAX_CONCURRENCY = getMaxConcurrency();

/**
 * Wrap an API handler with backpressure protection.
 * If the server is at capacity, returns 503 with Retry-After.
 *
 * Usage:
 *   export const GET = apiHandler(withBackpressure(async (req) => {
 *     ...
 *   }));
 *
 * Or more commonly, applied inside apiHandler itself.
 */
export function withBackpressure<TReq extends Request = Request, TCtx = unknown>(
  fn: (req: TReq, ctx: TCtx) => Promise<Response>,
): (req: TReq, ctx: TCtx) => Promise<Response> {
  return async (req: TReq, ctx: TCtx): Promise<Response> => {
    if (activeRequests >= MAX_CONCURRENCY) {
      totalRejected++;
      return new Response(
        JSON.stringify({
          error: "Server is busy — please retry shortly",
          retryable: true,
        }),
        {
          status: 503,
          headers: {
            "Content-Type": "application/json",
            "Retry-After": "2",
          },
        },
      );
    }

    activeRequests++;
    if (activeRequests > peakConcurrency) {
      peakConcurrency = activeRequests;
    }

    try {
      return await fn(req, ctx);
    } finally {
      activeRequests--;
    }
  };
}

/**
 * Track an active request. Returns an `untrack` function to call
 * when the request completes (in a `finally` block).
 *
 * This is the low-level primitive used by `apiHandler`. If the server
 * is at capacity, `getBackpressureStats().activeRequests >= maxConcurrency`
 * will be true and the handler should return 503 before calling this.
 */
export function trackRequest(): () => void {
  activeRequests++;
  if (activeRequests > peakConcurrency) {
    peakConcurrency = activeRequests;
  }
  return () => {
    activeRequests--;
  };
}

/**
 * Get backpressure stats for the health endpoint.
 */
export function getBackpressureStats() {
  return {
    activeRequests,
    maxConcurrency: MAX_CONCURRENCY,
    peakConcurrency,
    totalRejected,
    utilizationPct: Math.round((activeRequests / MAX_CONCURRENCY) * 100),
  };
}
