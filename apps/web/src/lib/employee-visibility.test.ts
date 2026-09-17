import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  EMPLOYEE_ROSTER_FIELDS,
  EMPLOYEE_COMP_FIELDS,
  EMPLOYEE_DOCS_FIELDS,
  EMPLOYEE_TOKEN_FIELDS,
  pickEmployeeRoster,
  redactEmployeeRow,
  type EmployeeFieldScope,
} from "./employee-visibility";

/**
 * Field-visibility invariants for the Employee model.
 *
 * The roster tier is an allowlist, so a NEW schema column can never *leak* —
 * but it could be silently dropped from every tier, which is a functional gap.
 * The exhaustiveness test closes that: every scalar column on the Employee
 * model must be categorized into exactly one group (ROSTER / COMP / DOCS /
 * TOKEN). Add a column → this test fails until you classify it.
 */

const schemaPath = path.resolve(__dirname, "../../../../packages/db/prisma/schema.prisma");
const schema = readFileSync(schemaPath, "utf8");

const modelNames = new Set([...schema.matchAll(/^model (\w+) \{/gm)].map((m) => m[1]));

// Scalar column names on the Employee model (relations — whose *type* is a
// model name — are excluded; they're include-time choices, not columns).
const employeeBlock = schema.match(/model Employee \{([\s\S]*?)\n\}/)?.[1] ?? "";
const scalarColumns = employeeBlock
  .split("\n")
  .map((l) => l.trim())
  .filter((l) => l && !l.startsWith("//") && !l.startsWith("@@") && !l.startsWith("model"))
  .map((l) => l.split(/\s+/))
  .filter((parts) => parts.length >= 2 && /^[a-z]/.test(parts[0]!))
  .filter((parts) => !modelNames.has(parts[1]!.replace(/[\[\]?]/g, "")))
  .map((parts) => parts[0]!);

const ALL_GROUPS = [
  ...EMPLOYEE_ROSTER_FIELDS,
  ...EMPLOYEE_COMP_FIELDS,
  ...EMPLOYEE_DOCS_FIELDS,
  ...EMPLOYEE_TOKEN_FIELDS,
];

const FULL_SCOPE: EmployeeFieldScope = {
  canSeePayroll: true,
  canSeeBankDetails: true,
  canSeePersonalDocs: true,
};
const ROSTER_SCOPE: EmployeeFieldScope = {
  canSeePayroll: false,
  canSeeBankDetails: false,
  canSeePersonalDocs: false,
};

const sampleRow = {
  id: "e1",
  name: "Devraj Pal",
  wageType: "DAILY",
  dailyRate: 850,
  monthlySalary: null,
  payDay: 5,
  bankAccountNumber: "123456789",
  panNumber: "ABCDE1234F",
  permanentAddress: "Some village",
  dateOfBirth: new Date("1990-01-01"),
  contractToken: "tok_secret",
  offerToken: "tok_secret2",
  bloodGroup: "O+",
  emergencyContactPhone: "9999999999",
  contractStatus: "CONFIRMED",
  crew: { id: "c1", name: "Masons" }, // relation — never a column group member
};

describe("employee-visibility field policy", () => {
  it("every Employee scalar column is categorized into exactly one tier", () => {
    const counts = new Map<string, number>();
    for (const f of ALL_GROUPS) counts.set(f, (counts.get(f) ?? 0) + 1);
    const dupes = [...counts.entries()].filter(([, n]) => n > 1).map(([f]) => f);
    expect(dupes, `fields in multiple groups: ${dupes}`).toEqual([]);

    const categorized = new Set<string>(ALL_GROUPS);
    const uncategorized = scalarColumns.filter((c) => !categorized.has(c));
    expect(
      uncategorized,
      `Employee columns missing from all tier groups — add to ROSTER (safe for hr.view) or a gated group: ${uncategorized.join(", ")}`,
    ).toEqual([]);
  });

  it("no tier group lists a column that doesn't exist on the model", () => {
    const cols = new Set(scalarColumns);
    const bogus = ALL_GROUPS.filter((f) => !cols.has(f));
    expect(bogus, `group fields not on Employee model: ${bogus}`).toEqual([]);
  });

  it("roster excludes every gated column", () => {
    const roster = new Set<string>(EMPLOYEE_ROSTER_FIELDS);
    for (const f of [...EMPLOYEE_COMP_FIELDS, ...EMPLOYEE_DOCS_FIELDS, ...EMPLOYEE_TOKEN_FIELDS]) {
      expect(roster.has(f), `${f} must not be roster-visible`).toBe(false);
    }
  });

  it("pickEmployeeRoster returns only allowlisted fields (deny-by-default)", () => {
    const out = pickEmployeeRoster(sampleRow) as Record<string, unknown>;
    expect(out.name).toBe("Devraj Pal");
    expect(out.bloodGroup).toBe("O+");
    // Gated columns absent — not just null:
    expect(out.dailyRate).toBeUndefined();
    expect(out.bankAccountNumber).toBeUndefined();
    expect(out.panNumber).toBeUndefined();
    expect(out.contractToken).toBeUndefined();
    // Relations aren't columns — callers append them explicitly:
    expect(out.crew).toBeUndefined();
    // Unknown/new columns can't leak:
    const withNewColumn = { ...sampleRow, futureSensitiveColumn: "x" };
    expect((pickEmployeeRoster(withNewColumn) as Record<string, unknown>).futureSensitiveColumn).toBeUndefined();
  });

  it("redactEmployeeRow nulls gated fields for roster scope, preserves shape", () => {
    const out = redactEmployeeRow(sampleRow, ROSTER_SCOPE) as Record<string, unknown>;
    expect(out.name).toBe("Devraj Pal");
    expect(out.dailyRate).toBeNull();
    expect(out.bankAccountNumber).toBeNull();
    expect(out.contractToken).toBeNull();
    expect(out.bloodGroup).toBe("O+");
    expect(out.crew).toEqual({ id: "c1", name: "Masons" });
  });

  it("redactEmployeeRow preserves everything for the full tier", () => {
    const out = redactEmployeeRow(sampleRow, FULL_SCOPE) as Record<string, unknown>;
    expect(out.dailyRate).toBe(850);
    expect(out.bankAccountNumber).toBe("123456789");
    expect(out.contractToken).toBe("tok_secret");
  });
});
