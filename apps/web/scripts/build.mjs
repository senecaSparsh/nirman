/**
 * Adaptive Build Wrapper
 * =======================
 *
 * Detects available RAM and sets --max-old-space-size accordingly before
 * running `next build --webpack`. This prevents OOM kills on Render's 512MB
 * free tier (where hardcoding 4096MB heap would crash the build) while
 * still allowing fast builds on larger instances.
 *
 * Memory profile:
 *   512MB → heap=471MB  (Render free tier — 92% of RAM, tight but works
 *                         with ESLint skip + webpack cache disabled)
 *   1GB   → heap=920MB
 *   2GB   → heap=1600MB (78% — enough headroom, don't over-allocate)
 *   4GB+  → heap=3200MB (local dev — fast builds)
 *
 * If NODE_OPTIONS already has --max-old-space-size, we respect it.
 *
 * Usage: node scripts/build.mjs
 *   (called from package.json `build` script)
 */

import { spawn } from "node:child_process";
import { totalmem } from "node:os";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const WEB_DIR = join(__dirname, "..");

function detectTotalMemoryMB() {
  // cgroup v2 (Render, Docker, K8s)
  try {
    const max = readFileSync("/sys/fs/cgroup/memory.max", "utf8").trim();
    if (max && max !== "max") {
      const bytes = parseInt(max, 10);
      if (bytes > 0 && bytes < Number.MAX_SAFE_INTEGER) {
        return Math.floor(bytes / (1024 * 1024));
      }
    }
  } catch {}
  // cgroup v1
  try {
    const limit = readFileSync("/sys/fs/cgroup/memory/memory.limit_in_bytes", "utf8").trim();
    if (limit) {
      const bytes = parseInt(limit, 10);
      if (bytes > 0 && bytes < 1e15) {
        return Math.floor(bytes / (1024 * 1024));
      }
    }
  } catch {}
  return Math.floor(totalmem() / (1024 * 1024));
}

const totalMB = detectTotalMemoryMB();
// Heap allocation strategy:
//   ≤1GB (constrained containers like Render free tier): use 92% of RAM.
//     The container has minimal OS overhead (no GUI, no other processes),
//     so we can safely give most of the memory to V8. This is critical —
//     a webpack production build of a large Next.js app needs ~450MB+ heap,
//     and 78% of 512MB (400MB) was not enough (OOM at 435MB).
//   >1GB: use 78% — enough headroom for the OS + V8 non-heap overhead,
//     and over-allocating on larger instances wastes money.
// Cap at 4096 for local dev (32GB+ machines don't need more than 4GB heap).
const heapFraction = totalMB <= 1024 ? 0.92 : 0.78;
const heapMB = Math.max(256, Math.min(4096, Math.floor(totalMB * heapFraction)));

const existingNodeOptions = process.env.NODE_OPTIONS || "";
let nodeOptions;
// Check if NODE_OPTIONS already has --max-old-space-size set.
const existingHeapMatch = existingNodeOptions.match(/--max-old-space-size=(\d+)/);
const existingHeapMB = existingHeapMatch ? parseInt(existingHeapMatch[1], 10) : null;

if (existingHeapMB !== null && existingHeapMB >= heapMB) {
  // Explicit override that's >= our auto-detected value — respect it
  // (the user intentionally set a higher limit).
  nodeOptions = existingNodeOptions;
  console.log(`[build] using existing NODE_OPTIONS: ${nodeOptions}`);
} else if (existingHeapMB !== null && existingHeapMB < heapMB) {
  // Explicit override that's LOWER than what we'd auto-detect — this is
  // likely a stale value from the Render dashboard (e.g. 440MB from when
  // the plan was smaller). Replace it with the auto-detected value to
  // prevent OOM. Preserve any other NODE_OPTIONS flags.
  const stripped = existingNodeOptions.replace(/--max-old-space-size=\d+/, "").trim();
  nodeOptions = `${stripped} --max-old-space-size=${heapMB}`.trim();
  console.log(`[build] ${totalMB}MB RAM detected → heap=${heapMB}MB (overriding stale NODE_OPTIONS heap=${existingHeapMB}MB)`);
} else {
  nodeOptions = `${existingNodeOptions} --max-old-space-size=${heapMB}`.trim();
  console.log(`[build] ${totalMB}MB RAM detected → heap=${heapMB}MB`);
}

const env = { ...process.env, NODE_OPTIONS: nodeOptions };
const cmd = process.platform === "win32" ? "npx.cmd" : "npx";

// Support --turbopack flag for build:turbo script (testing only).
const useTurbopack = process.argv.includes("--turbopack");
const args = useTurbopack ? ["next", "build"] : ["next", "build", "--webpack"];

console.log(`[build] starting: next build ${useTurbopack ? "" : "--webpack"}`);

const child = spawn(cmd, args, {
  cwd: WEB_DIR,
  stdio: "inherit",
  env,
});

child.on("exit", (code) => {
  process.exit(code ?? 1);
});

child.on("error", (err) => {
  console.error("[build] failed to start:", err);
  process.exit(1);
});
