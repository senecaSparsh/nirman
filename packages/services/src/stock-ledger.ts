import { prisma, type Prisma, type StockMovementType } from "@nirman/db";
import Decimal from "decimal.js";
import {
  computeMovingAverageCost,
  movementDirection,
  stockValueAfterIssue,
} from "./moving-average-cost";
import { toBaseUnit } from "./uom-conversion";
import { ServiceError } from "./errors";

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
  // ── Lot tracking ──
  lotId?: string;       // explicit lot to move into/out of
  lotNumber?: string;   // alternative: resolve by lot number (requires companyId)
  companyId?: string;   // required when lotNumber is used or a lot needs to be created
  // ── UOM conversion ──
  qtyUnit?: "base" | "secondary"; // defaults to "base"; if "secondary", qty is converted via toBaseUnit
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
    throw new ServiceError(
      `Movement ${input.movementType} requires a ${direction === "IN" ? "toLocationId" : "fromLocationId"}`,
    );
  }

  // ── Fetch the material for lot-tracking + UOM conversion ──
  const material = await tx.material.findUnique({
    where: { id: input.materialId },
    select: {
      isLotTracked: true,
      baseUnit: true,
      secondaryUnit: true,
      uomConversionFactor: true,
    },
  });

  // ── UOM conversion: always store quantities in baseUnit ──
  let rawQty = new Decimal(input.qty);
  if (
    input.qtyUnit === "secondary" &&
    material?.secondaryUnit &&
    material?.uomConversionFactor
  ) {
    const baseQty = toBaseUnit(Number(input.qty), material);
    rawQty = new Decimal(baseQty);
  }
  const moveQty = rawQty;

  // ── Lot tracking ──
  let lotId: string | undefined = input.lotId;

  if (material?.isLotTracked) {
    if (!lotId && !input.lotNumber) {
      if (direction === "IN") {
        // IN movements without a lot reference can auto-create a lot if lotNumber
        // is provided; but if neither is given, we cannot track the receipt.
        throw new ServiceError(
          `Material ${input.materialId} is lot-tracked: a lotId or lotNumber is required for IN movements`,
        );
      }
      // For OUT movements without a specific lot, use FIFO by receivedDate.
      if (!input.companyId) {
        throw new ServiceError(
          `Material ${input.materialId} is lot-tracked: a companyId is required for FIFO lot selection on OUT movements`,
        );
      }
      // FIFO: find the oldest lot with available stock
      const fifoLot = await tx.materialLot.findFirst({
        where: {
          materialId: input.materialId,
          companyId: input.companyId,
          deletedAt: null,
          currentQty: { gt: 0 },
        },
        orderBy: { receivedDate: "asc" },
      });
      if (!fifoLot) {
        throw new ServiceError(
          `No lot with available stock found for material ${input.materialId} (FIFO)`,
        );
      }
      lotId = fifoLot.id;
    } else if (!lotId && input.lotNumber && input.companyId) {
      // Resolve lot by lotNumber + companyId
      const lot = await tx.materialLot.findUnique({
        where: {
          materialId_lotNumber_companyId: {
            materialId: input.materialId,
            lotNumber: input.lotNumber,
            companyId: input.companyId,
          },
        },
      });
      if (!lot || lot.deletedAt) {
        throw new ServiceError(
          `Lot ${input.lotNumber} not found for material ${input.materialId}`,
        );
      }
      lotId = lot.id;
    }

    // ── Update the MaterialLot balance ──
    if (lotId) {
      if (direction === "IN") {
        // Create or update the lot
        const recvCost = new Decimal(input.unitCost ?? 0);
        const existingLot = await tx.materialLot.findUnique({ where: { id: lotId } });
        if (existingLot && !existingLot.deletedAt) {
          await tx.materialLot.update({
            where: { id: lotId },
            data: {
              currentQty: new Decimal(existingLot.currentQty).plus(moveQty),
            },
          });
        } else if (input.lotNumber && input.companyId) {
          // Auto-create the lot on receipt
          const created = await tx.materialLot.create({
            data: {
              id: lotId,
              materialId: input.materialId,
              companyId: input.companyId,
              lotNumber: input.lotNumber,
              receivedDate: new Date(),
              initialQty: moveQty,
              currentQty: moveQty,
              unitCost: recvCost,
            },
          });
          lotId = created.id;
        }
      } else {
        // OUT — decrement the lot's currentQty (FIFO or explicit lot)
        const lot = await tx.materialLot.findUnique({ where: { id: lotId } });
        if (!lot || lot.deletedAt) {
          throw new ServiceError(`Lot ${lotId} not found or deleted`);
        }
        const lotQty = new Decimal(lot.currentQty);
        if (moveQty.gt(lotQty)) {
          throw new ServiceError(
            `Insufficient lot stock: lot ${lot.lotNumber} has ${lotQty}, requested ${moveQty}`,
          );
        }
        await tx.materialLot.update({
          where: { id: lotId },
          data: { currentQty: lotQty.minus(moveQty) },
        });
      }
    }
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
      ...(lotId ? { lotId } : {}),
    },
    update: {},
  });

  const oldQty = new Decimal(item.qty);
  const oldMAC = new Decimal(item.movingAvgCost);

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
      throw new ServiceError(
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
      ...(lotId ? { lotId } : {}),
    },
  });

  return { movement, newQty, newMAC, balanceValueAfter, lotId };
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

/**
 * Returns all lots for a material with their current balances.
 * Includes supplier name and movement count for each lot.
 *
 * @param materialId  the material to query
 * @param companyId   scope to a specific company
 * @returns array of lots with balance + metadata
 */
export async function getLotHistory(materialId: string, companyId: string) {
  const lots = await prisma.materialLot.findMany({
    where: {
      materialId,
      companyId,
      deletedAt: null,
    },
    orderBy: { receivedDate: "desc" },
    include: {
      supplier: { select: { id: true, name: true } },
      _count: { select: { stockMovements: true } },
    },
  });

  return lots.map((lot) => ({
    id: lot.id,
    lotNumber: lot.lotNumber,
    batchCode: lot.batchCode,
    receivedDate: lot.receivedDate.toISOString(),
    expiryDate: lot.expiryDate?.toISOString() ?? null,
    initialQty: Number(lot.initialQty),
    currentQty: Number(lot.currentQty),
    unitCost: Number(lot.unitCost),
    supplierId: lot.supplierId,
    supplierName: lot.supplier?.name ?? null,
    notes: lot.notes,
    movementCount: lot._count.stockMovements,
    createdAt: lot.createdAt.toISOString(),
  }));
}

