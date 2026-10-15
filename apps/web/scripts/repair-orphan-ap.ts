/**
 * Repair: supplier-less direct purchases posted Cr AP (2000) before the
 * spot-buy fix — an unpayable payable. Reclass each to Dr 2000 / Cr 1000
 * (cash settlement), matching the new createDirectPurchase semantics.
 * Idempotent via a marker JE per purchase.
 *
 *   pnpm --filter web tsx scripts/repair-orphan-ap.ts
 */
import { prisma } from "@nirman/db";
import { postJournalEntry, ACCT } from "@nirman/services";
import Decimal from "decimal.js";

async function main() {
  const orphans = await prisma.directPurchase.findMany({
    where: { supplierId: null, status: { not: "CANCELLED" } },
    select: { id: true, billNumber: true, billAmount: true, companyId: true },
  });

  for (const dp of orphans) {
    const repaired = await prisma.journalEntry.findFirst({
      where: { sourceType: "DIRECT_PURCHASE_AP_REPAIR", sourceId: dp.id },
      select: { id: true },
    });
    if (repaired) continue;

    const amount = new Decimal(dp.billAmount);
    if (amount.lte(0)) continue;

    await prisma.$transaction(async (tx) => {
      await postJournalEntry(tx, {
        companyId: dp.companyId,
        sourceType: "DIRECT_PURCHASE_AP_REPAIR",
        sourceId: dp.id,
        memo: `Reclass orphan AP → cash for supplier-less purchase ${dp.billNumber}`,
        lines: [
          { accountCode: ACCT.AP, debit: amount, credit: 0, entityType: "DirectPurchase", entityId: dp.id, memo: "Remove unpayable AP" },
          { accountCode: ACCT.CASH, debit: 0, credit: amount, entityType: "DirectPurchase", entityId: dp.id, memo: "Spot cash settlement" },
        ],
      });
    });
    console.log(`repaired ${dp.billNumber}: ₹${amount} AP → cash`);
  }
  console.log("done");
}

main().finally(() => prisma.$disconnect());
