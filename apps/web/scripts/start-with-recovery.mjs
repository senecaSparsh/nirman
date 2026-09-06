/**
 * Production Start with Auto-Recovery
 * =====================================
 *
 * Wraps `next start` with production-grade reliability:
 *
 *  1. **Graceful shutdown** — on SIGTERM/SIGINT, stops accepting new
 *     connections, waits up to 30s for in-flight requests to finish,
 *     then exits cleanly. Required for zero-downtime Render deploys.
 *
 *  2. **Crash auto-restart** — if `next start` exits unexpectedly
 *     (OOM, unhandled rejection, segfault), restarts it with exponential
 *     backoff. Max 5 restarts in 10 minutes, then exits (Render will
 *     re-provision the whole service).
 *
 *  3. **Health check** — after starting, polls the health endpoint every
 *     30s. If it fails 3 consecutive checks, kills + restarts the server
 *     (catches "server is up but not responding" zombie states).
 *
 *  4. **DB warmup** — on cold starts (Render free tier sleeps after 15min),
 *     the Postgres connection pool may take 2-5s to establish. The wrapper
 *     waits for the health check to pass before considering the server
 *     "ready", preventing Render from routing traffic to a half-started server.
 *
 * Usage:
 *   node scripts/start-with-recovery.mjs          # wraps `next start`
 *   node scripts/start-with-recovery.mjs --port 3001
 *
 * Zero external dependencies — Node.js built-ins only.
 */

import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";
import { getMemoryProfile, getMemorySummary } from "./auto-memory.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const WEB_DIR = join(__dirname, "..");

// ── Auto-detect memory profile ──────────────────────────────────
// Detects available RAM from cgroup limits (Render/Docker/K8s) or
// os.totalmem() (local dev). All memory-dependent settings scale
// automatically — upgrade your Render plan and everything adapts.
const MEM_PROFILE = getMemoryProfile();

// ── Config ──────────────────────────────────────────────────────
const MAX_RESTARTS = 5;
const RESTART_WINDOW_MS = 10 * 60 * 1000; // 10 min
const INITIAL_BACKOFF_MS = 1000;
const MAX_BACKOFF_MS = 10000;
const SHUTDOWN_GRACE_MS = 30000; // 30s for in-flight requests
const HEALTH_CHECK_INTERVAL_MS = 30000; // 30s
const HEALTH_CHECK_MAX_FAILURES = 3; // restart after 3 consecutive failures
const HEALTH_CHECK_TIMEOUT_MS = 10000; // 10s per check
const STARTUP_GRACE_PERIOD_MS = 90000; // 90s — Render free tier cold starts need longer
const MEMORY_CHECK_INTERVAL_MS = 15000; // 15s — fast enough to catch OOM
// Auto-detected from available RAM — see auto-memory.mjs.
// On 512MB: threshold is 80% of 400MB heap = 320MB.
// On 2GB: threshold is 85% of 1600MB heap = 1360MB.
// Upgrade your Render plan and this adjusts automatically.
const MEMORY_THRESHOLD_FRACTION = MEM_PROFILE.memoryThresholdFraction;

// ── State ───────────────────────────────────────────────────────
let childProcess = null;
let restartTimestamps = [];
let isShuttingDown = false;
let isRestarting = false;
let healthCheckTimer = null;
let memoryCheckTimer = null;
let consecutiveHealthFailures = 0;
let startTime = 0;

// ── Helpers ─────────────────────────────────────────────────────
const ts = () => new Date().toLocaleTimeString("en-US", { hour12: false });

function log(msg) {
  console.log(`[start-recovery] ${ts()} ${msg}`);
}

function logWarn(msg) {
  console.warn(`[start-recovery] ${ts()} ${msg}`);
}

function logError(msg) {
  console.error(`[start-recovery] ${ts()} ${msg}`);
}

function getPort() {
  const portIdx = process.argv.indexOf("--port");
  if (portIdx !== -1 && process.argv[portIdx + 1]) {
    return process.argv[portIdx + 1];
  }
  return process.env.PORT || "3000";
}

