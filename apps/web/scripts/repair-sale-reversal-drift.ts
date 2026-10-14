/**
 * One-off dev repair: pre-fd400362 sale returns reversed the ENTIRE sale
 * journal instead of the returned portion. Those reversal entries still sit
 * on ACTIVE sales — GL shows no revenue/COGS for sales that are live.
 * Fix: re-reverse each erroneous reversal (audit-trailed undo), restoring
 * the sale's original GL posture. Only touches sales that are still ACTIVE
 * — reversals on genuinely cancelled sales are legitimate.
 */
import { prisma } from "@nirman/db";
import { reverseJournalEntry } from "@nirman/services";

async function main() {
  const badReversals = await prisma.journalEntry.findMany({
    where: {
      sourceType: { in: ["MATERIAL_SALE_REVERSAL", "MATERIAL_SALE_COGS_REVERSAL"] },
      memo: { startsWith: "Reversal for sales return" },
      materialSale: undefined,
    },
    select: { id: true, sourceType: true, sourceId: true, memo: true },
  });
  // materialSale relation may not exist on JournalEntry — filter by joining manually
  const saleIds = [...new Set(badReversals.map((r) => r.sourceId).filter((s): s is string => !!s))];
  const activeSales = await prisma.materialSale.findMany({
    where: { id: { in: saleIds }, status: "ACTIVE" },
    select: { id: true, saleNumber: true },
  });
  const activeIds = new Set(activeSales.map((s) => s.id));
  const toUndo = badReversals.filter((r) => r.sourceId && activeIds.has(r.sourceId));
  console.log(`found ${badReversals.length} reversal entries; ${toUndo.length} on ACTIVE sales`);
  for (const r of toUndo) {
    await prisma.$transaction(async (tx) => {
      await reverseJournalEntry(tx, r.id, { memo: `Undo erroneous reversal — sale is ACTIVE (${r.memo})` });
    });
    console.log(`  un-reversed ${r.sourceType} on ${r.sourceId}`);
  }
}
main().finally(() => prisma.$disconnect());
