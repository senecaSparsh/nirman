/**
 * Health check endpoint.
 *
 * Used by:
 *  - The production start wrapper (scripts/start-with-recovery.mjs) to
 *    detect zombie states (server up but not responding).
 *  - Render's health check path (render.yaml `healthCheckPath`).
 *
 * Two modes:
 *  - `/api/health` (default) — LIVENESS check. Returns 200 if the Node.js
 *    process is alive and can respond to HTTP. Does NOT query the DB.
 *    This is what Render's health check uses — a DB cold-start should NOT
 *    trigger a service restart (the process is fine, the DB just needs a
 *    moment to wake up).
 *  - `/api/health?deep=1` — READINESS check. Also pings the DB. Used by
 *    the start wrapper's internal health monitor (which restarts on
 *    repeated failures, not just one).
 *
 * Returns 200 if alive (liveness) or alive+DB reachable (readiness).
 * Returns 503 only for readiness failures (DB unreachable).
 *
 * This route is public (no auth) — it only reports liveness, no data.
 * The response is minimal to keep it fast.
 */

import { NextResponse } from "next/server";
import { prisma } from "@nirman/db";
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
  const deep = url.searchParams.get("deep") === "1";

  // Report memory info so the auto-scaling config is visible.
  const mem = detectMemoryMB();
  const nodeOptions = process.env.NODE_OPTIONS || "";
  const heapMatch = nodeOptions.match(/--max-old-space-size=(\d+)/);
  const heapMB = heapMatch?.[1] ? parseInt(heapMatch[1], 10) : null;
  const memUsage = process.memoryUsage();

  const baseResponse = {
    status: "ok" as string,
    timestamp: new Date().toISOString(),
    memory: {
      totalMB: mem.totalMB,
      source: mem.source,
      heapLimitMB: heapMB,
      rssMB: Math.floor(memUsage.rss / (1024 * 1024)),
      heapUsedMB: Math.floor(memUsage.heapUsed / (1024 * 1024)),
      externalMB: Math.floor(memUsage.external / (1024 * 1024)),
    },
    uptime: process.uptime ? `${process.uptime().toFixed(0)}s` : null,
    db: "unknown" as string,
  };

  // Liveness check (default): just return 200. The process is alive if
  // it can respond to this request. Don't query the DB — on Render free
  // tier, the Postgres sleeps after 15min and the first query on wake-up
  // may take 2-5s or fail. A 503 here would make Render restart the
  // service, which is wrong (the process is fine, the DB just woke up).
  if (!deep) {
    baseResponse.db = "not-checked";
    return NextResponse.json(baseResponse, {
      status: 200,
      headers: { "Cache-Control": "no-store" },
    });
  }

  // Readiness check (deep=1): also ping the DB. Used by the start
  // wrapper's internal health monitor. The wrapper tolerates a few
  // failures before restarting, so a cold-start DB delay won't cause
  // an immediate restart.
  try {
    await prisma.$queryRaw`SELECT 1`;
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