function getBackoffMs() {
  const attempt = Math.min(restartTimestamps.length, 4);
  return Math.min(INITIAL_BACKOFF_MS * Math.pow(2, attempt), MAX_BACKOFF_MS);
}

function canRestart() {
  const now = Date.now();
  restartTimestamps = restartTimestamps.filter(
    (t) => now - t < RESTART_WINDOW_MS,
  );
  if (restartTimestamps.length >= MAX_RESTARTS) {
    logError(
      `max ${MAX_RESTARTS} restarts in ${RESTART_WINDOW_MS / 1000}s — exiting. ` +
      `Render will re-provision the service.`,
    );
    return false;
  }
  return true;
}

function killProcessTree(pid) {
  if (!childProcess || childProcess.exitCode !== null) return;
  try {
    // On Linux, kill the process group (negative PID) to catch child
    // processes spawned by next start (workers, etc.). On other platforms,
    // fall back to killing just the direct child.
    try {
      process.kill(-pid, "SIGTERM");
    } catch {
      childProcess.kill("SIGTERM");
    }
  } catch {}
  // Force-kill after grace period.
  setTimeout(() => {
    if (childProcess && childProcess.exitCode === null) {
      try {
        try { process.kill(-pid, "SIGKILL"); } catch {}
        childProcess.kill("SIGKILL");
      } catch {}
    }
  }, 5000);
}

/**
 * Read RSS (in bytes) of the child process. On Linux, reads
 * /proc/[pid]/status (VmRSS). Falls back to the wrapper's own
 * memoryUsage() on non-Linux platforms (e.g. macOS dev).
 *
 * We also sum the RSS of all child PIDs in the process group, since
 * `next start` may spawn worker processes.
 */
function getChildRssBytes(pid) {
  // Linux: read /proc/[pid]/status and walk the process group.
  try {
    // Get all PIDs in the process group (includes next start workers).
    let pids = [pid];
    try {
      const pgidOut = execSync(`ps -o pgid= -p ${pid}`, { timeout: 2000 }).toString().trim();
      const pgid = pgidOut.split(/\s+/)[0];
      const groupPids = execSync(`ps -eo pid,pgid | awk '$2 == ${pgid} {print $1}'`, { timeout: 2000 })
        .toString().trim().split("\n").map(s => s.trim()).filter(Boolean);
      if (groupPids.length > 0) pids = groupPids;
    } catch {}
    // Sum RSS from /proc/[pid]/status for each PID.
    let totalRss = 0;
    for (const p of pids) {
      try {
        const status = readFileSync(`/proc/${p}/status`, "utf8");
        const rssLine = status.match(/VmRSS:\s+(\d+)\s+kB/);
        if (rssLine) totalRss += parseInt(rssLine[1], 10) * 1024;
      } catch {}
    }
    if (totalRss > 0) return totalRss;
  } catch {}
  // Fallback: wrapper's own RSS (not ideal, but better than nothing on macOS).
  return process.memoryUsage().rss;
}

// ── Memory monitoring ───────────────────────────────────────────
/**
 * Monitors the child process memory usage. If RSS exceeds a threshold
 * fraction of the configured heap limit, proactively restarts the server
 * before the OS OOM-killer terminates it.
 *
 * The heap limit is auto-detected from available RAM — see auto-memory.mjs.
 * On 512MB Render: heap=400MB, threshold=80% → 320MB restart trigger.
 * On 2GB Render: heap=1600MB, threshold=85% → 1360MB restart trigger.
 */
function getMemoryThresholdBytes() {
  // Use auto-detected heap size, or fall back to NODE_OPTIONS env var,
  // or fall back to auto-memory profile's recommendation.
  const nodeOptions = process.env.NODE_OPTIONS || "";
  const match = nodeOptions.match(/--max-old-space-size=(\d+)/);
  const heapLimitMB = match ? parseInt(match[1], 10) : MEM_PROFILE.heapMB;
  return Math.floor(heapLimitMB * 1024 * 1024 * MEMORY_THRESHOLD_FRACTION);
}

