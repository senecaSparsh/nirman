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
 *   512MB → heap=400MB  (Render free tier — aggressive GC, survives)
 *   1GB   → heap=800MB
 *   2GB   → heap=1600MB
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
// Heap: ~78% of total RAM (leaves room for OS + non-heap V8 overhead).
// Cap at 4096 for local dev (32GB+ machines don't need more than 4GB heap
// for a Next.js build).
const heapMB = Math.max(256, Math.min(4096, Math.floor(totalMB * 0.78)));

const existingNodeOptions = process.env.NODE_OPTIONS || "";
let nodeOptions;
if (existingNodeOptions.includes("--max-old-space-size")) {
  // Respect explicit override
  nodeOptions = existingNodeOptions;
  console.log(`[build] using existing NODE_OPTIONS: ${nodeOptions}`);
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
