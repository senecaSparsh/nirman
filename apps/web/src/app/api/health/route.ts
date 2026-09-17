/**
 * Health check endpoint.
 *
 * Used by:
 *  - The production start wrapper (scripts/start-with-recovery.mjs) to
 *    detect zombie states (server up but not responding).
 *  - Render's health check path (render.yaml `healthCheckPath`).
 *  - Coolify's container healthcheck (docker-compose.prod.yml).
 *  - External uptime monitors (UptimeRobot etc.) hitting `/api/health`.
 *
 * Three modes:
 *  - `/api/health` (default) — READINESS check. Pings the DB with a 3s
 *    timeout. Returns 200 if process alive AND DB reachable, 503 if DB
 *    is down. This is the right default for Coolify (local DB is always
 *    on) and for external monitors (they should alert on DB issues).
 *  - `/api/health?liveness=1` — LIVENESS only. Returns 200 if the Node.js
 *    process is alive and can respond to HTTP. Does NOT query the DB.
 *    Use this for platforms where the DB may cold-start (Render free
 *    tier) and a DB wake-up delay should NOT trigger a restart.
 *  - `/api/health?deep=1` — alias for the default readiness check (kept
 *    for backward compatibility with the start wrapper).
 *
 * Returns 200 if alive (liveness) or alive+DB reachable (readiness).
 * Returns 503 only for readiness failures (DB unreachable).
 *
 * This route is public (no auth) — it only reports liveness, no data.
 * The response is minimal to keep it fast.
 */

import { NextResponse } from "next/server";
import { prisma } from "@nirman/db";
import { auth } from "@/lib/auth";
import { totalmem } from "node:os";
import { readFileSync } from "node:fs";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Detect total memory (cgroup-aware) for health reporting.
 */
function detectMemoryMB(): { totalMB: number; source: string } {
  try {
    const max = readFileSync("/sys/fs/cgroup/memory.max", "utf8").trim();
    if (max && max !== "max") {
      return { totalMB: Math.floor(parseInt(max, 10) / (1024 * 1024)), source: "cgroup-v2" };
    }
  } catch {}
  try {
    const limit = readFileSync("/sys/fs/cgroup/memory/memory.limit_in_bytes", "utf8").trim();
    if (limit) {
      const bytes = parseInt(limit, 10);
      if (bytes > 0 && bytes < 1e15) {
        return { totalMB: Math.floor(bytes / (1024 * 1024)), source: "cgroup-v1" };
      }
    }
  } catch {}
  return { totalMB: Math.floor(totalmem() / (1024 * 1024)), source: "os" };
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const livenessOnly = url.searchParams.get("liveness") === "1";
  // deep=1 is kept as an alias for the default (readiness) mode for
  // backward compatibility with the start wrapper — no need to read it
  // separately since the default already checks DB.
  const checkDb = !livenessOnly; // default: check DB (readiness)

  // Minimal public payload by default — status + db only. Process internals
  // (heap size, RSS, uptime) are useful to an attacker sizing a resource-
  // exhaustion attempt, so the detailed block is returned only to callers
  // with an authenticated session.
  const session = await auth.api
    .getSession({ headers: request.headers })
    .catch(() => null);

  const baseResponse = {
    status: "ok" as string,
    timestamp: new Date().toISOString(),
    ...(session?.user
      ? (() => {
          const mem = detectMemoryMB();
          const nodeOptions = process.env.NODE_OPTIONS || "";
          const heapMatch = nodeOptions.match(/--max-old-space-size=(\d+)/);
          const heapMB = heapMatch?.[1] ? parseInt(heapMatch[1], 10) : null;
          const memUsage = process.memoryUsage();
          return {
            memory: {
              totalMB: mem.totalMB,
              source: mem.source,
              heapLimitMB: heapMB,
              rssMB: Math.floor(memUsage.rss / (1024 * 1024)),
              heapUsedMB: Math.floor(memUsage.heapUsed / (1024 * 1024)),
              externalMB: Math.floor(memUsage.external / (1024 * 1024)),
            },
            uptime: process.uptime ? `${process.uptime().toFixed(0)}s` : null,
          };
        })()
      : {}),
    db: "unknown" as string,
  };

  // Liveness check (?liveness=1): just return 200. The process is alive
  // if it can respond to this request. Don't query the DB — on platforms
  // where the DB may cold-start (Render free tier), a DB wake-up delay
  // should NOT trigger a service restart.
  if (!checkDb) {
    baseResponse.db = "not-checked";
    return NextResponse.json(baseResponse, {
      status: 200,
      headers: { "Cache-Control": "no-store" },
    });
  }

  // Readiness check (default, or ?deep=1): ping the DB with a 3s timeout.
  // On Coolify the DB is local and always on, so this is safe. The start
  // wrapper tolerates a few failures before restarting, so a transient
  // DB delay won't cause an immediate restart.
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3000);
    await Promise.race([
      prisma.$queryRaw`SELECT 1`,
      new Promise((_, reject) =>
        controller.signal.addEventListener("abort", () =>
          reject(new Error("DB ping timeout")),
        ),
      ),
    ]);
    clearTimeout(timeout);
    baseResponse.db = "ok";
    return NextResponse.json(baseResponse, {
      status: 200,
      headers: { "Cache-Control": "no-store" },
    });
  } catch {
    baseResponse.status = "degraded";
    baseResponse.db = "unreachable";
    return NextResponse.json(
      { ...baseResponse, error: "database unreachable" },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
