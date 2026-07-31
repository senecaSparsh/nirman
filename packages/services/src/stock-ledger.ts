import { prisma, type Prisma, type StockMovementType } from "@nirman/db";
import Decimal from "decimal.js";
import {
  computeMovingAverageCost,
  movementDirection,
  stockValueAfterIssue,
} from "./moving-average-cost";

/**
 * Stock Ledger Service — the single entry point for all material quantity changes.
 *
 * INVARIANT: Every stock change produces exactly one StockMovement (immutable) AND
 * atomically updates the StockLocationItem (qty + movingAvgCost). These two writes
 * happen inside the same Prisma transaction — never one without the other.
 *
 * Current stock at a location = StockLocationItem.qty (maintained here).
 * Full audit trail = StockMovement records (append-only).
 */

type LocationId = string;
type MaterialId = string;

interface MovementInput {
  materialId: MaterialId;
  movementType: StockMovementType;
  fromLocationId?: LocationId;
  toLocationId?: LocationId;
  qty: Decimal;
  unitCost?: Decimal; // required for IN movements (receipt cost); for OUT, MAC is used
  reason?: string;
  refType?: string;
  refId?: string;
  userId?: string;
}

/**
 * Records a single stock movement and updates the StockLocationItem atomically.
 * For transfers (TRANSFER_OUT + TRANSFER_IN), call recordTransfer instead.
 */
export async function recordMovement(
  tx: Prisma.TransactionClient,
  input: MovementInput,
) {
  const direction = movementDirection(input.movementType);
  const locationId = direction === "IN" ? input.toLocationId : input.fromLocationId;
  if (!locationId) {
    throw new Error(
      `Movement ${input.movementType} requires a ${direction === "IN" ? "toLocationId" : "fromLocationId"}`,
    );
  }

  // Get or create the StockLocationItem (current-state cache)
  const item = await tx.stockLocationItem.upsert({
    where: {
      locationId_materialId: {
        locationId,
        materialId: input.materialId,
      },
    },
    create: {
      locationId,
      materialId: input.materialId,
      qty: new Decimal(0),
      movingAvgCost: new Decimal(0),
    },
    update: {},
  });

  const oldQty = new Decimal(item.qty);
  const oldMAC = new Decimal(item.movingAvgCost);
  const moveQty = new Decimal(input.qty);

  let newQty: Decimal;
  let newMAC: Decimal;
  let recordedUnitCost: Decimal;

  if (direction === "IN") {
    const recvCost = new Decimal(input.unitCost ?? 0);
    newQty = oldQty.plus(moveQty);
    newMAC = computeMovingAverageCost(oldQty, oldMAC, moveQty, recvCost);
    recordedUnitCost = recvCost;
  } else {
    // OUT — draw at current MAC; MAC doesn't change
    if (moveQty.gt(oldQty)) {
      throw new Error(
        `Insufficient stock: requested ${moveQty} ${input.materialId}, available ${oldQty} at location ${locationId}`,
      );
    }
    newQty = oldQty.minus(moveQty);
    newMAC = oldMAC;
    recordedUnitCost = oldMAC;
  }

  const balanceValueAfter = stockValueAfterIssue(newQty, newMAC);

  // Update the current-state cache
  await tx.stockLocationItem.update({
    where: { id: item.id },
    data: {
      qty: newQty,
      movingAvgCost: newMAC,
    },
  });

  // Append the immutable ledger entry
  const movement = await tx.stockMovement.create({
    data: {
      materialId: input.materialId,
      movementType: input.movementType,
      fromLocationId: input.fromLocationId,
      toLocationId: input.toLocationId,
      qty: moveQty,
      unitCost: recordedUnitCost,
      balanceAfter: newQty,
      balanceValueAfter,
      reason: input.reason,
      refType: input.refType,
      refId: input.refId,
      userId: input.userId,
    },
  });

  return { movement, newQty, newMAC, balanceValueAfter };
}

/**
 * Records a transfer: TRANSFER_OUT at source + TRANSFER_IN at destination.
 * Both movements + both StockLocationItem updates happen in one transaction.
 * The destination receives at the source's MAC (cost flows with the goods).
 */
export async function recordTransfer(
  tx: Prisma.TransactionClient,
  opts: {
    materialId: MaterialId;
    fromLocationId: LocationId;
    toLocationId: LocationId;
    qty: Decimal;
    reason?: string;
    refType?: string;
    refId?: string;
    userId?: string;
  },
) {
  // Source: TRANSFER_OUT
  const outResult = await recordMovement(tx, {
    materialId: opts.materialId,
    movementType: "TRANSFER_OUT",
    fromLocationId: opts.fromLocationId,
    qty: opts.qty,
    unitCost: undefined, // will use source MAC
    reason: opts.reason,
    refType: opts.refType,
    refId: opts.refId,
    userId: opts.userId,
  });

  // Destination: TRANSFER_IN at the source's MAC (cost flows with goods)
  const inResult = await recordMovement(tx, {
    materialId: opts.materialId,
    movementType: "TRANSFER_IN",
    toLocationId: opts.toLocationId,
    qty: opts.qty,
    unitCost: outResult.newMAC, // destination receives at source MAC
    reason: opts.reason,
    refType: opts.refType,
    refId: opts.refId,
    userId: opts.userId,
  });

  return { out: outResult, in: inResult };
}

/**
 * Convenience wrapper: runs the callback inside a Prisma transaction and
 * passes the transaction client to it. Use this to wrap multi-step stock operations.
 *
 * @example
 * await withStockTransaction(async (tx) => {
 *   for (const line of receiptLines) {
 *     await recordMovement(tx, { ... });
 *   }
 * });
 */
export async function withStockTransaction<T>(
  fn: (tx: Prisma.TransactionClient) => Promise<T>,
): Promise<T> {
  return prisma.$transaction(fn, {
    timeout: 15000,
    isolationLevel: "Serializable",
  });
}

/**
 * Refresh Material.currentCost to the weighted average of all non-deleted
 * location MACs for the given materials. Call after any stock movement that
 * changes a location's MAC (receipt, transfer, return, adjustment).
 */
export async function refreshMaterialCurrentCost(
  tx: Prisma.TransactionClient,
  materialIds: string[],
): Promise<void> {
  for (const materialId of materialIds) {
    const avg = await tx.stockLocationItem.aggregate({
      where: { materialId, location: { deletedAt: null } },
      _avg: { movingAvgCost: true },
    });
    if (avg._avg.movingAvgCost != null) {
      await tx.material.update({
        where: { id: materialId },
        data: { currentCost: avg._avg.movingAvgCost },
      });
    }
  }
}
