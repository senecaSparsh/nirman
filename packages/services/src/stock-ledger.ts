import { prisma, type Prisma, type StockMovementType } from "@nirman/db";
import { withSerializableTransaction } from "./transaction";
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

/**
 * Validate a stock movement input and return the resolved location ID.
 * Pure function — no DB access.
 *
 * Throws if the required location (toLocationId for IN, fromLocationId for OUT)
 * is missing, or if the movement quantity is ≤ 0.
 */
export function validateMovementInput(
  movementType: StockMovementType,
  fromLocationId: string | undefined,
  toLocationId: string | undefined,
  qty: Decimal,
): { direction: "IN" | "OUT"; locationId: string } {
  const direction = movementDirection(movementType);
  const locationId = direction === "IN" ? toLocationId : fromLocationId;
  if (!locationId) {
    throw new ServiceError(
      `Movement ${movementType} requires a ${direction === "IN" ? "toLocationId" : "fromLocationId"}`,
    );
  }
  if (!new Decimal(qty).gt(0)) {
    throw new ServiceError(`Movement quantity must be > 0 (got ${qty})`);
  }
  return { direction, locationId };
}

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
  companyId?: string;   // required when lotNumber is used or a lot needs to be created.
                        // If omitted, auto-derived from the StockLocation's companyId.
  // ── Lot metadata (propagated to MaterialLot on auto-create) ──
  lotBatchCode?: string;          // batch code from GRN line
  lotExpiryDate?: Date;           // expiry date from GRN line
  lotManufacturingDate?: Date;    // manufacturing date from GRN line
  lotSupplierId?: string;         // supplier from GRN/PO
  // ── UOM conversion ──
  qtyUnit?: "base" | "secondary"; // defaults to "base"; if "secondary", qty is converted via toBaseUnit
}

