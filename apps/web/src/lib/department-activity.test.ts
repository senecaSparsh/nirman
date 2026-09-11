import { describe, it, expect } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import { DEPARTMENTS, humanizeAction, type DepartmentKey } from "./department-activity";

// ── Helpers ──────────────────────────────────────────────────────────────

/** Recursively scan .ts files under a directory for `action: "..."` patterns. */
function collectActions(dir: string): string[] {
  const results: string[] = [];
  if (!fs.existsSync(dir)) return results;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory() && entry.name !== "node_modules" && entry.name !== ".next") {
      results.push(...collectActions(full));
    } else if (entry.isFile() && (entry.name.endsWith(".ts") || entry.name.endsWith(".tsx"))) {
      const content = fs.readFileSync(full, "utf8");
      // Match action: "SOME_ACTION" or action: 'SOME_ACTION'
      const matches = content.matchAll(/action:\s*["']([A-Z][A-Z_]+)["']/g);
      for (const m of matches) {
        const action = m[1];
        if (action) results.push(action);
      }
    }
  }
  return results;
}

/** Determine which department(s) an action maps to. */
function departmentsForAction(action: string): DepartmentKey[] {
  const matched: DepartmentKey[] = [];
  for (const [dept, def] of Object.entries(DEPARTMENTS) as [DepartmentKey, typeof DEPARTMENTS[DepartmentKey]][]) {
    for (const prefix of def.prefixes) {
      if (action.startsWith(prefix)) {
        matched.push(dept);
        break;
      }
    }
  }
  return matched;
}

// ── Tests ────────────────────────────────────────────────────────────────

describe("department-activity: department mapping", () => {
  // Scan all service + API route files for action strings.
  // process.cwd() is apps/web when running via pnpm --filter web exec vitest.
  const webRoot = process.cwd();
  const repoRoot = path.resolve(webRoot, "../..");
  const serviceDir = path.join(repoRoot, "packages/services/src");
  const apiDir = path.join(webRoot, "src/app/api");
  const allActions = [...new Set([...collectActions(serviceDir), ...collectActions(apiDir)])].sort();

  it("collected a non-trivial set of action strings", () => {
    expect(allActions.length).toBeGreaterThan(100);
  });

  it("no action maps to more than one department (zero overlaps)", () => {
    const overlaps: { action: string; depts: string[] }[] = [];
    for (const action of allActions) {
      const depts = departmentsForAction(action);
      if (depts.length > 1) {
        overlaps.push({ action, depts });
      }
    }
    expect(overlaps).toEqual([]);
  });

  it("no prefix appears in more than one department", () => {
    const seen: Record<string, string> = {};
    const dups: { prefix: string; depts: string[] }[] = [];
    for (const [dept, def] of Object.entries(DEPARTMENTS)) {
      for (const prefix of def.prefixes) {
        if (seen[prefix]) {
          dups.push({ prefix, depts: [seen[prefix], dept] });
        } else {
          seen[prefix] = dept;
        }
      }
    }
    expect(dups).toEqual([]);
  });
});

describe("department-activity: humanizeAction", () => {
  it("handles common verb patterns", () => {
    expect(humanizeAction("PURCHASE_ORDER_CREATE")).toBe("created purchase order");
    expect(humanizeAction("MATERIAL_ISSUE_EXECUTE")).toBe("executed material issue");
    expect(humanizeAction("SAFETY_HAZARD_MITIGATE")).toBe("mitigated safety hazard");
    expect(humanizeAction("NCR_REVIEW")).toBe("reviewed ncr");
    expect(humanizeAction("CAPA_CLOSE")).toBe("closed capa");
  });

  it("falls through to lowercase for unknown verbs", () => {
    expect(humanizeAction("WORKFLOW_CREATE")).toBe("created workflow");
    expect(humanizeAction("PLAYED")).toBe("played");
    expect(humanizeAction("CREATE")).toBe("created");
  });

  it("never returns an empty string", () => {
    expect(humanizeAction("CREATE").length).toBeGreaterThan(0);
    expect(humanizeAction("SOME_UNKNOWN_ACTION").length).toBeGreaterThan(0);
  });
});
