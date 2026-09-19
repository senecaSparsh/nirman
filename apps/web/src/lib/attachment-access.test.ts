/**
 * Attachment subject-access registry test — every entityType passed to an
 * attachment component anywhere in the app must be registered in
 * ATTACHMENT_ENTITY_ACCESS. Unregistered types are rejected at runtime
 * (fail-closed), so a NEW attachment surface that skips registration just
 * stops working — this test surfaces it at build time instead.
 */
import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { ATTACHMENT_ENTITY_ACCESS } from "./attachment-access";
import { ALL_PERMISSIONS } from "./roles";

const SRC = join(__dirname, "..");
const server = readFileSync(join(__dirname, "server.ts"), "utf8");

function* walk(dir: string): Generator<string> {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;
    const p = join(dir, entry.name);
    if (entry.isDirectory()) yield* walk(p);
    else if (/\.(tsx|ts)$/.test(entry.name)) yield p;
  }
}

/** Models registered in scopeWhere() — SCOPE_FIELDS ∪ KNOWN_UNSCOPABLE. */
function registeredModels(): Set<string> {
  const fStart = server.indexOf("const SCOPE_FIELDS");
  const fEnd = server.indexOf("const KNOWN_UNSCOPABLE", fStart);
  const uStart = fEnd;
  const uEnd = server.indexOf("]);", uStart);
  expect(fStart).toBeGreaterThan(-1);
  expect(fEnd).toBeGreaterThan(fStart);
  expect(uEnd).toBeGreaterThan(uStart);
  const scoped = [...server.slice(fStart, fEnd).matchAll(/^\s{4}(\w+):/gm)].map((m) => m[1]!);
  const unscopable = [...server.slice(uStart, uEnd).matchAll(/"(\w+)"/g)].map((m) => m[1]!);
  return new Set([...scoped, ...unscopable]);
}

describe("attachment entity-access registry", () => {
  it("every entityType literal used by a component is registered", () => {
    const used = new Set<string>();
    for (const file of walk(SRC)) {
      const src = readFileSync(file, "utf8");
      for (const m of src.matchAll(/entityType=\{?"([A-Za-z]+)"/g)) {
        if (m[1]) used.add(m[1]);
      }
    }
    const unregistered = [...used].filter((t) => !(t in ATTACHMENT_ENTITY_ACCESS));
    expect(unregistered).toEqual([]);
  });

  it("every registry entry maps to a real permission + scope-registered model", () => {
    const permSet = new Set(ALL_PERMISSIONS);
    const models = registeredModels();
    for (const [entityType, rule] of Object.entries(ATTACHMENT_ENTITY_ACCESS)) {
      expect(permSet.has(rule.perm), `${entityType} → unknown perm ${rule.perm}`).toBe(true);
      // companyPath models (StockCount) carry no companyId — they bind via
      // the named relation instead of the scope registry.
      if (!rule.companyPath) {
        expect(models.has(rule.model), `${entityType} → model ${rule.model} not in scope registry`).toBe(true);
      }
    }
  });
});
