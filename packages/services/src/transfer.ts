import { prisma } from "@nirman/db";
import Decimal from "decimal.js";
import { recordMovement, recordTransfer, withStockTransaction, refreshMaterialCurrentCost } from "./stock-ledger";
import { logAction } from "./audit";

/**
 * Transfer Service — move materials between stock locations.
 *
 * Two modes, decided by whether the from/to locations belong to the same company:
 *
 *   Intra-company (same company):  DRAFT → COMPLETED (atomic) | DRAFT → CANCELLED
 *     Stock moves at the source's MAC — the destination inherits that MAC. No markup.
 *     This is the original v1 behaviour, unchanged.
 *
 *   Inter-company (different companies / SPVs):  the Stock Transfer Order (STO).
 *     The destination receives at a Transfer Price (TP), not the bare source MAC:
 *
 *       TP_line = baseCost_line + freight_line + handling_line + markup_line
 *       baseCost_line   = qty × sourceMAC
 *       freight_line    = freight × (baseCost_line / Σ baseCost)        (cost-weighted)
 *       handling_line   = handlingFee × (baseCost_line / Σ baseCost)   (cost-weighted)
 *       markup_line     = baseCost_line × markupPct / 100
 *       unitTransferPrice_line = TP_line / qty
 *
 *     So the destination's MAC reflects the inter-company markup + freight + handling,
 *     which is the prerequisite for inter-company accounting. The source still issues
 *     at its own MAC. Full inter-company AP/AR + consolidation elimination is a future
 *     GL concern; the TP is captured here so the cost basis is correct end-to-end.
 *
 * State machine is the same for both modes: DRAFT → COMPLETED | CANCELLED.
 */

// ── Pure transfer-price computation (testable, no DB) ───────────

export interface TransferPriceLineInput {
  qty: Decimal | number | string;
  unitCostAtSource: Decimal | number | string; // source MAC
}
export interface TransferPriceLineResult {
  qty: Decimal;
  unitCostAtSource: Decimal;
  baseCost: Decimal;
  freight: Decimal;
  handling: Decimal;
  markup: Decimal;
  lineTransferTotal: Decimal;
  unitTransferPrice: Decimal;
}
export interface TransferPriceResult {
  lines: TransferPriceLineResult[];
  totalBaseCost: Decimal;
  totalFreight: Decimal;
  totalHandling: Decimal;
  totalMarkup: Decimal;
  transferPriceTotal: Decimal;
}

/**
 * Compute the per-line transfer price for an inter-company STO.
 *
 * Freight + handling are header-level charges, allocated across lines by base-cost
 * weight (so a more expensive line absorbs more of the freight). Markup is a %
 * applied to each line's base cost. Returns per-line TP + header totals.
 *
 * Pure function — mirrors computeMovingAverageCost / computeLogisticsComplexityIndex.
 */
export function computeTransferPrice(
  lines: TransferPriceLineInput[],
  freight: Decimal | number | string = 0,
  handlingFee: Decimal | number | string = 0,
  markupPct: Decimal | number | string = 0,
): TransferPriceResult {
  if (lines.length === 0) {
    return {
      lines: [],
      totalBaseCost: new Decimal(0),
      totalFreight: new Decimal(0),
      totalHandling: new Decimal(0),
      totalMarkup: new Decimal(0),
      transferPriceTotal: new Decimal(0),
    };
  }

  const freightD = new Decimal(freight ?? 0);
  const handlingD = new Decimal(handlingFee ?? 0);
  const markupPctD = new Decimal(markupPct ?? 0);

  // Base cost per line + total (for freight/handling weight allocation)
  const baseCosts = lines.map((l) =>
    new Decimal(l.qty).times(new Decimal(l.unitCostAtSource)),
  );
  const totalBaseCost = baseCosts.reduce((s, b) => s.plus(b), new Decimal(0));

  const results: TransferPriceLineResult[] = lines.map((l, i) => {
    const qty = new Decimal(l.qty);
    const unitCostAtSource = new Decimal(l.unitCostAtSource);
    const baseCost = baseCosts[i]!;

    // Allocate freight + handling by base-cost weight (guard against zero total)
    const weight = totalBaseCost.gt(0) ? baseCost.div(totalBaseCost) : new Decimal(0);
    const lineFreight = freightD.times(weight);
    const lineHandling = handlingD.times(weight);
    const lineMarkup = baseCost.times(markupPctD).div(100);

    const lineTransferTotal = baseCost.plus(lineFreight).plus(lineHandling).plus(lineMarkup);
    const unitTransferPrice = qty.gt(0) ? lineTransferTotal.div(qty) : new Decimal(0);

    return {
      qty,
      unitCostAtSource,
      baseCost,
      freight: lineFreight,
      handling: lineHandling,
      markup: lineMarkup,
      lineTransferTotal,
      unitTransferPrice,
    };
  });

  const totalFreight = results.reduce((s, r) => s.plus(r.freight), new Decimal(0));
  const totalHandling = results.reduce((s, r) => s.plus(r.handling), new Decimal(0));
  const totalMarkup = results.reduce((s, r) => s.plus(r.markup), new Decimal(0));
  const transferPriceTotal = results.reduce((s, r) => s.plus(r.lineTransferTotal), new Decimal(0));

  return {
    lines: results,
    totalBaseCost,
    totalFreight,
    totalHandling,
    totalMarkup,
    transferPriceTotal,
  };
}

