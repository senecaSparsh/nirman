import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Scope-registry coverage test — the "no future leaks" guard.
 *
 * scopeWhere() fails closed for scoped users on unregistered models, but a
 * runtime throw is discovered by a user, not by CI. This test moves the
 * discovery to build time: every tenant-scoped model (carries `companyId`)
 * MUST be registered in SCOPE_FIELDS (scoped by project/department) or
 * KNOWN_UNSCOPABLE (deliberately company-wide). Adding a tenant table
 * without deciding its scope story fails this test.
 *
 * Second guard: every model bearing an `employee Employee` relation must be
 * registered in EMPLOYEE_SUBJECT_RELATIONS — otherwise H1-subject rows
 * (owner's leave/attendance/payroll) leak to below-top viewers.
 */

const ROOT = join(__dirname, "../../../..");
const schema = readFileSync(join(ROOT, "packages/db/prisma/schema.prisma"), "utf8");
const server = readFileSync(join(__dirname, "server.ts"), "utf8");

/** All model names carrying a tenant `companyId` field. */
function tenantModels(): string[] {
  const models: string[] = [];
  let cur: string | null = null;
  for (const line of schema.split("\n")) {
    const m = line.match(/^model (\w+)/);
    if (m) cur = m[1]!;
    if (cur && /^\s+companyId\s+String\b/.test(line)) models.push(cur);
    if (cur && /^}/.test(line)) cur = null;
  }
  return models;
}

/** Keys of the SCOPE_FIELDS map inside scopeWhere(). */
function scopeableModels(): Set<string> {
  const start = server.indexOf("const SCOPE_FIELDS");
  const end = server.indexOf("const KNOWN_UNSCOPABLE", start);
  expect(start).toBeGreaterThan(-1);
  expect(end).toBeGreaterThan(start);
  const block = server.slice(start, end);
  return new Set(
    [...block.matchAll(/^\s{4}(\w+):/gm)].map((m) => m[1]!),
  );
}

/** Entries of the KNOWN_UNSCOPABLE set inside scopeWhere(). */
function unscopableModels(): Set<string> {
  const start = server.indexOf("const KNOWN_UNSCOPABLE");
  const end = server.indexOf("]);", start);
  expect(start).toBeGreaterThan(-1);
  expect(end).toBeGreaterThan(start);
  const block = server.slice(start, end);
  return new Set([...block.matchAll(/"(\w+)"/g)].map((m) => m[1]!));
}

/** Keys of the EMPLOYEE_SUBJECT_RELATIONS map (H1 wall on subject rows). */
function employeeSubjectModels(): Set<string> {
  const start = server.indexOf("const EMPLOYEE_SUBJECT_RELATIONS");
  const end = server.indexOf("};", start);
  expect(start).toBeGreaterThan(-1);
  expect(end).toBeGreaterThan(start);
  const block = server.slice(start, end);
  return new Set([...block.matchAll(/^\s{2}(\w+):/gm)].map((m) => m[1]!));
}

/** Models that own an `employee Employee` relation (employeeId FK). */
function employeeBearingModels(): string[] {
  const models: string[] = [];
  let cur: string | null = null;
  for (const line of schema.split("\n")) {
    const m = line.match(/^model (\w+)/);
    if (m) cur = m[1]!;
    if (cur && /^\s+employee\s+Employee\b/.test(line)) models.push(cur);
    if (cur && /^}/.test(line)) cur = null;
  }
  return models;
}

/** All Prisma model names in the schema. */
function allModels(): Set<string> {
  return new Set([...schema.matchAll(/^model (\w+)/gm)].map((m) => m[1]!));
}

describe("scope registry coverage", () => {
  it("every tenant-scoped model is registered in SCOPE_FIELDS or KNOWN_UNSCOPABLE", () => {
    const registered = new Set([...scopeableModels(), ...unscopableModels()]);
    const missing = tenantModels().filter((m) => !registered.has(m));
    expect(
      missing,
      `Unregistered tenant models — add to SCOPE_FIELDS (with project/dept FK) or KNOWN_UNSCOPABLE in scopeWhere():\n${missing.join(", ")}`,
    ).toEqual([]);
  });

  it("every employee-bearing model is covered by the H1 subject wall", () => {
    const covered = employeeSubjectModels();
    // Exempt: Employee is walled directly via employeeVisibilityWhere();
    // models whose employee link is never surfaced as subject data.
    const exempt = new Set(["Employee"]);
    const missing = employeeBearingModels().filter((m) => !covered.has(m) && !exempt.has(m));
    expect(
      missing,
      `Employee-bearing models missing from EMPLOYEE_SUBJECT_RELATIONS — H1-subject rows would leak:\n${missing.join(", ")}`,
    ).toEqual([]);
  });

  it("SCOPE_FIELDS entries reference real models", () => {
    // Entries may legitimately be non-tenant models — child rows scoped via a
    // parent relation (BoqItem → project), aliases (Quotation → QuotationRequest),
    // or user-scoped (Task). They just can't be typos of nonexistent models.
    const known = new Set(["Task", "Quotation", "PayrollLineComponent"]);
    const bogus = [...scopeableModels()].filter((m) => !allModels().has(m) && !known.has(m));
    expect(bogus, `SCOPE_FIELDS references unknown models: ${bogus.join(", ")}`).toEqual([]);
  });
});