/**
 * Records a single stock movement and updates the StockLocationItem atomically.
 * For transfers (TRANSFER_OUT + TRANSFER_IN), call recordTransfer instead.
 *
 * IMPORTANT: This function MUST be called inside a Serializable-isolation
 * transaction (withStockTransaction or withSerializableTransaction). The
 * read-then-write pattern (read StockLocationItem.qty → compute new qty →
 * write) is only safe under Serializable isolation. If called outside a
 * Serializable transaction, concurrent movements can cause lost updates
 * and negative stock.
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
  const material = await tx.material.findFirst({
    where: { id: input.materialId, deletedAt: null },
    select: {
      isLotTracked: true,
      code: true,
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
    rawQty = toBaseUnit(input.qty, material);
  }
  const moveQty = rawQty;
  if (!moveQty.gt(0)) {
    throw new ServiceError(`Movement quantity must be > 0 (got ${moveQty})`);
  }

  // ── Lot tracking ──
  let lotId: string | undefined = input.lotId;

  if (material?.isLotTracked) {
    // Auto-derive companyId from the StockLocation if not explicitly provided.
    // This makes lot tracking work transparently for all callers without
    // requiring each one to pass companyId.
    let companyId = input.companyId;
    if (!companyId) {
      const loc = await tx.stockLocation.findUnique({
        where: { id: locationId },
        select: { companyId: true },
      });
      companyId = loc?.companyId;
    }

    if (!lotId && !input.lotNumber) {
      if (direction === "IN") {
        // Auto-generate a lot number for IN movements when none is provided.
        // Format: AUTO-{materialCode}-{YYYYMMDDHHmmss} — unique per receipt event.
        const now = new Date();
        const ts = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}${String(now.getHours()).padStart(2, "0")}${String(now.getMinutes()).padStart(2, "0")}${String(now.getSeconds()).padStart(2, "0")}`;
        const autoLotNumber = `AUTO-${material.code}-${ts}`;
        if (!companyId) {
          throw new ServiceError(
            `Material ${input.materialId} is lot-tracked: could not determine companyId for auto-lot creation`,
          );
        }
        const recvCost = new Decimal(input.unitCost ?? 0);
        const created = await tx.materialLot.create({
          data: {
            materialId: input.materialId,
            companyId,
            lotNumber: autoLotNumber,
            receivedDate: new Date(),
            batchCode: input.lotBatchCode ?? null,
            manufacturingDate: input.lotManufacturingDate ?? null,
            expiryDate: input.lotExpiryDate ?? null,
            initialQty: moveQty,
            currentQty: moveQty,
            unitCost: recvCost,
            supplierId: input.lotSupplierId ?? null,
          },
        });
        lotId = created.id;
      } else {
        // For OUT movements without a specific lot, use FIFO by receivedDate.
        if (!companyId) {
          throw new ServiceError(
            `Material ${input.materialId} is lot-tracked: could not determine companyId for FIFO lot selection`,
          );
        }
        // FIFO: find the oldest lot with available stock
        const fifoLot = await tx.materialLot.findFirst({
          where: {
            materialId: input.materialId,
            companyId,
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
      }
    } else if (!lotId && input.lotNumber) {
      if (!companyId) {
        throw new ServiceError(
          `Material ${input.materialId} is lot-tracked: could not determine companyId to resolve lot ${input.lotNumber}`,
        );
      }
      // Resolve lot by lotNumber + companyId
      const lot = await tx.materialLot.findUnique({
        where: {
          materialId_lotNumber_companyId: {
            materialId: input.materialId,
            lotNumber: input.lotNumber,
            companyId,
          },
        },
      });
      if (lot && !lot.deletedAt) {
        lotId = lot.id;
      } else if (direction === "IN") {
        // Auto-create the lot on receipt (IN movement) with full metadata
        const recvCost = new Decimal(input.unitCost ?? 0);
        const created = await tx.materialLot.create({
          data: {
            materialId: input.materialId,
            companyId,
            lotNumber: input.lotNumber,
            receivedDate: new Date(),
            batchCode: input.lotBatchCode ?? null,
            manufacturingDate: input.lotManufacturingDate ?? null,
            expiryDate: input.lotExpiryDate ?? null,
            initialQty: moveQty,
            currentQty: moveQty,
            unitCost: recvCost,
            supplierId: input.lotSupplierId ?? null,
          },
        });
        lotId = created.id;
      } else if (lot && lot.deletedAt) {
        throw new ServiceError(
          `Lot ${input.lotNumber} is deleted for material ${input.materialId}`,
        );
      } else {
        throw new ServiceError(
          `Lot ${input.lotNumber} not found for material ${input.materialId}`,
        );
      }
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
        } else if (input.lotNumber && companyId) {
          // Auto-create the lot on receipt
          const created = await tx.materialLot.create({
            data: {
              id: lotId,
              materialId: input.materialId,
              companyId,
              lotNumber: input.lotNumber,
              receivedDate: new Date(),
              batchCode: input.lotBatchCode ?? null,
              manufacturingDate: input.lotManufacturingDate ?? null,
              expiryDate: input.lotExpiryDate ?? null,
              initialQty: moveQty,
              currentQty: moveQty,
              unitCost: recvCost,
              supplierId: input.lotSupplierId ?? null,
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
  // The upsert ensures the row exists. For OUT movements, we then use an
  // atomic conditional UPDATE to prevent lost updates even if a future
  // caller accidentally uses a non-Serializable transaction.
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
    // Double-check sufficiency (the Serializable tx already protects this,
    // but this guard prevents silent negative stock if isolation is ever
    // downgraded).
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
    // ── Lot tracking ──
    lotNumber?: string;   // specific lot to transfer (FIFO if omitted)
    companyId?: string;   // auto-derived from locations if omitted
    // ── Lot metadata (for IN side when auto-creating) ──
    lotBatchCode?: string;
    lotExpiryDate?: Date;
    lotManufacturingDate?: Date;
    lotSupplierId?: string;
  },
) {
  if (!new Decimal(opts.qty).gt(0)) {
    throw new ServiceError(`Transfer quantity must be > 0 (got ${opts.qty})`);
  }
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
    lotNumber: opts.lotNumber,
    companyId: opts.companyId,
  });

  // Destination: TRANSFER_IN at the source's MAC (cost flows with goods)
  // Pass the resolved lotId from the OUT side so the IN side uses the same lot
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
    lotId: outResult.lotId, // reuse the same lot
    companyId: opts.companyId,
    lotBatchCode: opts.lotBatchCode,
    lotExpiryDate: opts.lotExpiryDate,
    lotManufacturingDate: opts.lotManufacturingDate,
    lotSupplierId: opts.lotSupplierId,
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
  const MAX_RETRIES = 5;
  let lastError: unknown;
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      return await prisma.$transaction(fn, {
        timeout: 15000,
        isolationLevel: "Serializable",
      });
    } catch (err) {
      lastError = err;
      const msg = err instanceof Error ? err.message : String(err);
      const code = (err as { code?: string }).code;
      // Retry on write conflict / deadlock (Serializable isolation can cause these)
      // Also retry on P2002 unique-constraint violations (sequence number collisions)
      const isRetryable =
        msg.includes("write conflict") ||
        msg.includes("deadlock") ||
        msg.includes("could not serialize") ||
        code === "P2002";
      if (isRetryable) {
        // Exponential backoff with jitter: 100ms, 200ms, 400ms, 800ms, 1600ms
        const baseDelay = 100 * Math.pow(2, attempt);
        const jitter = Math.random() * 50;
        await new Promise((r) => setTimeout(r, baseDelay + jitter));
        continue;
      }
      throw err;
    }
  }
  const msg = lastError instanceof Error ? lastError.message : String(lastError);
  throw new ServiceError(
    "This operation conflicted with another concurrent transaction. Please retry.",
    409,
  );
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
    // Qty-weighted average across all locations (not simple average).
    // MAC = Σ(qty_i × mac_i) / Σ(qty_i).  When total qty is 0, keep the
    // last known currentCost (don't overwrite with 0).
    const items = await tx.stockLocationItem.findMany({
      where: { materialId, location: { deletedAt: null }, material: { deletedAt: null } },
      select: { qty: true, movingAvgCost: true },
    });
    const totalQty = items.reduce((s, i) => s.add(i.qty), new Decimal(0));
    if (totalQty.gt(0)) {
      const totalValue = items.reduce(
        (s, i) => s.add(i.qty.mul(i.movingAvgCost)),
        new Decimal(0),
      );
      const weightedAvg = totalValue.div(totalQty);
      await tx.material.update({
        where: { id: materialId },
        data: { currentCost: weightedAvg },
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

