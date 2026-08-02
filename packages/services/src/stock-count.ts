import { prisma } from "@nirman/db";
import Decimal from "decimal.js";
import { recordMovement, withStockTransaction, refreshMaterialCurrentCost } from "./stock-ledger";
import { logAction } from "./audit";

/**
 * Stock Count Service — physical inventory reconciliation.
 *
 * Flow: createStockCount (DRAFT) → confirmCount (COUNTED) → reconcileStockCount (RECONCILED)
 * Reconciliation applies ADJUSTMENT_IN / ADJUSTMENT_OUT movements for each variance.
 */

interface CreateStockCountInput {
  locationId: string;
  notes?: string;
  userId?: string;
  lines: {
    materialId: string;
    countedQty: Decimal | number | string;
  }[];
}

export async function createStockCount(input: CreateStockCountInput) {
  const location = await prisma.stockLocation.findFirst({
    where: { id: input.locationId, deletedAt: null },
  });
  if (!location) throw new Error("Location not found or deleted");

  // Snapshot current system quantities
  const items = await prisma.stockLocationItem.findMany({
    where: { locationId: input.locationId },
  });
  const systemQtyMap = new Map(items.map((i) => [i.materialId, new Decimal(i.qty)]));

  return prisma.$transaction(async (tx) => {
    const count = await tx.stockCount.create({
      data: {
        locationId: input.locationId,
        notes: input.notes,
        status: "DRAFT",
        lines: {
          create: input.lines.map((l) => {
            const counted = new Decimal(l.countedQty);
            const system = systemQtyMap.get(l.materialId) ?? new Decimal(0);
            return {
              materialId: l.materialId,
              countedQty: counted,
              systemQty: system,
              variance: counted.minus(system),
            };
          }),
        },
      },
      include: { lines: true },
    });
    await logAction(tx, {
      userId: input.userId,
      action: "STOCK_COUNT_CREATE",
      entityType: "StockCount",
      entityId: count.id,
      after: { locationId: input.locationId, lineCount: input.lines.length, status: "DRAFT" },
    });
    return count;
  });
}

export async function confirmStockCount(countId: string, userId?: string) {
  return prisma.$transaction(async (tx) => {
    const count = await tx.stockCount.findUnique({ where: { id: countId } });
    if (!count) throw new Error("Stock count not found");
    if (count.status !== "DRAFT") throw new Error(`Cannot confirm count in status ${count.status}`);
    const updated = await tx.stockCount.update({ where: { id: countId }, data: { status: "COUNTED" } });
    await logAction(tx, {
      userId,
      action: "STOCK_COUNT_CONFIRM",
      entityType: "StockCount",
      entityId: countId,
      before: { status: "DRAFT" },
      after: { status: "COUNTED" },
    });
    return updated;
  });
}

export async function reconcileStockCount(countId: string, userId?: string) {
  return withStockTransaction(async (tx) => {
    const count = await tx.stockCount.findUnique({
      where: { id: countId },
      include: { lines: true },
    });
    if (!count) throw new Error("Stock count not found");
    if (count.status !== "COUNTED") throw new Error(`Cannot reconcile count in status ${count.status}`);

    for (const line of count.lines) {
      const variance = new Decimal(line.variance);
      if (variance.isZero()) continue; // no adjustment needed

      if (variance.gt(0)) {
        // Positive variance → ADJUSTMENT_IN (stock appeared)
        await recordMovement(tx, {
          materialId: line.materialId,
          movementType: "ADJUSTMENT_IN",
          toLocationId: count.locationId,
          qty: variance,
          reason: `Stock count adjustment (+${variance})`,
          refType: "STOCK_COUNT",
          refId: countId,
          userId,
        });
      } else {
        // Negative variance → ADJUSTMENT_OUT (stock missing)
        const absVariance = variance.abs();
        // Check we have enough stock to adjust out
        const item = await tx.stockLocationItem.findUnique({
          where: {
            locationId_materialId: {
              locationId: count.locationId,
              materialId: line.materialId,
            },
          },
        });
        const available = item ? new Decimal(item.qty) : new Decimal(0);
        if (available.lt(absVariance)) {
          throw new Error(
            `Cannot adjust out ${absVariance} of material ${line.materialId}: only ${available} available. Investigate the discrepancy.`,
          );
        }
        await recordMovement(tx, {
          materialId: line.materialId,
          movementType: "ADJUSTMENT_OUT",
          fromLocationId: count.locationId,
          qty: absVariance,
          reason: `Stock count adjustment (-${absVariance})`,
          refType: "STOCK_COUNT",
          refId: countId,
          userId,
        });
      }
    }

    // Refresh currentCost for all adjusted materials
    const adjustedMaterials = count.lines
      .filter((l) => !new Decimal(l.variance).isZero())
      .map((l) => l.materialId);
    if (adjustedMaterials.length > 0) {
      await refreshMaterialCurrentCost(tx, adjustedMaterials);
    }

    const updated = await tx.stockCount.update({ where: { id: countId }, data: { status: "RECONCILED" } });
    await logAction(tx, {
      userId,
      action: "STOCK_COUNT_RECONCILE",
      entityType: "StockCount",
      entityId: countId,
      before: { status: "COUNTED" },
      after: { status: "RECONCILED", adjustedLines: adjustedMaterials.length },
    });
    return updated;
  });
}
