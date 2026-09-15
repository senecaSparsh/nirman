/**
 * Migration risk linter.
 *
 * Scans every migration.sql (and data-fixes.sql) for SQL statements that can
 * lose data or fail at deploy time on a populated database. This is the class
 * of change that `prisma migrate dev` happily generates and `migrate deploy`
 * happily applies — right up until it destroys data or fails mid-deploy.
 *
 * Flagged patterns:
 *   DROP TABLE / COLUMN / TYPE / SCHEMA   — permanent data loss
 *   TRUNCATE, DELETE FROM                 — data loss
 *   ADD COLUMN ... NOT NULL (no DEFAULT)  — FAILS on populated tables
 *   ALTER COLUMN ... SET NOT NULL         — fails if any NULL exists
 *   ALTER COLUMN ... TYPE / SET DATA TYPE — rewrite + possible cast failure
 *   CREATE UNIQUE INDEX                   — fails on existing duplicates
 *   RENAME                                — breaks old code during deploy
 *
 * A flagged statement is allowed ONLY if it carries an explicit opt-in
 * marker — `-- nirman:accept-risk <reason>` — on the same line or anywhere
 * in the statement's comment block (i.e. directly above it). This forces a
 * human to acknowledge the risk rather than shipping it silently.
 *
 * UPDATE/INSERT backfills are intentionally NOT flagged — they are the
 * correct way to add required columns (add nullable → backfill → SET NOT NULL
 * with markers).
 *
 * Usage: node scripts/check-migration-risk.mjs
 * Exit:  0 = clean or all flagged statements marked; 1 = unmarked risk found.
 */

import { readdirSync, readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DB_DIR = dirname(__dirname);
const MIGRATIONS_DIR = join(DB_DIR, "prisma", "migrations");
const MARKER = "nirman:accept-risk";

/** [regex, label] — matched against comment-stripped statement text. */
const RISKY = [
  [/\bDROP\s+TABLE\b/i, "DROP TABLE — permanent data loss"],
  [/\bDROP\s+COLUMN\b/i, "DROP COLUMN — permanent data loss"],
  [/\bDROP\s+TYPE\b/i, "DROP TYPE — breaks dependent columns"],
  [/\bDROP\s+SCHEMA\b/i, "DROP SCHEMA — permanent data loss"],
  [/\bTRUNCATE\b/i, "TRUNCATE — permanent data loss"],
  [/\bDELETE\s+FROM\s+(?!"_prisma_migrations")/i, "DELETE FROM — data loss"],
  [/\bSET\s+NOT\s+NULL\b/i, "SET NOT NULL — fails if any NULL exists in the table"],
  [
    /\bALTER\s+COLUMN\b[\s\S]*?\b(SET\s+DATA\s+TYPE|TYPE)\b/i,
    "ALTER COLUMN TYPE — table rewrite, possible cast failure",
  ],
  [/\bADD\s+COLUMN\b[\s\S]*?\bNOT\s+NULL\b/i, "required column — fails on populated tables (needs DEFAULT or backfill)"],
  [/\bCREATE\s+UNIQUE\s+INDEX\b/i, "UNIQUE INDEX on populated table — fails if duplicates exist"],
  [/\bADD\s+CONSTRAINT\b[\s\S]*?\bUNIQUE\b/i, "UNIQUE CONSTRAINT on populated table — fails if duplicates exist"],
  [/\bRENAME\b/i, "RENAME — breaks the old app version during deploy"],
];

/** ADD COLUMN ... NOT NULL is safe when the statement also sets a DEFAULT. */
const SAFE_REQUIRED_COLUMN = /\bDEFAULT\b/i;

/** Tables created in the same file are empty — UNIQUE indexes on them can't conflict. */
function tablesCreatedIn(sql) {
  const names = new Set();
  for (const m of sql.matchAll(/CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?"([^"]+)"/gi)) {
    names.add(m[1]);
  }
  return names;
}