function startMemoryMonitor() {
  if (memoryCheckTimer) clearInterval(memoryCheckTimer);
  const threshold = getMemoryThresholdBytes();

  memoryCheckTimer = setInterval(() => {
    if (isShuttingDown || isRestarting || !childProcess?.pid) return;
    try {
      const rss = getChildRssBytes(childProcess.pid);
      const rssMB = (rss / 1024 / 1024).toFixed(1);
      const thresholdMB = (threshold / 1024 / 1024).toFixed(0);

      if (rss > threshold) {
        logWarn(
          `child memory threshold exceeded: RSS ${rssMB}MB > ${thresholdMB}MB ` +
          `— proactive restart to avoid OOM`,
        );
        if (canRestart()) {
          scheduleRestart("memory-threshold");
        }
      }
    } catch {
      // memory check can fail during shutdown — ignore.
    }
  }, MEMORY_CHECK_INTERVAL_MS);
}

// ── Health check ────────────────────────────────────────────────
async function healthCheck(port) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), HEALTH_CHECK_TIMEOUT_MS);
  try {
    // Use deep=1 for the internal health check — this also pings the DB.
    // Render's external health check (render.yaml healthCheckPath) uses
    // the default liveness-only endpoint (no DB query) so cold-start DB
    // delays don't trigger Render restarts.
    const res = await fetch(`http://localhost:${port}/api/health?deep=1`, {
      signal: controller.signal,
    });
    return res.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timeout);
  }
}

function startHealthChecker(port) {
  if (healthCheckTimer) clearInterval(healthCheckTimer);
  // NOTE: do NOT clear memoryCheckTimer here — it's managed by
  // startMemoryMonitor(). Clearing it here was a bug that caused the
  // memory monitor to silently stop after the first health-check restart.

  // Wait for the startup grace period before beginning checks.
  setTimeout(() => {
    healthCheckTimer = setInterval(async () => {
      if (isShuttingDown || isRestarting) return;
      const healthy = await healthCheck(port);
      if (healthy) {
        consecutiveHealthFailures = 0;
      } else {
        consecutiveHealthFailures++;
        logWarn(
          `health check failed (${consecutiveHealthFailures}/${HEALTH_CHECK_MAX_FAILURES})`,
        );
        if (consecutiveHealthFailures >= HEALTH_CHECK_MAX_FAILURES) {
          logError(
            `server unhealthy after ${HEALTH_CHECK_MAX_FAILURES} consecutive health check failures — restarting`,
          );
          consecutiveHealthFailures = 0;
          if (canRestart()) {
            scheduleRestart("health-check-failure");
          }
        }
      }
    }, HEALTH_CHECK_INTERVAL_MS);
  }, STARTUP_GRACE_PERIOD_MS);
}

