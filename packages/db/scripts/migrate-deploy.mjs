/**
 * Migration deploy wrapper.
 *
 * Ensures DIRECT_URL is set before running `prisma migrate deploy`.
 * The schema uses `directUrl = env("DIRECT_URL")` for non-pooled
 * migration connections (Prisma recommends a direct connection for
 * migrations, not a pooled one). But on Render, the `DIRECT_URL` env
 * var may not be set in the dashboard (blueprint updates don't always
 * sync env vars to existing services). This wrapper falls back to
 * `DATABASE_URL` so migrations work even without explicit `DIRECT_URL`.
 *
 * Usage: node scripts/migrate-deploy.mjs
 *   (called from package.json `migrate:deploy` script)
 */

import { spawn } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const DB_DIR = dirname(__dirname); // packages/db

// If DIRECT_URL is not set, fall back to DATABASE_URL.
// On Render free tier, both point to the same direct (non-pooled) connection.
if (!process.env.DIRECT_URL && process.env.DATABASE_URL) {
  process.env.DIRECT_URL = process.env.DATABASE_URL;
  console.log("[migrate:deploy] DIRECT_URL not set — falling back to DATABASE_URL");
}

const env = { ...process.env };
const cmd = process.platform === "win32" ? "npx.cmd" : "npx";

// Run prisma migrate deploy, then data-fixes.sql
const args1 = ["prisma", "migrate", "deploy"];
const args2 = ["prisma", "db", "execute", "--file", "./prisma/data-fixes.sql", "--schema", "./prisma/schema.prisma"];

console.log("[migrate:deploy] running: prisma migrate deploy");

const child1 = spawn(cmd, args1, { cwd: DB_DIR, stdio: "inherit", env });

child1.on("exit", (code1) => {
  if (code1 !== 0) {
    process.exit(code1 ?? 1);
  }
  console.log("[migrate:deploy] running: prisma db execute data-fixes.sql");
  const child2 = spawn(cmd, args2, { cwd: DB_DIR, stdio: "inherit", env });
  child2.on("exit", (code2) => {
    process.exit(code2 ?? 1);
  });
  child2.on("error", (err) => {
    console.error("[migrate:deploy] data-fixes failed:", err.message);
    // data-fixes.sql may not exist or may be empty — don't fail the build
    // if it's just missing optional seed fixes.
    process.exit(0);
  });
});

child1.on("error", (err) => {
  console.error("[migrate:deploy] failed to start:", err);
  process.exit(1);
});