function uniqueIndexTarget(stmt) {
  const m =
    stmt.match(/CREATE\s+UNIQUE\s+INDEX\s+"[^"]+"\s+ON\s+"([^"]+)"/i) ||
    stmt.match(/ALTER\s+TABLE\s+"([^"]+)"\s+ADD\s+CONSTRAINT/i);
  return m ? m[1] : null;
}

function stripComments(sql) {
  return sql.replace(/--[^\n]*/g, "");
}

/**
 * Split a .sql file into statement chunks: each chunk = the comment/blank
 * lines preceding a statement + the statement itself, with the 1-based line
 * number where the statement's SQL begins. Semicolons end a statement.
 * (Sufficient for Prisma-generated migrations; no dollar-quoted bodies here.)
 */
function statementsOf(sql) {
  const lines = sql.split("\n");
  const chunks = [];
  let buffer = [];
  let startLine = 1;
  for (let i = 0; i < lines.length; i++) {
    if (buffer.length === 0) startLine = i + 1;
    buffer.push(lines[i]);
    if (lines[i].includes(";")) {
      chunks.push({ text: buffer.join("\n"), startLine });
      buffer = [];
    }
  }
  if (buffer.length) chunks.push({ text: buffer.join("\n"), startLine });
  return chunks;
}

const files = [];
if (existsSync(MIGRATIONS_DIR)) {
  for (const dir of readdirSync(MIGRATIONS_DIR).sort()) {
    const f = join(MIGRATIONS_DIR, dir, "migration.sql");
    if (existsSync(f)) files.push(f);
  }
}
const dataFixes = join(DB_DIR, "prisma", "data-fixes.sql");
if (existsSync(dataFixes)) files.push(dataFixes);

const findings = [];
for (const file of files) {
  const sql = readFileSync(file, "utf8");
  const createdHere = tablesCreatedIn(sql);
  for (const { text, startLine } of statementsOf(sql)) {
    const body = stripComments(text);
    if (!body.trim()) continue;
    for (const [re, label] of RISKY) {
      if (!re.test(body)) continue;
      // A required column with a DEFAULT is safe — skip that specific flag.
      if (label.startsWith("required column") && SAFE_REQUIRED_COLUMN.test(body)) continue;
      // UNIQUE indexes/constraints on tables created in this same file are safe.
      if (label.startsWith("UNIQUE")) {
        const target = uniqueIndexTarget(body);
        if (target && createdHere.has(target)) continue;
      }
      if (text.includes(MARKER)) continue; // explicitly acknowledged
      findings.push({ file, startLine, label, statement: body.trim() });
    }
  }
}

if (findings.length === 0) {
  console.log("[migrate:check] no unmarked risky SQL in migrations — OK");
  process.exit(0);
}

console.error("");
console.error("╔══════════════════════════════════════════════════════════════╗");
console.error("║  ✗  RISKY MIGRATION SQL DETECTED                            ║");
console.error("║                                                              ║");
console.error("║  These statements can lose data or fail at deploy time.     ║");
console.error("║  Review each one. If intentional, add a marker on the       ║");
console.error("║  line directly above the statement:                         ║");
console.error("║                                                              ║");
console.error("║    -- nirman:accept-risk <short reason>                     ║");
console.error("║    ALTER TABLE ...                                          ║");
console.error("║                                                              ║");
console.error("║  Safer alternatives:                                        ║");
console.error("║   • required column → ADD COLUMN nullable + UPDATE backfill ║");
console.error("║                      → SET NOT NULL (marked)                ║");
console.error("║   • drop column     → deprecate first, drop in a later      ║");
console.error("║                      migration once code stops reading it   ║");
console.error("╚══════════════════════════════════════════════════════════════╝");
console.error("");
for (const f of findings) {
  const rel = fileRel(f.file);
  console.error(`  ${rel}:${f.startLine}`);
  console.error(`    ${f.label}`);
  console.error(`    ${f.statement.slice(0, 200)}`);
  console.error("");
}
process.exit(1);

function fileRel(f) {
  const i = f.indexOf("prisma/");
  return i >= 0 ? f.slice(i) : f;
}