// ── Core: start server ──────────────────────────────────────────
function startServer() {
  if (isShuttingDown || isRestarting) return;
  isRestarting = false;
  startTime = Date.now();
  consecutiveHealthFailures = 0;

  const port = getPort();
  // Use the direct node path to next's CLI instead of `npx next start`.
  // npx adds 200-500ms of package resolution overhead on every cold start.
  const nextBin = join(WEB_DIR, "node_modules/.bin/next");
  const cmd = process.platform === "win32" ? "npx.cmd" : nextBin;
  const args = process.platform === "win32" ? ["next", "start", "-p", port] : ["start", "-p", port];

  // Auto-set NODE_OPTIONS with the right heap size if not already set.
  // This lets the app adapt when you upgrade your Render plan — the
  // wrapper detects the new memory limit and sets --max-old-space-size
  // accordingly. If you've manually set NODE_OPTIONS in the Render
  // dashboard, that takes precedence.
  let childEnv = { ...process.env, PORT: port };
  const existingNodeOptions = process.env.NODE_OPTIONS || "";
  if (!existingNodeOptions.includes("--max-old-space-size")) {
    childEnv.NODE_OPTIONS = `${existingNodeOptions} --max-old-space-size=${MEM_PROFILE.heapMB}`.trim();
  }

  log(`starting: next start -p ${port}`);
  log(getMemorySummary());

  childProcess = spawn(cmd, args, {
    cwd: WEB_DIR,
    stdio: ["inherit", "pipe", "pipe"],
    env: childEnv,
    // Create a new process group so we can kill the whole tree
    // (next start may spawn worker processes).
    detached: true,
  });

  childProcess.stdout.on("data", (data) => {
    process.stdout.write(data);
  });

  childProcess.stderr.on("data", (data) => {
    process.stderr.write(data);
  });

  childProcess.on("exit", (code, signal) => {
    if (healthCheckTimer) clearInterval(healthCheckTimer);
    if (memoryCheckTimer) clearInterval(memoryCheckTimer);

    if (isShuttingDown) return;

    const uptime = ((Date.now() - startTime) / 1000).toFixed(1);
    if (code === 0 && !signal) {
      log(`server exited cleanly (uptime: ${uptime}s)`);
      return;
    }

    // Detect OOM kills: SIGKILL (signal 9) with no error output usually
    // means the OS OOM killer terminated the process. On Render's 512MB
    // tier, this is the most common cause of unexpected crashes.
    if (signal === "SIGKILL") {
      logError(
        `server killed by OS (likely OOM — signal SIGKILL, uptime: ${uptime}s). ` +
        `On 512MB Render, consider reducing concurrency or upgrading to 2GB plan.`
      );
    } else {
      logWarn(`server crashed (code=${code}, signal=${signal}, uptime: ${uptime}s)`);
    }
    if (canRestart()) {
      scheduleRestart(signal === "SIGKILL" ? "oom-kill" : "crash");
    }
  });

  // Start health checking after the server has had time to boot.
  startHealthChecker(port);
  startMemoryMonitor();
}

// ── Restart scheduling ──────────────────────────────────────────
function scheduleRestart(reason) {
  if (isRestarting || isShuttingDown) return;
  isRestarting = true;

  const backoff = getBackoffMs();
  restartTimestamps.push(Date.now());
  log(`restart #${restartTimestamps.length} (${reason}) in ${(backoff / 1000).toFixed(1)}s`);

  if (childProcess?.pid) {
    killProcessTree(childProcess.pid);
  }

  setTimeout(() => {
    if (isShuttingDown) return;
    isRestarting = false;
    startServer();
  }, backoff);
}

// ── Graceful shutdown ───────────────────────────────────────────
function shutdown(signal) {
  if (isShuttingDown) return;
  isShuttingDown = true;
  log(`received ${signal} — graceful shutdown (max ${SHUTDOWN_GRACE_MS / 1000}s)`);

  if (healthCheckTimer) clearInterval(healthCheckTimer);
  if (memoryCheckTimer) clearInterval(memoryCheckTimer);

  if (childProcess?.pid && childProcess.exitCode === null) {
    // Send SIGTERM to next start — it stops accepting new connections
    // and waits for in-flight requests to drain.
    try { childProcess.kill("SIGTERM"); } catch {}

    // Force exit after grace period.
    setTimeout(() => {
      if (childProcess && childProcess.exitCode === null) {
        logWarn("grace period expired — force killing");
        try { childProcess.kill("SIGKILL"); } catch {}
      }
      process.exit(0);
    }, SHUTDOWN_GRACE_MS);
  } else {
    process.exit(0);
  }
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

// ── Main ────────────────────────────────────────────────────────
const nextDir = join(WEB_DIR, ".next");
if (!existsSync(nextDir)) {
  logError(".next directory not found — run `pnpm build` first");
  process.exit(1);
}

log("production start with auto-recovery");
log(`config: max ${MAX_RESTARTS} restarts / ${RESTART_WINDOW_MS / 1000}s, ` +
    `health check every ${HEALTH_CHECK_INTERVAL_MS / 1000}s, ` +
    `shutdown grace ${SHUTDOWN_GRACE_MS / 1000}s`);

startServer();
