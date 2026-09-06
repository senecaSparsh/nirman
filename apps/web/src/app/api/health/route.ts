/**
 * Health check endpoint.
 *
 * Used by:
 *  - The production start wrapper (scripts/start-with-recovery.mjs) to
 *    detect zombie states (server up but not responding).
 *  - Render's health check path (render.yaml `healthCheckPath`).
 *
 * Returns 200 if the server is alive and the DB is reachable, 503 if the
 * DB is down (which triggers the wrapper's restart logic).
 *
 * This route is public (no auth) — it only reports liveness, no data.
 * The response is minimal to keep it fast.
 */

import { NextResponse } from "next/server";
import { prisma } from "@nirman/db";
import { totalmem, } from "node:os";
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

export async function GET() {
  try {
    // Simple DB ping — if this fails, the server is alive but the DB is
    // unreachable (common on Render free tier cold starts). The wrapper
    // will restart us, which re-establishes the connection pool.
    await prisma.$queryRaw`SELECT 1`;

    // Report memory info so the auto-scaling config is visible.
    const mem = detectMemoryMB();
    const nodeOptions = process.env.NODE_OPTIONS || "";
    const heapMatch = nodeOptions.match(/--max-old-space-size=(\d+)/);
    const heapMB = heapMatch?.[1] ? parseInt(heapMatch[1], 10) : null;
    const memUsage = process.memoryUsage();

    return NextResponse.json(
      {
        status: "ok",
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
      },
      { status: 200, headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return NextResponse.json(
      {
        status: "degraded",
        error: "database unreachable",
        timestamp: new Date().toISOString(),
      },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
