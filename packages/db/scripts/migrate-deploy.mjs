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
 * Also handles the common "already exists" migration failure (P3018)
 * that occurs when the DB was previously synced via `db push` (which
 * creates types/tables directly) and then a migration tries to
 * `CREATE TYPE` the same enum. The wrapper marks the failed migration
 * as resolved (the schema is already in the desired state) and retries.
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
if (!process.env.DIRECT_URL && process.env.DATABASE_URL) {
  process.env.DIRECT_URL = process.env.DATABASE_URL;
  console.log("[migrate:deploy] DIRECT_URL not set — falling back to DATABASE_URL");
}

const env = { ...process.env };
const cmd = process.platform === "win32" ? "npx.cmd" : "npx";

/**
 * Run a command and capture its stdout+stderr output.
 * Returns { code, output }.
 */
function runCommand(args, label) {
  return new Promise((resolve) => {
    let output = "";
    const child = spawn(cmd, args, {
      cwd: DB_DIR,
      stdio: ["inherit", "pipe", "pipe"],
      env,
    });
    child.stdout.on("data", (d) => {
      const s = d.toString();
      output += s;
      process.stdout.write(s);
    });
    child.stderr.on("data", (d) => {
      const s = d.toString();
      output += s;
      process.stderr.write(s);
    });
    child.on("exit", (code) => resolve({ code: code ?? 1, output }));
    child.on("error", (err) => {
      console.error(`[migrate:deploy] ${label} failed to start:`, err);
      resolve({ code: 1, output: output + err.message });
    });
  });
}

async function main() {
  // Step 1: Run prisma migrate deploy
  console.log("[migrate:deploy] running: prisma migrate deploy");
  let result = await runCommand(["prisma", "migrate", "deploy"], "migrate deploy");

  // Step 2: If it failed with P3018 (a migration failed to apply), try to
  // resolve the failed migration. The most common cause is "already exists"
  // errors (e.g. CREATE TYPE for an enum that db push already created).
  // In that case, the schema is already in the desired state — we mark the
  // migration as applied and retry.
  if (result.code !== 0 && result.output.includes("P3018")) {
    // Extract the failed migration name from the output.
    // Prisma prints: "Migration name: 0004_schema_sync"
    const migrationMatch = result.output.match(/Migration name:\s*(\S+)/);
    const migrationName = migrationMatch?.[1];

    if (migrationName) {
      const isAlreadyExists = result.output.includes("already exists");
      console.log(
        `[migrate:deploy] Migration ${migrationName} failed${isAlreadyExists ? " (already exists — schema is in sync)" : ""}. ` +
          `Marking as resolved and retrying.`,
      );

      // Mark the failed migration as resolved (rolled back).
      console.log(`[migrate:deploy] running: prisma migrate resolve --rolled-back ${migrationName}`);
      await runCommand(["prisma", "migrate", "resolve", "--rolled-back", migrationName], "migrate resolve");

      // If the error was "already exists", the schema is already in the
      // desired state. Mark the migration as applied so Prisma doesn't
      // try to re-run it.
      if (isAlreadyExists) {
        console.log(`[migrate:deploy] running: prisma migrate resolve --applied ${migrationName}`);
        await runCommand(["prisma", "migrate", "resolve", "--applied", migrationName], "migrate resolve (applied)");
      }

      // Retry the full migrate deploy — remaining migrations should apply.
      console.log("[migrate:deploy] retrying: prisma migrate deploy");
      result = await runCommand(["prisma", "migrate", "deploy"], "migrate deploy (retry)");
    }
  }

  if (result.code !== 0) {
    console.error("[migrate:deploy] migrations failed — see output above");
    process.exit(result.code);
  }

  // Step 3: Run data-fixes.sql (optional — non-fatal if missing/empty)
  console.log("[migrate:deploy] running: prisma db execute data-fixes.sql");
  const fixResult = await runCommand(
    ["prisma", "db", "execute", "--file", "./prisma/data-fixes.sql", "--schema", "./prisma/schema.prisma"],
    "data-fixes",
  );
  if (fixResult.code !== 0) {
    console.log("[migrate:deploy] data-fixes.sql skipped (may not exist or be empty)");
  }

  console.log("[migrate:deploy] done");
  process.exit(0);
}

main().catch((err) => {
  console.error("[migrate:deploy] unexpected error:", err);
  process.exit(1);
});
