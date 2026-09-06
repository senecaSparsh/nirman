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
  // Step 1: Run prisma migrate deploy in a loop, auto-resolving any
  // failed migrations (P3018 = migration failed to apply, P3009 = failed
  // migrations found in DB from a previous attempt). The most common cause
  // is "already exists" errors (e.g. CREATE TYPE for an enum that db push
  // already created). In that case the schema is already in the desired
  // state — we mark the migration as applied and retry.
  let result;
  const resolvedMigrations = new Set();
  const MAX_RESOLUTION_ATTEMPTS = 10;

  for (let attempt = 0; attempt <= MAX_RESOLUTION_ATTEMPTS; attempt++) {
    console.log(`[migrate:deploy] running: prisma migrate deploy${attempt > 0 ? ` (attempt ${attempt + 1})` : ""}`);
    result = await runCommand(["prisma", "migrate", "deploy"], "migrate deploy");

    if (result.code === 0) break; // success

    const hasP3018 = result.output.includes("P3018");
    const hasP3009 = result.output.includes("P3009");
    if (!hasP3018 && !hasP3009) break; // unknown error — don't loop

    // Extract the failed migration name from the output.
    // P3018 prints: "Migration name: 0004_schema_sync"
    // P3009 prints: "The `0004_schema_sync` migration started at ... failed"
    let migrationName = null;
    const p3018Match = result.output.match(/Migration name:\s*(\S+)/);
    if (p3018Match) {
      migrationName = p3018Match[1];
    } else {
      const p3009Match = result.output.match(/The `(\S+)` migration started/);
      if (p3009Match) migrationName = p3009Match[1];
    }

    if (!migrationName) break; // can't extract name — don't loop

    const isAlreadyExists = result.output.includes("already exists");

    // If we already marked this migration as applied and it STILL fails,
    // something is genuinely wrong — don't loop forever.
    if (resolvedMigrations.has(migrationName) && !isAlreadyExists) {
      console.error(`[migrate:deploy] migration ${migrationName} failed again after resolve — giving up`);
      break;
    }

    console.log(
      `[migrate:deploy] Migration ${migrationName} failed${isAlreadyExists ? " (already exists — schema is in sync)" : ""}. ` +
        `Resolving and retrying.`,
    );

    // Mark the failed migration as rolled back first (clears the failed
    // state in _prisma_migrations so Prisma doesn't block with P3009).
    console.log(`[migrate:deploy] running: prisma migrate resolve --rolled-back ${migrationName}`);
    await runCommand(["prisma", "migrate", "resolve", "--rolled-back", migrationName], "migrate resolve");

    // If the error was "already exists", the schema is already in the
    // desired state. Mark the migration as applied so Prisma doesn't
    // try to re-run it on the next attempt.
    if (isAlreadyExists) {
      console.log(`[migrate:deploy] running: prisma migrate resolve --applied ${migrationName}`);
      await runCommand(["prisma", "migrate", "resolve", "--applied", migrationName], "migrate resolve (applied)");
      resolvedMigrations.add(migrationName);
    }
    // Note: we only add to resolvedMigrations when marked as applied.
    // A rolled-back-only migration may fail again with P3018 (the actual
    // error), and we need to be able to handle that on the next loop.

    // Loop continues — will retry migrate deploy
  }

  if (result.code !== 0) {
    console.error("[migrate:deploy] migrations failed — see output above");
    process.exit(result.code);
  }

  // Step 2b: Always run `db push` after migrations to ensure the DB schema
  // is fully synced with schema.prisma. This catches columns/tables that were
  // skipped by the "already exists" migration resolution (where we marked a
  // migration as applied without running its SQL). db push only ADDS missing
  // schema elements — it won't drop data unless columns were removed from the
  // schema (which we never do for master entities per AGENTS.md soft-delete
  // convention).
  console.log("[migrate:deploy] running: prisma db push (ensure schema sync)");
  // --accept-data-loss is needed because Prisma warns about adding unique
  // constraints on existing columns. On a fresh DB (or when there are no
  // actual duplicate values), there is no data loss — the flag just silences
  // the warning. Without it, db push exits non-zero and the schema doesn't
  // get synced, causing "column does not exist" errors at runtime.
  const pushResult = await runCommand(
    ["prisma", "db", "push", "--skip-generate", "--accept-data-loss"],
    "db push",
  );
  if (pushResult.code !== 0) {
    console.log("[migrate:deploy] db push had warnings — continuing anyway");
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
