/**
 * Repair: inventory-gl drift on the dev DB.
 *
 * reconcileInventoryGl compares GL 1300 vs the stock ledger's authoritative
 * running value (latest StockMovement.balanceValueAfter + in-transit stock).
 * On this synthetic dev database the two diverged by a few hundred rupees —
 * accumulated before the posting-path fixes landed (supplier returns credited
 * at PO price instead of MAC, opening stock bypassed the ledger entirely,
 * direct-purchase receipts orphaned, sale-reversal drift, in-transit
 * transfers that never receive). Every path is now verified leg-by-leg
 * symmetric by the chain scripts, so the residual is historical litter, not
 * a live bug.
 *
 * This script trues GL 1300 to the stock ledger with one explicit
 * balancing JE:
 *     Dr/Cr 1300 Inventory  ↔  3100 Opening Equity
 * (opening equity is the honest bucket for "pre-migration / unexplained
 * historical balance" — shrinkage would misstate a real write-off).
 *
 * Idempotent: skips when a prior repair JE already brought the delta to ~0,
 * and refuses to run on a delta > ₹1,000 — at that scale the difference is
 * a real bug worth investigating, not litter to plug.
 *
 * Run: cd apps/web && pnpm tsx scripts/repair-inventory-gl.ts
 */
import { prisma } from "@nirman/db";
import Decimal from "decimal.js";
import { postJournalEntry, ACCT } from "@nirman/services";

const HARD_LIMIT = new Decimal(1000);

async function main() {
  const companies = await prisma.company.findMany({ select: { id: true, name: true } });
  for (const c of companies) {
    // Stock-ledger authoritative value (same computation as the check):
    // latest balanceValueAfter per material+location, over live locations
    // and non-deleted materials.
    const valued = await prisma.$queryRaw<{ value: Decimal }[]>`
      SELECT COALESCE(SUM(v."balanceValueAfter"), 0) AS value FROM (
        SELECT DISTINCT ON (m."materialId", m."locationId") m."balanceValueAfter"
        FROM (
          SELECT "materialId", "toLocationId" AS "locationId", "balanceValueAfter", timestamp, id
          FROM "StockMovement" WHERE "toLocationId" IS NOT NULL
          UNION ALL
          SELECT "materialId", "fromLocationId" AS "locationId", "balanceValueAfter", timestamp, id
          FROM "StockMovement" WHERE "fromLocationId" IS NOT NULL
        ) m
        INNER JOIN "StockLocation" loc ON loc.id = m."locationId" AND loc."companyId" = ${c.id} AND loc."deletedAt" IS NULL
        INNER JOIN "Material" mat ON mat.id = m."materialId" AND mat."deletedAt" IS NULL
        ORDER BY m."materialId", m."locationId", m.timestamp DESC, m.id DESC
      ) v`;
    const stockValue = new Decimal(valued[0]?.value ?? 0);

    // In-transit stock stays in 1300 until received.
    const inTransit = await prisma.stockTransferLine.findMany({
      where: { stockTransfer: { status: "IN_TRANSIT", fromLocation: { companyId: c.id, deletedAt: null } } },
      select: { qty: true, unitCostAtSource: true },
    });
    const expected = inTransit.reduce(
      (s, l) => s.plus(new Decimal(l.qty).times(l.unitCostAtSource ?? 0)),
      stockValue,
    );

    const gl = await prisma.journalLine.aggregate({
      where: {
        account: { companyId: c.id, code: ACCT.INVENTORY },
        journalEntry: { companyId: c.id, status: "POSTED" },
      },
      _sum: { debit: true, credit: true },
    });
    const actual = new Decimal(gl._sum.debit ?? 0).minus(new Decimal(gl._sum.credit ?? 0));
    const delta = expected.minus(actual); // >0 → GL short, debit 1300

    console.log(`${c.name}: ledger+in-transit ${expected.toFixed(2)} vs GL ${actual.toFixed(2)} → Δ${delta.toFixed(2)}`);
    if (delta.abs().lt(0.01)) { console.log("  already balanced — skip"); continue; }
    if (delta.abs().gt(HARD_LIMIT)) {
      console.log(`  Δ exceeds ₹${HARD_LIMIT} — refusing to plug a real discrepancy. Investigate first.`);
      continue;
    }

    const debitInv = delta.gt(0);
    await prisma.$transaction(async (tx) => {
      await postJournalEntry(tx, {
        companyId: c.id,
        sourceType: "REPAIR_INVENTORY_GL",
        sourceId: c.id,
        memo: "True-up GL 1300 to stock ledger — historical dev-DB drift (pre-fix postings); see repair-inventory-gl.ts",
        lines: [
          debitInv
            ? { accountCode: ACCT.INVENTORY, debit: delta, credit: 0, memo: "GL below ledger — restore value" }
            : { accountCode: ACCT.INVENTORY, debit: 0, credit: delta.abs(), memo: "GL above ledger — write off excess" },
          debitInv
            ? { accountCode: ACCT.OPENING_EQUITY, debit: 0, credit: delta, memo: "Balancing leg — unexplained historical drift" }
            : { accountCode: ACCT.OPENING_EQUITY, debit: delta.abs(), credit: 0, memo: "Balancing leg — unexplained historical drift" },
        ],
      });
    });
    console.log(`  posted repair JE: ${debitInv ? "Dr" : "Cr"} 1300 ${delta.abs().toFixed(2)} ↔ Opening Equity`);
  }
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
