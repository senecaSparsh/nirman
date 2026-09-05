/**
 * In-memory token-bucket rate limiter with auto-scaling.
 *
 * Bucket capacities scale with available memory — on 512MB the limits
 * are conservative (protect the small instance), on 2GB+ they're
 * generous (let the bigger instance handle more traffic). Upgrade
 * your Render plan and the limits adjust automatically.
 *
 * Designed for single-instance deployments (Render). For multi-instance,
 * replace with Redis-backed limiter.
 *
 * Usage in route handlers:
 *   import { rateLimit, RATE_LIMITS } from "@/lib/rate-limit";
 *
 *   export const POST = apiHandler(async (req) => {
 *     const rl = rateLimit(req, RATE_LIMITS.write);
 *     if (rl) return rl;  // 429 response
 *     ...
 *   });
 *
 * Buckets are keyed by IP (from x-forwarded-for or remote address).
 * Authenticated users get a separate per-user bucket so one user's
 * burst doesn't starve another on a shared office NAT.
 */

import { totalmem } from "node:os";
import { readFileSync } from "node:fs";

interface Bucket {
  tokens: number;
  lastRefill: number;
}

const buckets = new Map<string, Bucket>();

interface RateLimitConfig {
  /** Maximum tokens in the bucket (burst capacity). */
  capacity: number;
  /** Tokens added per second (sustained rate). */
  refillPerSec: number;
  /** Optional per-user override (uses userId if authenticated). */
  userCapacity?: number;
  /** Window in ms after which idle buckets are evicted. */
  idleEvictMs?: number;
}

/**
 * Auto-detect available memory and compute a multiplier.
 * 512MB → 1x, 1GB → 1.5x, 2GB → 2x, 4GB → 3x, 8GB+ → 4x.
 * Called once at module load (cached).
 */
function getMemoryMultiplier(): number {
  // cgroup v2
  try {
    const max = readFileSync("/sys/fs/cgroup/memory.max", "utf8").trim();
    if (max && max !== "max") {
      const mb = Math.floor(parseInt(max, 10) / (1024 * 1024));
      return Math.max(1, Math.min(4, Math.floor(mb / 512)));
    }
  } catch {}
  // cgroup v1
  try {
    const limit = readFileSync("/sys/fs/cgroup/memory/memory.limit_in_bytes", "utf8").trim();
    if (limit) {
      const bytes = parseInt(limit, 10);
      if (bytes > 0 && bytes < 1e15) {
        const mb = Math.floor(bytes / (1024 * 1024));
        return Math.max(1, Math.min(4, Math.floor(mb / 512)));
      }
    }
  } catch {}
  // Fallback: OS total (local dev — usually plenty of RAM)
  const mb = Math.floor(totalmem() / (1024 * 1024));
  return Math.max(1, Math.min(4, Math.floor(mb / 512)));
}

const MEMORY_MULTIPLIER = getMemoryMultiplier();

/**
 * Rate limit presets. Capacities are auto-scaled by MEMORY_MULTIPLIER.
 * On 512MB: 1x (conservative). On 2GB: 2x. On 8GB+: 4x.
 * Auth/webhook/heavy limits are NOT scaled (they're security limits,
 * not throughput limits).
 */
export const RATE_LIMITS = {
  /** Read endpoints (GET) — 60/min burst × multiplier, 30/sec sustained. */
  read: {
    capacity: 60 * MEMORY_MULTIPLIER,
    refillPerSec: 30 * MEMORY_MULTIPLIER,
  } satisfies RateLimitConfig,
  /** Write endpoints (POST/PATCH/DELETE) — 20/min burst × multiplier, 5/sec sustained. */
  write: {
    capacity: 20 * MEMORY_MULTIPLIER,
    refillPerSec: 5 * MEMORY_MULTIPLIER,
  } satisfies RateLimitConfig,
  /** Auth endpoints (sign-in, sign-up) — 5/min burst, NOT scaled (security limit). */
  auth: { capacity: 5, refillPerSec: 0.1 } satisfies RateLimitConfig,
  /** Public webhook endpoints — 30/min burst, NOT scaled (external limit). */
  webhook: { capacity: 30, refillPerSec: 10 } satisfies RateLimitConfig,
  /** Heavy endpoints (backup, sync, reports) — 3/min burst, NOT scaled. */
  heavy: { capacity: 3, refillPerSec: 1 / 30 } satisfies RateLimitConfig,
} as const;

