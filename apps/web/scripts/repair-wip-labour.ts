/**
 * Repair: pre-fix payroll labour expensed to P&L instead of capitalised to WIP.
 *
 * Before the labour→WIP fix, processPayroll posted Dr 6100 Salaries Expense for
 * ALL gross pay while also creating ProjectCost(LABOUR) rows that flow into
 * unit productionCost — so the labour was double-counted (P&L expense AND
 * inside the capitalised unit asset) and WIP went negative on capitalisation.
 *
 * For every project: post Dr 1500 WIP / Cr 6100 Salaries Expense for
 * Σ ProjectCost(LABOUR) − Σ WIP debits already posted by PAYROLL entries.
 * Idempotent — re-runs post nothing once repaired.
 *
 *   pnpm --filter web tsx scripts/repair-wip-labour.ts
 */
import { prisma } from "@nirman/db";
import { postJournalEntry, ACCT } from "@nirman/services";
import Decimal from "decimal.js";

async function main() {
  const companies = await prisma.company.findMany({ select: { id: true, name: true } });
  for (const company of companies) {
    // Σ LABOUR project costs per project (doc truth for what should be in WIP)
    const labour = await prisma.projectCost.groupBy({
      by: ["projectId"],
      where: { project: { companyId: company.id }, costType: "LABOUR" },
      _sum: { amount: true },
    });
    if (labour.length === 0) continue;

    // Σ WIP debits already posted by PAYROLL entries per project
    const wipLines = await prisma.$queryRaw<{ projectId: string; total: Decimal }[]>`
      SELECT jl."entityId" AS "projectId", COALESCE(SUM(jl.debit - jl.credit), 0) AS total
      FROM "JournalLine" jl
      JOIN "JournalEntry" je ON je.id = jl."journalEntryId"
      JOIN "GlAccount" a ON a.id = jl."accountId"
      WHERE je."companyId" = ${company.id} AND je.status = 'POSTED'
        AND je."sourceType" = 'PAYROLL' AND a.code = ${ACCT.WIP}
        AND jl."entityType" = 'Project'
      GROUP BY jl."entityId"`;

    const wipByProject = new Map(wipLines.map((r) => [r.projectId, new Decimal(r.total)]));

    for (const row of labour) {
      const expected = new Decimal(row._sum.amount ?? 0);
      const posted = wipByProject.get(row.projectId) ?? new Decimal(0);
      const delta = expected.minus(posted);
      if (delta.lte(0)) continue;

      await prisma.$transaction(async (tx) => {
        await postJournalEntry(tx, {
          companyId: company.id,
          sourceType: "PAYROLL_WIP_REPAIR",
          sourceId: row.projectId,
          memo: `Repair: capitalise ${delta} of pre-fix payroll labour into WIP (was expensed to 6100)`,
          lines: [
            { accountCode: ACCT.WIP, debit: delta, credit: 0, entityType: "Project", entityId: row.projectId, memo: "Labour capitalised to project (repair)" },
            { accountCode: ACCT.SALARIES_EXPENSE, debit: 0, credit: delta, entityType: "Project", entityId: row.projectId, memo: "Reverse expensed project labour (repair)" },
          ],
        });
      });
      console.log(`${company.name}: project ${row.projectId} — repaired ₹${delta} of labour into WIP`);
    }
  }
  console.log("done");
}

main().finally(() => prisma.$disconnect());
