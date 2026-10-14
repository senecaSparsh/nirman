/**
 * One-off dev repair: for (location, material) pairs where the on-hand cache
 * exceeds what the movement log replays to — stock that entered the books
 * bypassing recordMovement (old seeds, manual SQL) — append a backfilled
 * OPENING_BALANCE movement row for the missing qty WITHOUT touching the
 * cache (it already holds those units), plus the paired GL entry
 * (Dr Inventory / Cr Opening Balance Equity) that should have been posted
 * when the stock was loaded.
 *
 * Negative deltas (replay > cache) can't be healed by a movement — every
 * new movement shifts both sides equally — they're reported for manual
 * review instead.
 */
import { prisma } from "@nirman/db";
import { postOpeningStock } from "@nirman/services";
import Decimal from "decimal.js";

const COMPANY_ID = process.argv[2] ?? "cmtv3x4t50000vlp0b23vdtxe";
const IN_TYPES = ["PURCHASE_RECEIPT", "TRANSFER_IN", "ADJUSTMENT_IN", "SCRAP_GENERATED", "OPENING_BALANCE"];
const OUT_TYPES = ["TRANSFER_OUT", "ISSUE_TO_PROJECT", "ISSUE_TO_DEPARTMENT", "ADJUSTMENT_OUT", "RETURN", "SALE"];

async function main() {
  const items = await prisma.stockLocationItem.findMany({
    where: { location: { companyId: COMPANY_ID, deletedAt: null }, material: { deletedAt: null } },
    select: { locationId: true, materialId: true, qty: true, movingAvgCost: true, location: { select: { name: true } }, material: { select: { code: true } } },
  });
  const inGrouped = await prisma.stockMovement.groupBy({
    by: ["toLocationId", "materialId"],
    where: { toLocationId: { not: null }, movementType: { in: IN_TYPES } },
    _sum: { qty: true },
  });
  const outGrouped = await prisma.stockMovement.groupBy({
    by: ["fromLocationId", "materialId"],
    where: { fromLocationId: { not: null }, movementType: { in: OUT_TYPES } },
    _sum: { qty: true },
  });
  const inMap = new Map(inGrouped.map((g) => [`${g.toLocationId}:${g.materialId}`, Number(g._sum.qty ?? 0)]));
  const outMap = new Map(outGrouped.map((g) => [`${g.fromLocationId}:${g.materialId}`, Number(g._sum.qty ?? 0)]));

  for (const item of items) {
    const replayed = (inMap.get(`${item.locationId}:${item.materialId}`) ?? 0) - (outMap.get(`${item.locationId}:${item.materialId}`) ?? 0);
    const delta = new Decimal(item.qty).minus(replayed);
    if (delta.abs().lt(0.001)) continue;
    if (delta.lte(0)) {
      console.log(`MANUAL-REVIEW ${item.material.code} @ ${item.location.name}: cache ${item.qty} < replay ${replayed} (delta ${delta}) — replay is the ledger; investigate for a deleted movement or a manual cache write.`);
      continue;
    }
    await prisma.$transaction(async (tx) => {
      // Backfill the ledger row only — the cache already holds these units.
      // balanceAfter/balanceValueAfter describe the true current state, not a
      // post-increment state, so replay-vs-cache heals without double-counting.
      const mac = new Decimal(item.movingAvgCost);
      await tx.stockMovement.create({
        data: {
          materialId: item.materialId,
          movementType: "OPENING_BALANCE",
          toLocationId: item.locationId,
          qty: delta,
          unitCost: mac,
          balanceAfter: new Decimal(item.qty),
          balanceValueAfter: new Decimal(item.qty).times(mac).toDecimalPlaces(2),
          reason: "Opening balance repair — stock predates the movement ledger",
          refType: "OPENING_BALANCE",
          refId: item.materialId,
        },
      });
      await postOpeningStock(tx, {
        companyId: COMPANY_ID,
        materialId: item.materialId,
        qty: delta,
        unitCost: mac,
      });
    });
    console.log(`REPAIRED ${item.material.code} @ ${item.location.name}: backfilled ${delta} @ MAC ${item.movingAvgCost} + GL`);
  }
}
main().finally(() => prisma.$disconnect());
