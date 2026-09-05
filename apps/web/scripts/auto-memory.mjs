/**
 * Auto-detects available memory and computes optimal config for all
 * memory-dependent subsystems (Node heap, Prisma pool, rate limiter,
 * concurrency). This lets the app seamlessly adapt when you upgrade
 * your Render plan from 512MB to 2GB+ without any manual config changes.
 *
 * Detection order (most accurate first):
 *   1. cgroup v2: /sys/fs/cgroup/memory.max (Render, Docker, Kubernetes)
 *   2. cgroup v1: /sys/fs/cgroup/memory/memory.limit_in_bytes
 *   3. os.totalmem() (local dev, bare metal)
 *
 * Tuning profile:
 *   ┌─────────────┬──────────┬────────────┬───────────┬──────────┐
 *   │ Total RAM   │ Heap     │ Prisma     │ Rate      │ Max      │
 *   │             │ (MB)     │ conns      │ limit     │ concur   │
 *   ├─────────────┼──────────┼────────────┼───────────┼──────────┤
 *   │  512 MB     │  400     │    3       │  default  │    10    │
 *   │ 1024 MB     │  800     │    5       │  1.5x     │    20    │
 *   │ 2048 MB     │ 1600     │    8       │  2x       │    50    │
 *   │ 4096 MB     │ 3200     │   12       │  3x       │   100    │
 *   │ 8192+ MB    │ 6400     │   20       │  4x       │   200    │
 *   └─────────────┴──────────┴────────────┴───────────┴──────────┘
 */

import { totalmem } from "node:os";
import { readFileSync } from "node:fs";

let cachedProfile = null;

/**
 * Detect the total available memory in bytes.
 * On containers (Render, Docker, K8s), reads cgroup limits.
 * Falls back to os.totalmem() on bare metal / macOS.
 */
function detectTotalMemoryBytes() {
  // cgroup v2 (modern Linux containers including Render)
  try {
    const max = readFileSync("/sys/fs/cgroup/memory.max", "utf8").trim();
    if (max && max !== "max") {
      const bytes = parseInt(max, 10);
      if (bytes > 0 && bytes < Number.MAX_SAFE_INTEGER) {
        return { bytes, source: "cgroup-v2" };
      }
    }
  } catch {}

  // cgroup v1 (older Linux containers)
  try {
    const limit = readFileSync("/sys/fs/cgroup/memory/memory.limit_in_bytes", "utf8").trim();
    if (limit) {
      const bytes = parseInt(limit, 10);
      // cgroup v1 reports a very large number when no limit is set.
      if (bytes > 0 && bytes < 1e15) {
        return { bytes, source: "cgroup-v1" };
      }
    }
  } catch {}

  // Fallback: OS total memory (local dev, bare metal)
  return { bytes: totalmem(), source: "os" };
}

/**
 * Compute the full memory profile from total bytes.
 */
function computeProfile(totalBytes, source) {
  const totalMB = Math.floor(totalBytes / (1024 * 1024));

  // Tier classification
  let tier;
  if (totalMB <= 640) tier = "micro";        // 512MB Render free
  else if (totalMB <= 1280) tier = "small";   // 1GB
  else if (totalMB <= 2560) tier = "medium";  // 2GB
  else if (totalMB <= 5120) tier = "large";   // 4GB
  else tier = "xlarge";                        // 8GB+

  // Heap: ~78% of total RAM (leaves room for OS + non-heap V8 overhead)
  const heapMB = Math.max(256, Math.min(8192, Math.floor(totalMB * 0.78)));

  // Prisma connections: each uses ~5-10MB. max(3, min(20, totalMB/128))
  const prismaConnectionLimit = Math.max(3, Math.min(20, Math.floor(totalMB / 128)));

  // Rate limit multiplier: 512MB=1x, 2GB=2x, 4GB=3x, 8GB+=4x
  const rateLimitMultiplier = Math.max(1, Math.min(4, Math.floor(totalMB / 512)));

  // Max concurrency: each request ~2-5MB. 512MB=10, 2GB=50, 8GB=200
  const maxConcurrency = Math.max(10, Math.min(200, Math.floor(totalMB / 40)));

  // Memory threshold: restart earlier on small instances
  const memoryThresholdFraction = tier === "micro" ? 0.80 :
                                   tier === "small" ? 0.82 :
                                   tier === "medium" ? 0.85 :
                                   tier === "large" ? 0.88 : 0.90;

  return {
    totalBytes,
    totalMB,
    heapMB,
    prismaConnectionLimit,
    rateLimitMultiplier,
    maxConcurrency,
    memoryThresholdFraction,
    tier,
    source,
  };
}

/**
 * Get the memory profile (cached after first call).
 */
export function getMemoryProfile() {
  if (cachedProfile) return cachedProfile;
  const { bytes, source } = detectTotalMemoryBytes();
  cachedProfile = computeProfile(bytes, source);
  return cachedProfile;
}

/**
 * Get a human-readable summary for logging.
 */
export function getMemorySummary() {
  const p = getMemoryProfile();
  return (
    `memory: ${p.totalMB}MB (${p.tier}, source: ${p.source}), ` +
    `heap: ${p.heapMB}MB, prisma: ${p.prismaConnectionLimit} conns, ` +
    `rate: ${p.rateLimitMultiplier}x, concur: ${p.maxConcurrency}, ` +
    `restart@${(p.memoryThresholdFraction * 100).toFixed(0)}%`
  );
}
