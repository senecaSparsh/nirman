import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

/**
 * Permission-source guard. A custom role's acting role is a built-in stand-in
 * picked by tier, so an approval or money route must check the user's own
 * permission list, never `hasPermission(<acting role>, …)`. That would hand a
 * custom role the stand-in's whole matrix even though it was never granted the
 * permission.
 */
const apiRoot = path.resolve(__dirname, "../app/api");
const appRoot = path.resolve(__dirname, "../app");
const forbidden = [
  /hasPermission\((actingRole|poRole|reqRole|gpRole|submitRole)\b/,
  /hasPermission\(await getActingRole\(\)/,
  /hasPermission\(role, PERM\.(TASKS_ASSIGN|COMPANY_MANAGE)\)/,
];
const ownerOnlyFromStandIn = /(canWaiveSelfApproval|canAutoApprove|canSelfApprovePurchaseOrder)\(\s*(await\s+)?(getActingRole\(\)|actingRole\b)/;
const reviewedStandInChecks = [
  "api/dprs/[id]/route.ts",
  "api/dprs/route.ts",
  "api/expense-claims/[id]/route.ts",
  "api/expense-claims/route.ts",
  "api/expenses/[id]/route.ts",
  "api/gate-passes/[id]/route.ts",
  "api/leaves/route.ts",
  "api/purchase-orders/[id]/route.ts",
  "api/purchase-orders/route.ts",
  "api/ra-bills/[id]/route.ts",
  "api/requisitions/[id]/route.ts",
  "api/requisitions/route.ts",
  "change-orders/[id]/page.tsx",
  "finance/page.tsx",
  "gate-passes/content.tsx",
  "hr/attendance/page.tsx",
  "hr/dprs/page.tsx",
  "m/change-orders/[id]/page.tsx",
  "m/dprs/[id]/page.tsx",
  "m/dprs/page.tsx",
  "m/expense-claims/[id]/page.tsx",
  "m/expenses/[id]/page.tsx",
  "m/gate-pass/page.tsx",
  "m/measurement-book/[id]/page.tsx",
  "m/procurement/[id]/page.tsx",
  "m/procurement/page.tsx",
  "m/pulse/attention/page.tsx",
  "m/pulse/page.tsx",
  "m/requisitions/[id]/page.tsx",
  "m/work-orders/[id]/page.tsx",
  "procurement/[id]/page.tsx",
  "procurement/page.tsx",
];

function filesUnder(dir: string, accept: (name: string) => boolean): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) return filesUnder(full, accept);
    return accept(name) ? [full] : [];
  });
}

describe("permission source", () => {
  it("no API route grants a permission from the acting role's built-in matrix", () => {
    const offenders = filesUnder(apiRoot, (name) => name === "route.ts")
      .filter((file) => forbidden.some((re) => re.test(readFileSync(file, "utf8"))))
      .map((file) => path.relative(apiRoot, file));
    expect(offenders).toEqual([]);
  });

  it("owner-only predicates read the acting stand-in only in the reviewed sites", () => {
    const offenders = filesUnder(appRoot, (name) => /\.(ts|tsx)$/.test(name))
      .filter((file) => ownerOnlyFromStandIn.test(readFileSync(file, "utf8")))
      .map((file) => path.relative(appRoot, file));
    expect([...offenders].sort()).toEqual([...reviewedStandInChecks].sort());
  });
});
