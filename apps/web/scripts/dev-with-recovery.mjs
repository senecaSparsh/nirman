/**
 * Dev Server with Auto-Recovery
 * =================================
 *
 * Wraps `next dev --turbopack` with self-healing logic that eliminates the
 * need for manual `rm -rf .next && pnpm dev` cycles when Turbopack's cache
 * desyncs (the notorious "module factory is not available" error and its
 * siblings).
 *
 * Three recovery layers:
 *
 *  1. **stdout/stderr monitoring** — watches the dev server output for known
 *     Turbopack internal-error signatures. On detection: kills the process
 *     tree, clears `.next`, and restarts with exponential backoff.
 *
 *  2. **File-system watcher** — monitors `node_modules/.pnpm` (dependency
 *     changes) and `packages/db/prisma/schema.prisma` (schema changes).
 *     Dependency changes clear `.next` + restart; schema changes run
 *     `pnpm db:generate` first, then clear + restart (the Prisma singleton
 *     cache issue documented in AGENTS.md).
 *
 *  3. **Crash recovery** — if the process exits with a non-zero code
 *     unexpectedly, restart it (with cache clear after 3 consecutive crashes).
 *
 * Safety rails:
 *  - Max 10 restarts in a 5-minute window (then exits to avoid loops).
 *  - Restart counter resets after 5 minutes of stable uptime.
 *  - Exponential backoff: 500ms → 1s → 2s → 4s (capped at 4s).
 *  - Clean Ctrl+C handling — kills the child tree and exits immediately.
 *  - All restarts are logged with timestamps for visibility.
 *
 * Usage:
 *   node scripts/dev-with-recovery.mjs          # wraps `next dev --turbopack`
 *   node scripts/dev-with-recovery.mjs --clean  # clear .next before starting
 *
 * Zero external dependencies — uses only Node.js built-ins.
 */

