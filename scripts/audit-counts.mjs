/**
 * Nirman Inventory — Audit Counts (Drift Prevention)
 *
 * Counts tests, accounts, routes, pages, components, and permissions
 * across the codebase. Outputs docs/audit-counts.json.
 *
 * Advisory only — does not fail CI. Run in CI as a non-blocking warning.
 * On PRs, the CI workflow posts a comment if counts have drifted from
 * the committed docs/audit-counts.json.
 *
 * Usage: node scripts/audit-counts.mjs
 *
 * Counts:
 *   - tests:       `  it(` occurrences in *.test.ts files (leading whitespace
 *                  to avoid false positives like `computeSaleProfit(`)
 *   - accounts:    entries in CHART_OF_ACCOUNTS array in gl-posting.ts
 *   - routes:      route.ts files under apps/web/src/app/api/
 *   - pages:       page.tsx files under apps/web/src/app/
 *   - components:  *.tsx files under apps/web/src/components/
 *   - permissions: PERM.* keys in roles.ts
 */
import { readFileSync, writeFileSync, readdirSync, statSync, existsSync } from "node:fs";
import path from "node:path";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const OUTPUT_PATH = path.join(ROOT, "docs", "audit-counts.json");

// ── Helpers ─────────────────────────────────────────────────────

function walkDir(dir, predicate, results = []) {
  if (!existsSync(dir)) return results;
  for (const entry of readdirSync(dir)) {
    const fullPath = path.join(dir, entry);
    const stat = statSync(fullPath);
    if (stat.isDirectory()) {
      // Skip node_modules, .next, .git, generated
      if (entry === "node_modules" || entry === ".next" || entry === ".git" || entry === "generated") continue;
      walkDir(fullPath, predicate, results);
    } else if (predicate(fullPath)) {
      results.push(fullPath);
    }
  }
  return results;
}

function countOccurrences(content, pattern) {
  const matches = content.match(pattern);
  return matches ? matches.length : 0;
}

// ── Count: Tests ────────────────────────────────────────────────

function countTests() {
  const testFiles = walkDir(path.join(ROOT, "packages", "services", "src"), (f) => f.endsWith(".test.ts"));
  let total = 0;
  for (const file of testFiles) {
    const content = readFileSync(file, "utf-8");
    // Count `  it(` with leading whitespace to avoid false positives
    total += countOccurrences(content, /  it\(/g);
  }
  return total;
}

// ── Count: GL Accounts ──────────────────────────────────────────

function countAccounts() {
  const glFile = path.join(ROOT, "packages", "services", "src", "gl-posting.ts");
  if (!existsSync(glFile)) return 0;
  const content = readFileSync(glFile, "utf-8");
  // Count entries in CHART_OF_ACCOUNTS array — each entry has a code field
  const matches = content.match(/\{ code: "\d{4}"/g);
  return matches ? matches.length : 0;
}

// ── Count: API Routes ───────────────────────────────────────────

function countRoutes() {
  const apiDir = path.join(ROOT, "apps", "web", "src", "app", "api");
  return walkDir(apiDir, (f) => f.endsWith("route.ts")).length;
}

// ── Count: Pages ────────────────────────────────────────────────

function countPages() {
  const appDir = path.join(ROOT, "apps", "web", "src", "app");
  return walkDir(appDir, (f) => f.endsWith("page.tsx")).length;
}

// ── Count: Components ───────────────────────────────────────────

function countComponents() {
  const compDir = path.join(ROOT, "apps", "web", "src", "components");
  return walkDir(compDir, (f) => f.endsWith(".tsx")).length;
}

// ── Count: Permissions ──────────────────────────────────────────

function countPermissions() {
  const rolesFile = path.join(ROOT, "apps", "web", "src", "lib", "roles.ts");
  if (!existsSync(rolesFile)) return 0;
  const content = readFileSync(rolesFile, "utf-8");
  // Count PERM.* keys in the PERM object
  const matches = content.match(/^\s*[A-Z_]+:\s*"/gm);
  return matches ? matches.length : 0;
}

// ── Main ────────────────────────────────────────────────────────

const counts = {
  timestamp: new Date().toISOString(),
  tests: countTests(),
  accounts: countAccounts(),
  routes: countRoutes(),
  pages: countPages(),
  components: countComponents(),
  permissions: countPermissions(),
};

// Write to docs/audit-counts.json
writeFileSync(OUTPUT_PATH, JSON.stringify(counts, null, 2) + "\n");

// Print summary
console.log("─ Audit Counts ───────────────────────");
console.log(`  Tests:       ${counts.tests}`);
console.log(`  Accounts:    ${counts.accounts}`);
console.log(`  Routes:      ${counts.routes}`);
console.log(`  Pages:       ${counts.pages}`);
console.log(`  Components:  ${counts.components}`);
console.log(`  Permissions: ${counts.permissions}`);
console.log(`  Written to:  ${path.relative(ROOT, OUTPUT_PATH)}`);
console.log("──────────────────────────────────────");
