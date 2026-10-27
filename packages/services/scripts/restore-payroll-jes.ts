/**
 * One-off repair — restore two payroll gross-expense JEs (periods 11/2025 and
 * 1/2026) whose JournalEntry rows were lost while the PAID periods, their
 * PAYROLL_PAYMENT JEs, and the auto-allocated ProjectCost docs survived.
 *
 * Evidence per period (PayrollPeriod + surviving payment JE + ProjectCost):
 *   totalGross 26,000 · totalNet 19,000 · totalDeductions 7,000
 *   projectLabour: apex center 19,500 (matches "Auto-allocated from payroll" docs)
 *   Deduction components (PayrollLine rows) no longer exist — sibling seed
 *   payrolls (10/2025, 12/2025) credit all deductions to Salaries Payable, so
 *   these are reconstructed the same way: otherDeductions = 7,000.
 *
 * Also deletes the two orphaned ProjectCost docs whose backing RA bills
 * (Attribution probe WO chain) were deleted.
 *
 * Usage: pnpm --filter @nirman/services exec tsx scripts/restore-payroll-jes.ts
 */

import { prisma } from "@nirman/db";
import Decimal from "decimal.js";
import { postPayroll } from "../src/gl-posting";

const COMPANY_ID = "cmtv3x4t50000vlp0b23vdtxe";
const APEX_PROJECT_ID = "cmtwhwzer000pvlt3cth8e8qo";

const MISSING_PERIODS = [
  { id: "cmvnknp9405vnvlx16xg11ek8", label: "11/2025" },
  { id: "cmvnlczrf03e5vlcdxmdaolup", label: "1/2026" },
];

const ORPHAN_COST_DOCS = [
  "cmvo5ior900g2vl6i3ha2evl1",
  "cmvo5hrts00fpvl6iu061oow7",
];

async function main() {
  await prisma.$transaction(async (tx) => {
    for (const p of MISSING_PERIODS) {
      const exists = await tx.journalEntry.findFirst({
        where: { sourceType: "PAYROLL", sourceId: p.id, status: "POSTED" },
        select: { entryNumber: true },
      });
      if (exists) {
        console.log(`payroll ${p.label}: JE already exists (${exists.entryNumber}) — skipping`);
        continue;
      }
      const je = await postPayroll(tx, {
        companyId: COMPANY_ID,
        payrollPeriodId: p.id,
        totalGross: 26000,
        totalNet: 19000,
        totalDeductions: 7000,
        projectLabour: new Map([[APEX_PROJECT_ID, new Decimal(19500)]]),
      });
      console.log(`payroll ${p.label}: posted ${je?.entryNumber ?? "null"}`);
    }

    const del = await tx.projectCost.deleteMany({ where: { id: { in: ORPHAN_COST_DOCS } } });
    console.log(`deleted ${del.count} orphaned RA-bill ProjectCost docs`);
  });
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