// ── Service ─────────────────────────────────────────────────────

interface CreateTransferInput {
  fromLocationId: string;
  toLocationId: string;
  notes?: string;
  userId?: string;
  /** Inter-company STO charges (only applied when from/to are different companies). */
  freight?: Decimal | number | string;
  handlingFee?: Decimal | number | string;
  markupPct?: Decimal | number | string;
  lines: {
    materialId: string;
    qty: Decimal | number | string;
  }[];
}

export async function createTransfer(input: CreateTransferInput) {
  if (input.fromLocationId === input.toLocationId) {
    throw new Error("Cannot transfer to the same location");
  }
  if (input.lines.length === 0) throw new Error("Transfer must have at least one line");

  // Validate locations
  const [fromLoc, toLoc] = await Promise.all([
    prisma.stockLocation.findFirst({ where: { id: input.fromLocationId, deletedAt: null } }),
    prisma.stockLocation.findFirst({ where: { id: input.toLocationId, deletedAt: null } }),
  ]);
  if (!fromLoc) throw new Error("Source location not found or deleted");
  if (!toLoc) throw new Error("Destination location not found or deleted");

  const isInterCompany = fromLoc.companyId !== toLoc.companyId;

  // Inter-company charges only matter for cross-company STOs; for intra-company
  // transfers we force them to zero so the destination simply inherits the source MAC.
  const freight = isInterCompany ? new Decimal(input.freight ?? 0) : new Decimal(0);
  const handlingFee = isInterCompany ? new Decimal(input.handlingFee ?? 0) : new Decimal(0);
  const markupPct = isInterCompany ? new Decimal(input.markupPct ?? 0) : new Decimal(0);

  // Validate materials + qty
  const materialIds = input.lines.map((l) => l.materialId);
  const materials = await prisma.material.findMany({
    where: { id: { in: materialIds }, deletedAt: null },
  });
  if (materials.length !== materialIds.length) {
    throw new Error("One or more materials not found or deleted");
  }
  for (const line of input.lines) {
    if (!new Decimal(line.qty).gt(0)) throw new Error("Transfer qty must be > 0");
  }

  return prisma.$transaction(async (tx) => {
    const transfer = await tx.stockTransfer.create({
      data: {
        fromLocationId: input.fromLocationId,
        toLocationId: input.toLocationId,
        notes: input.notes,
        status: "DRAFT",
        isInterCompany,
        freight,
        handlingFee,
        markupPct,
        lines: {
          create: input.lines.map((l) => ({
            materialId: l.materialId,
            qty: new Decimal(l.qty),
          })),
        },
      },
      include: { lines: true },
    });

    if (input.userId) {
      await logAction(tx, {
        userId: input.userId,
        action: "STOCK_TRANSFER_CREATE",
        entityType: "StockTransfer",
        entityId: transfer.id,
        after: {
          status: transfer.status,
          fromLocationId: transfer.fromLocationId,
          toLocationId: transfer.toLocationId,
          isInterCompany: transfer.isInterCompany,
        },
      });
    }

    return transfer;
  });
}