import { spawn, execSync } from "node:child_process";
import { existsSync, rmSync, watch, readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const WEB_DIR = join(__dirname, "..");
const NEXT_DIR = join(WEB_DIR, ".next");
const REPO_ROOT = join(WEB_DIR, "../..");
const PRISMA_SCHEMA = join(REPO_ROOT, "packages/db/prisma/schema.prisma");
const PNPM_STORE = join(REPO_ROOT, "node_modules/.pnpm");

// ── Config ──────────────────────────────────────────────────────
const MAX_RESTARTS = 10;
const RESTART_WINDOW_MS = 5 * 60 * 1000; // 5 min
const STABLE_UPTIME_RESET_MS = 5 * 60 * 1000; // 5 min of stability resets counter
const INITIAL_BACKOFF_MS = 500;
const MAX_BACKOFF_MS = 4000;

// Self-sustaining watcher gates (prevent the restart loop caused by
// macOS fs.watch spurious events + prisma generate touching files).
const SCHEMA_STARTUP_GRACE_MS = 5000;  // ignore schema events in first 5s after server start
const SCHEMA_GENERATE_COOLDOWN_MS = 15000;  // ignore schema events for 15s after a prisma generate
const SCHEMA_DEBOUNCE_MS = 1500;  // debounce rapid fs.watch bursts
const SCHEMA_HASH_MAX_LEN = 8 * 1024 * 1024;  // cap file read at 8MB (schema is ~600KB)

// Turbopack internal-error signatures (server-side stdout/stderr).
// These are NOT user code errors — they're Turbopack cache/compilation
// failures that require a clean .next to recover from.
const ERROR_SIGNATURES = [
  "module factory is not available",
  "It might have been deleted in an HMR update",
  "ENOENT: no such file or directory, open",
  "_buildManifest.js.tmp",
  "Cannot read properties of undefined (reading 'findMany')",
  "Cannot read properties of undefined (reading 'findFirst')",
  "Cannot read properties of undefined (reading 'aggregate')",
  "Turbopack crashed",
  "Internal error during transform",
  "failed to resolve module",
  "ChunkRenderError",
  "Module not found after HMR update",
  // Turbopack internal database corruption (RocksDB SST files).
  // Requires a clean .next/dev/cache to recover.
  "TurbopackInternalError",
  "Failed to restore task data",
  "corrupted database or bug",
  "Invalid block type",
  "An unexpected Turbopack error occurred",
  "Persisting failed: Unable to open static sorted file",
];

// ── State ───────────────────────────────────────────────────────
let childProcess = null;
let restartCount = 0;
let restartTimestamps = [];
let stableUptimeTimer = null;
let startTime = 0;
let isShuttingDown = false;
let isRestarting = false;
let fileWatcherDebounce = null;

// ── Schema-content tracking (prevents false-positive restart loops) ──
// We hash the schema.prisma content and only restart when it ACTUALLY
// changes. macOS fs.watch fires spurious events; prisma generate touches
// files in the repo which can re-trigger the watcher. Without a content
// check, these cause the infinite "schema changed → generate → restart →
// schema changed" loop.
let lastSchemaHash = null;
let generateCooldownUntil = 0;  // timestamp; ignore schema events until this time
let schemaWatcherReady = false;  // false during startup grace period

function computeSchemaHash() {
  if (!existsSync(PRISMA_SCHEMA)) return null;
  try {
    const content = readFileSync(PRISMA_SCHEMA, { encoding: "utf8", length: SCHEMA_HASH_MAX_LEN });
    return createHash("sha256").update(content).digest("hex").slice(0, 16);
  } catch {
    return null;
  }
}

// ── Helpers ─────────────────────────────────────────────────────
const ts = () => new Date().toLocaleTimeString("en-US", { hour12: false });

function log(msg) {
  console.log(`\x1b[36m[dev-recovery]\x1b[0m ${ts()} ${msg}`);
}

function logWarn(msg) {
  console.log(`\x1b[33m[dev-recovery]\x1b[0m ${ts()} ${msg}`);
}

function logError(msg) {
  console.log(`\x1b[31m[dev-recovery]\x1b[0m ${ts()} ${msg}`);
}

function clearNextCache() {
  if (existsSync(NEXT_DIR)) {
    try {
      rmSync(NEXT_DIR, { recursive: true, force: true });
      log("cleared .next cache");
    } catch (err) {
      logWarn(`could not clear .next: ${err.message}`);
    }
  }
}

function killProcessTree(pid) {
  if (!childProcess || childProcess.exitCode !== null) return;
  try {
    // On Unix, send SIGTERM to the process group (negative PID).
    // On Windows, use taskkill /T /F.
    if (process.platform === "win32") {
      execSync(`taskkill /PID ${pid} /T /F`, { stdio: "ignore" });
    } else {
      process.kill(-pid, "SIGTERM");
    }
  } catch {
    // Process may already be dead — try direct kill as fallback.
    try { childProcess.kill("SIGTERM"); } catch {}
  }
  // Force-kill after 2s if still alive.
  setTimeout(() => {
    if (childProcess && childProcess.exitCode === null) {
      try {
        if (process.platform === "win32") {
          execSync(`taskkill /PID ${pid} /T /F`, { stdio: "ignore" });
        } else {
          process.kill(-pid, "SIGKILL");
        }
      } catch {
        try { childProcess.kill("SIGKILL"); } catch {}
      }
    }
  }, 2000);
}

function shouldRestart(errorOutput) {
  return ERROR_SIGNATURES.some((sig) => errorOutput.includes(sig));
}

function getBackoffMs() {
  const attempt = Math.min(restartCount, 4);
  return Math.min(INITIAL_BACKOFF_MS * Math.pow(2, attempt), MAX_BACKOFF_MS);
}

function pruneOldRestarts() {
  const now = Date.now();
  restartTimestamps = restartTimestamps.filter(
    (t) => now - t < RESTART_WINDOW_MS,
  );
}

function canRestart() {
  pruneOldRestarts();
  if (restartTimestamps.length >= MAX_RESTARTS) {
    logError(
      `max ${MAX_RESTARTS} restarts in ${RESTART_WINDOW_MS / 1000}s — exiting to avoid loop. ` +
      `Run \`pnpm dev:clean\` manually, then \`pnpm dev\`.`,
    );
    return false;
  }
  return true;
}

function recordRestart() {
  restartTimestamps.push(Date.now());
  restartCount++;
}

function resetStableTimer() {
  if (stableUptimeTimer) clearTimeout(stableUptimeTimer);
  stableUptimeTimer = setTimeout(() => {
    if (restartCount > 0 && !isShuttingDown) {
      log(`server stable for ${STABLE_UPTIME_RESET_MS / 1000}s — resetting restart counter (was ${restartCount})`);
      restartCount = 0;
      restartTimestamps = [];
    }
  }, STABLE_UPTIME_RESET_MS);
}

// ── Core: start dev server ──────────────────────────────────────
function startDevServer(args = []) {
  if (isShuttingDown || isRestarting) return;
  isRestarting = false;
  startTime = Date.now();

  // Suppress schema-watcher events during the startup grace window.
  // macOS fs.watch often fires a burst of events when a watcher is first
  // attached, and Next.js's own startup file activity can trigger them.
  schemaWatcherReady = false;
  setTimeout(() => {
    if (!isShuttingDown && childProcess && childProcess.exitCode === null) {
      schemaWatcherReady = true;
    }
  }, SCHEMA_STARTUP_GRACE_MS);

  const cmd = process.platform === "win32" ? "npx.cmd" : "npx";
  const fullArgs = ["next", "dev", "--turbopack", ...args];

  log(`starting: next dev --turbopack ${args.join(" ")}`.trim());

  childProcess = spawn(cmd, fullArgs, {
    cwd: WEB_DIR,
    stdio: ["inherit", "pipe", "pipe"],
    env: { ...process.env, FORCE_COLOR: "1" },
    detached: true, // so we can kill the process group
  });

  let stderrBuffer = "";

  childProcess.stdout.on("data", (data) => {
    const text = data.toString();
    process.stdout.write(text);
    // Check for error signatures in stdout too (Next.js logs some errors there).
    if (shouldRestart(text)) {
      handleTurbopackError(text, "stdout");
    }
  });

  childProcess.stderr.on("data", (data) => {
    const text = data.toString();
    process.stderr.write(text);
    stderrBuffer += text;
    if (shouldRestart(text)) {
      handleTurbopackError(text, "stderr");
    }
  });

  childProcess.on("exit", (code, signal) => {
    const uptime = ((Date.now() - startTime) / 1000).toFixed(1);
    if (stableUptimeTimer) clearTimeout(stableUptimeTimer);

    if (isShuttingDown) return;

    // If the process exited on its own with code 0, don't restart.
    if (code === 0 && !signal) {
      log(`dev server exited cleanly (uptime: ${uptime}s)`);
      return;
    }

    // Unexpected crash — restart.
    logWarn(`dev server exited (code=${code}, signal=${signal}, uptime: ${uptime}s)`);
    if (canRestart()) {
      scheduleRestart("crash", code >= 3 || restartCount >= 3);
    }
  });

  // Mark stable after the server has been up long enough.
  resetStableTimer();
}

// ── Error handling ──────────────────────────────────────────────
function handleTurbopackError(errorText, source) {
  if (isRestarting || isShuttingDown) return;

  // Extract a short signature for logging.
  const signature = ERROR_SIGNATURES.find((s) => errorText.includes(s)) || "unknown";
  logError(`Turbopack error detected via ${source}: "${signature}"`);

  if (!canRestart()) return;
  scheduleRestart("turbopack-error", true);
}

function scheduleRestart(reason, clearCache = false) {
  if (isRestarting || isShuttingDown) return;
  isRestarting = true;

  const backoff = getBackoffMs();
  recordRestart();
  log(
    `restart #${restartCount} (${reason}) in ${(backoff / 1000).toFixed(1)}s` +
    (clearCache ? " + clear .next" : ""),
  );

  // Kill the current process.
  if (childProcess && childProcess.pid) {
    killProcessTree(childProcess.pid);
  }

  setTimeout(() => {
    if (isShuttingDown) return;
    if (clearCache) clearNextCache();
    isRestarting = false;
    startDevServer();
  }, backoff);
}

// ── File watcher ────────────────────────────────────────────────
function startFileWatcher() {
  // Watch prisma schema — changes require db:generate + cache clear.
  // SELF-SUSTAINING GUARDS (prevent the infinite restart loop):
  //   1. Content-hash check — only restart if the file's bytes actually
  //      changed. macOS fs.watch fires spurious events on stat/mtime
  //      changes that don't reflect real edits.
  //   2. Startup grace period — ignore events in the first few seconds
  //      after the dev server starts (watcher attachment burst + Next.js
  //      startup file activity).
  //   3. Post-generate cooldown — `prisma generate` writes to
  //      packages/db/src/generated/prisma, which on some filesystems
  //      re-triggers the schema watcher. We suppress events for 15s
  //      after a generate runs AND re-snapshot the hash so the new
  //      (unchanged) state is the baseline.
  if (existsSync(PRISMA_SCHEMA)) {
    // Snapshot the initial hash as the baseline.
    lastSchemaHash = computeSchemaHash();
    let schemaDebounce = null;
    try {
      watch(PRISMA_SCHEMA, () => {
        if (schemaDebounce) clearTimeout(schemaDebounce);
        schemaDebounce = setTimeout(() => {
          if (isRestarting || isShuttingDown) return;
          // Gate 1: startup grace period
          if (!schemaWatcherReady) return;
          // Gate 2: post-generate cooldown
          if (Date.now() < generateCooldownUntil) {
            // During cooldown, refresh the hash so the post-generate
            // state becomes the new baseline (don't treat it as a change).
            lastSchemaHash = computeSchemaHash();
            return;
          }
          // Gate 3: content-hash check
          const currentHash = computeSchemaHash();
          if (currentHash === lastSchemaHash) {
            // Spurious event — file didn't actually change.
            return;
          }
          // Real change — update baseline and restart.
          lastSchemaHash = currentHash;
          log("prisma/schema.prisma changed (content verified) — running db:generate + cache clear + restart");
          if (!canRestart()) return;
          isRestarting = true;
          if (childProcess?.pid) killProcessTree(childProcess.pid);
          // Run prisma generate, then restart.
          try {
            execSync("pnpm db:generate", { cwd: REPO_ROOT, stdio: "inherit" });
          } catch (err) {
            logWarn(`db:generate failed: ${err.message} — restarting anyway`);
          }
          // Set cooldown so the generate's file writes don't re-trigger us.
          generateCooldownUntil = Date.now() + SCHEMA_GENERATE_COOLDOWN_MS;
          // Re-snapshot hash after generate (in case generate reformats the file).
          lastSchemaHash = computeSchemaHash();
          clearNextCache();
          isRestarting = false;
          setTimeout(() => startDevServer(), 500);
        }, SCHEMA_DEBOUNCE_MS);
      });
      log("watching prisma/schema.prisma for changes (content-hash gated)");
    } catch (err) {
      logWarn(`could not watch prisma schema: ${err.message}`);
    }
  }

  // Watch node_modules/.pnpm directory — dependency changes require cache clear.
  // We watch the directory for renames/additions (pnpm creates new hash dirs
  // when versions change).
  if (existsSync(PNPM_STORE)) {
    try {
      watch(PNPM_STORE, (eventType, filename) => {
        // Only react to actual new directory entries (pnpm version hashes).
        if (!filename) return;
        if (fileWatcherDebounce) clearTimeout(fileWatcherDebounce);
        fileWatcherDebounce = setTimeout(() => {
          if (isRestarting || isShuttingDown) return;
          log(`node_modules/.pnpm changed (${filename}) — clearing .next + restart`);
          if (!canRestart()) return;
          scheduleRestart("dependency-change", true);
        }, 2000); // 2s debounce — pnpm install touches many files.
      });
      log("watching node_modules/.pnpm for dependency changes");
    } catch (err) {
      logWarn(`could not watch node_modules/.pnpm: ${err.message}`);
    }
  }
}

// ── Shutdown ────────────────────────────────────────────────────
function shutdown(signal) {
  if (isShuttingDown) return;
  isShuttingDown = true;
  log(`received ${signal} — shutting down`);

  if (stableUptimeTimer) clearTimeout(stableUptimeTimer);
  if (fileWatcherDebounce) clearTimeout(fileWatcherDebounce);

  if (childProcess?.pid) {
    killProcessTree(childProcess.pid);
  }

  // Give the process 2s to exit gracefully, then force-kill.
  setTimeout(() => {
    process.exit(0);
  }, 500);
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));

// ── Main ────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const shouldCleanStart = args.includes("--clean");

if (shouldCleanStart) {
  log("clean start requested — clearing .next");
  clearNextCache();
}

log("dev server with auto-recovery starting up");
log(`config: max ${MAX_RESTARTS} restarts / ${RESTART_WINDOW_MS / 1000}s window, ` +
    `backoff ${INITIAL_BACKOFF_MS}-${MAX_BACKOFF_MS}ms`);

startFileWatcher();
startDevServer();
