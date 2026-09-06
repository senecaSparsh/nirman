import { PrismaClient, Prisma } from "./generated/prisma";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

/**
 * Detect total available memory (cgroup-aware for containers).
 * Used to auto-scale the Prisma connection pool.
 *
 * Node built-ins (node:os, node:fs) are loaded lazily via eval-require so
 * that webpack does not try to bundle them into client-side chunks. This
 * function only ever runs on the server (inside createPrismaClient).
 */
function detectTotalMemoryMB(): number {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const _require = eval("require") as NodeRequire;
  // cgroup v2 (Render, Docker, K8s)
  try {
    const max = _require("node:fs").readFileSync("/sys/fs/cgroup/memory.max", "utf8").trim();
    if (max && max !== "max") {
      const bytes = parseInt(max, 10);
      if (bytes > 0 && bytes < Number.MAX_SAFE_INTEGER) {
        return Math.floor(bytes / (1024 * 1024));
      }
    }
  } catch {}
  // cgroup v1
  try {
    const limit = _require("node:fs").readFileSync("/sys/fs/cgroup/memory/memory.limit_in_bytes", "utf8").trim();
    if (limit) {
      const bytes = parseInt(limit, 10);
      if (bytes > 0 && bytes < 1e15) {
        return Math.floor(bytes / (1024 * 1024));
      }
    }
  } catch {}
  // Fallback: OS total
  return Math.floor(_require("node:os").totalmem() / (1024 * 1024));
}

/**
 * Auto-scale Prisma connection pool based on available memory.
 * Each connection uses ~5-10MB. On 512MB we can only afford 3-4;
 * on 8GB, 20 is fine. Formula: max(3, min(20, totalMB / 128)).
 *
 * This runs once at startup. When you upgrade your Render plan,
 * the new instance detects the higher memory and scales up automatically.
 */
function getRecommendedConnectionLimit(): number {
  const totalMB = detectTotalMemoryMB();
  return Math.max(3, Math.min(20, Math.floor(totalMB / 128)));
}

/**
 * Prisma client with auto-scaling connection pool.
 *
 * If DATABASE_URL already has `connection_limit=` set (via .env or
 * Render dashboard), that takes precedence — we respect explicit config.
 * If not, we auto-append the recommended limit based on detected RAM.
 *
 * Error handling: apiHandler catches P2024 (pool exhausted) → 503,
 * P1001 (DB unreachable) → 503, P1002 (timeout) → 504.
 */
function createPrismaClient(): PrismaClient {
  const client = new PrismaClient({
    log: process.env.PRISMA_LOG === "1" ? ["query", "error", "warn"] : ["error"],
    transactionOptions: { maxWait: 5_000, timeout: 10_000 },
  });

  // Auto-scale connection pool if DATABASE_URL doesn't specify one.
  // Runs in both dev and production — the dev server also needs adequate
  // connections for concurrent requests during development/testing.
  const dbUrl = process.env.DATABASE_URL || "";
  if (dbUrl && !dbUrl.includes("connection_limit=")) {
    const recommended = getRecommendedConnectionLimit();
    const totalMB = detectTotalMemoryMB();
    console.log(
      `[db] auto-scaling: ${totalMB}MB RAM detected → connection_limit=${recommended} ` +
      `(add ?connection_limit=X to DATABASE_URL to override)`,
    );
    // Append connection_limit to DATABASE_URL for this process.
    // Prisma reads it from the env var at query time.
    const separator = dbUrl.includes("?") ? "&" : "?";
    process.env.DATABASE_URL = `${dbUrl}${separator}connection_limit=${recommended}&pool_timeout=10`;
  } else if (dbUrl && dbUrl.includes("connection_limit=")) {
    const match = dbUrl.match(/connection_limit=(\d+)/);
    console.log(`[db] DATABASE_URL has explicit connection_limit=${match?.[1]} — using that`);
  }

  return client;
}

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

export * from "./generated/prisma";