export async function completeTransfer(transferId: string, userId?: string) {
  return withStockTransaction(async (tx) => {
    const transfer = await tx.stockTransfer.findUnique({
      where: { id: transferId },
      include: { lines: true },
    });
    if (!transfer) throw new Error("Transfer not found");
    if (transfer.status !== "DRAFT") {
      throw new Error(`Cannot complete transfer in status ${transfer.status}`);
    }

    // Re-validate stock availability at source (may have changed since DRAFT)
    for (const line of transfer.lines) {
      const item = await tx.stockLocationItem.findUnique({
        where: {
          locationId_materialId: {
            locationId: transfer.fromLocationId,
            materialId: line.materialId,
          },
        },
      });
      const available = item ? new Decimal(item.qty) : new Decimal(0);
      if (available.lt(new Decimal(line.qty))) {
        throw new Error(
          `Insufficient stock for transfer: available ${available}, requested ${line.qty} of material ${line.materialId}`,
        );
      }
    }

    if (transfer.isInterCompany) {
      // Inter-company STO: destination receives at Transfer Price (not source MAC).
      // 1. Capture each line's source MAC.
      // 2. Compute TP via computeTransferPrice (freight + handling + markup).
      // 3. TRANSFER_OUT at source MAC, TRANSFER_IN at unitTransferPrice.
      // 4. Persist unitCostAtSource / unitTransferPrice / lineTransferTotal on lines.
      const lineInputs: TransferPriceLineInput[] = [];
      const sourceMacs: Decimal[] = [];
      for (const line of transfer.lines) {
        const item = await tx.stockLocationItem.findUnique({
          where: {
            locationId_materialId: {
              locationId: transfer.fromLocationId,
              materialId: line.materialId,
            },
          },
        });
        const sourceMac = new Decimal(item?.movingAvgCost ?? 0);
        sourceMacs.push(sourceMac);
        lineInputs.push({ qty: new Decimal(line.qty), unitCostAtSource: sourceMac });
      }

      const tp = computeTransferPrice(
        lineInputs,
        transfer.freight,
        transfer.handlingFee,
        transfer.markupPct,
      );

      // Execute the stock movements: OUT at source MAC, IN at transfer price.
      for (let i = 0; i < transfer.lines.length; i++) {
        const line = transfer.lines[i]!;
        const tpLine = tp.lines[i]!;
        await recordMovement(tx, {
          materialId: line.materialId,
          movementType: "TRANSFER_OUT",
          fromLocationId: transfer.fromLocationId,
          qty: new Decimal(line.qty),
          unitCost: undefined, // uses source MAC
          refType: "STOCK_TRANSFER",
          refId: transferId,
          userId,
        });
        await recordMovement(tx, {
          materialId: line.materialId,
          movementType: "TRANSFER_IN",
          toLocationId: transfer.toLocationId,
          qty: new Decimal(line.qty),
          unitCost: tpLine.unitTransferPrice, // destination receives at TP
          refType: "STOCK_TRANSFER",
          refId: transferId,
          userId,
        });
        // Persist the captured costs on the line
        await tx.stockTransferLine.update({
          where: { id: line.id },
          data: {
            unitCostAtSource: tpLine.unitCostAtSource,
            unitTransferPrice: tpLine.unitTransferPrice,
            lineTransferTotal: tpLine.lineTransferTotal,
          },
        });
      }

      // Refresh currentCost for all affected materials
      await refreshMaterialCurrentCost(tx, transfer.lines.map((l) => l.materialId));

      const updated = await tx.stockTransfer.update({
        where: { id: transferId },
        data: {
          status: "COMPLETED",
          transferPriceTotal: tp.transferPriceTotal,
        },
      });

      if (userId) {
        await logAction(tx, {
          userId,
          action: "STOCK_TRANSFER_COMPLETE",
          entityType: "StockTransfer",
          entityId: transferId,
          before: { status: transfer.status },
          after: {
            status: "COMPLETED",
            isInterCompany: true,
            transferPriceTotal: tp.transferPriceTotal.toString(),
          },
        });
      }

      return updated;
    }

    // Intra-company: destination inherits the source MAC (original v1 behaviour).
    for (const line of transfer.lines) {
      await recordTransfer(tx, {
        materialId: line.materialId,
        fromLocationId: transfer.fromLocationId,
        toLocationId: transfer.toLocationId,
        qty: new Decimal(line.qty),
        refType: "STOCK_TRANSFER",
        refId: transferId,
      });
    }

    // Refresh currentCost for all affected materials
    await refreshMaterialCurrentCost(tx, transfer.lines.map((l) => l.materialId));

    const updated = await tx.stockTransfer.update({
      where: { id: transferId },
      data: { status: "COMPLETED" },
    });

    if (userId) {
      await logAction(tx, {
        userId,
        action: "STOCK_TRANSFER_COMPLETE",
        entityType: "StockTransfer",
        entityId: transferId,
        before: { status: transfer.status },
        after: { status: "COMPLETED" },
      });
    }

    return updated;
  });
}

export async function cancelTransfer(transferId: string, userId?: string) {
  return prisma.$transaction(async (tx) => {
    const transfer = await tx.stockTransfer.findUnique({ where: { id: transferId } });
    if (!transfer) throw new Error("Transfer not found");
    if (transfer.status !== "DRAFT") {
      throw new Error(`Cannot cancel transfer in status ${transfer.status}`);
    }
    const updated = await tx.stockTransfer.update({
      where: { id: transferId },
      data: { status: "CANCELLED" },
    });

    if (userId) {
      await logAction(tx, {
        userId,
        action: "STOCK_TRANSFER_CANCEL",
        entityType: "StockTransfer",
        entityId: transferId,
        before: { status: transfer.status },
        after: { status: "CANCELLED" },
      });
    }

    return updated;
  });
}