/** Get the client IP from standard headers. */
function getClientIp(req: Request): string {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0]?.trim() ?? "";
  const realIp = req.headers.get("x-real-ip");
  if (realIp) return realIp.trim();
  // Fallback for local dev (no proxy headers)
  return "local";
}

/** Periodically evict idle buckets to prevent memory growth. */
const EVICT_INTERVAL_MS = 5 * 60 * 1000; // 5 min
let lastEvict = Date.now();

function evictIdleBuckets(now: number, idleMs: number) {
  if (now - lastEvict < EVICT_INTERVAL_MS) return;
  lastEvict = now;
  for (const [key, bucket] of buckets) {
    if (now - bucket.lastRefill > idleMs) {
      buckets.delete(key);
    }
  }
}

/**
 * Refill token bucket based on elapsed time.
 * Pure function — no side effects (does not mutate the bucket).
 *
 *   newTokens = min(capacity, currentTokens + elapsedSec × refillPerSec)
 */
export function refillTokenBucket(
  currentTokens: number,
  elapsedSec: number,
  capacity: number,
  refillPerSec: number,
): number {
  return Math.min(capacity, currentTokens + elapsedSec * refillPerSec);
}

/**
 * Compute the retry-after seconds when a bucket is rate limited.
 * Pure function — no side effects.
 *
 *   retryAfterSec = ceil((1 - currentTokens) / refillPerSec)
 */
export function computeRetryAfter(currentTokens: number, refillPerSec: number): number {
  return Math.ceil((1 - currentTokens) / refillPerSec);
}

/**
 * Check rate limit for a request. Returns a 429 Response if the limit
 * is exceeded, or `null` if the request is allowed.
 *
 * @param req The incoming Request.
 * @param config Rate limit configuration.
 * @param userId Optional authenticated user ID (gets a separate bucket).
 */
export function rateLimit(
  req: Request,
  config: RateLimitConfig,
  userId?: string,
): Response | null {
  const now = Date.now();
  const idleEvictMs = config.idleEvictMs ?? 10 * 60 * 1000; // 10 min default
  evictIdleBuckets(now, idleEvictMs);

  const ip = getClientIp(req);
  // Use user-scoped bucket if authenticated, else IP-scoped.
  const key = userId ? `u:${userId}` : `ip:${ip}`;
  const capacity = userId && config.userCapacity ? config.userCapacity : config.capacity;

  let bucket = buckets.get(key);
  if (!bucket) {
    bucket = { tokens: capacity, lastRefill: now };
    buckets.set(key, bucket);
  }

  // Refill tokens based on elapsed time.
  const elapsedSec = (now - bucket.lastRefill) / 1000;
  bucket.tokens = Math.min(capacity, bucket.tokens + elapsedSec * config.refillPerSec);
  bucket.lastRefill = now;

  if (bucket.tokens < 1) {
    // Rate limited — compute retry-after.
    const retryAfterSec = Math.ceil((1 - bucket.tokens) / config.refillPerSec);
    return new Response(
      JSON.stringify({
        error: "Too many requests. Please retry shortly.",
        retryAfter: retryAfterSec,
      }),
      {
        status: 429,
        headers: {
          "Content-Type": "application/json",
          "Retry-After": String(retryAfterSec),
        },
      },
    );
  }

  bucket.tokens -= 1;
  return null;
}

/** Reset rate limit for a specific key (e.g. after successful auth). */
export function resetRateLimit(key: string) {
  buckets.delete(key);
}
