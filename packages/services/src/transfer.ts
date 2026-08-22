import { prisma } from "@nirman/db";
import Decimal from "decimal.js";
import { recordMovement, recordTransfer, withStockTransaction, refreshMaterialCurrentCost } from "./stock-ledger";
import { logAction } from "./audit";
import { autoFillHsnGst } from "./material-service";
import { postTransferShortage, postInterCompanyTransfer } from "./gl-posting";
import { ServiceError } from "./errors";
import { assertGatePassApproved, autoCreateGatePassFromRef } from "./gate-pass";

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
  /** IDs of companies in the current company's group — both locations must belong to one of these. */
  companyGroupIds: string[];
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
    throw new ServiceError("Cannot transfer to the same location");
  }
  if (input.lines.length === 0) throw new ServiceError("Transfer must have at least one line");
  if (input.companyGroupIds.length === 0) throw new ServiceError("companyGroupIds is required");

  // Validate locations — both must belong to companies within the user's company group
  const [fromLoc, toLoc] = await Promise.all([
    prisma.stockLocation.findFirst({ where: { id: input.fromLocationId, companyId: { in: input.companyGroupIds }, deletedAt: null } }),
    prisma.stockLocation.findFirst({ where: { id: input.toLocationId, companyId: { in: input.companyGroupIds }, deletedAt: null } }),
  ]);
  if (!fromLoc) throw new ServiceError("Source location not found or deleted", 404);
  if (!toLoc) throw new ServiceError("Destination location not found or deleted", 404);

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
    throw new ServiceError("One or more materials not found or deleted", 404);
  }
  for (const line of input.lines) {
    if (!new Decimal(line.qty).gt(0)) throw new ServiceError("Transfer qty must be > 0");
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
        companyId: fromLoc.companyId,
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

    // Auto-create a gate pass (PENDING) for the outbound items
    await autoCreateGatePassFromRef(tx, {
      companyId: fromLoc.companyId,
      locationId: input.fromLocationId,
      category: "STOCK_TRANSFER",
      refType: "StockTransfer",
      refId: transfer.id,
      lines: input.lines.map((l) => ({ materialId: l.materialId, qty: l.qty })),
      destination: toLoc.name,
      createdById: input.userId,
    });

    return transfer;
  }, { isolationLevel: "Serializable" });
}

/**
 * Dispatch a transfer: DRAFT → IN_TRANSIT.
 * Executes TRANSFER_OUT (stock leaves source). For inter-company, also captures
 * source MACs and computes the transfer price. Stock is "in transit" — not at
 * either location in the system until completeTransfer() is called.
 */
export async function dispatchTransfer(
  transferId: string,
  userId?: string,
  dispatchDetails?: {
    vehicleType?: string;
    vehicleNumber?: string;
    driverName?: string;
    driverPhone?: string;
    transporterName?: string;
    challanNumber?: string;
    packageCount?: number;
    dispatchPhotos?: unknown;
    dispatchSignature?: string;
  },
) {
  return withStockTransaction(async (tx) => {
    const transfer = await tx.stockTransfer.findUnique({
      where: { id: transferId },
      include: { lines: true, fromLocation: { select: { companyId: true } } },
    });
    if (!transfer) throw new ServiceError("Transfer not found", 404);
    if (transfer.status !== "DRAFT") {
      throw new ServiceError(`Cannot dispatch transfer in status ${transfer.status}`);
    }

    // Gate Pass check — items cannot leave the gate until the gate pass is approved
    await assertGatePassApproved("StockTransfer", transferId);

    // Re-validate stock availability at source
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
        throw new ServiceError(
          `Insufficient stock for transfer: available ${available}, requested ${line.qty} of material ${line.materialId}`,
        );
      }
    }

    // Execute TRANSFER_OUT for each line (stock leaves source)
    // Capture the source MAC from the result so completeTransfer can compute
    // the inter-company transfer price correctly (source MAC at dispatch time).
    for (const line of transfer.lines) {
      const outResult = await recordMovement(tx, {
        materialId: line.materialId,
        movementType: "TRANSFER_OUT",
        fromLocationId: transfer.fromLocationId,
        qty: new Decimal(line.qty),
        unitCost: undefined, // uses source MAC
        refType: "STOCK_TRANSFER",
        refId: transferId,
        userId,
      });
      // Persist the source MAC on the line for completeTransfer to use
      await tx.stockTransferLine.update({
        where: { id: line.id },
        data: { unitCostAtSource: outResult.newMAC },
      });
    }

    const updated = await tx.stockTransfer.update({
      where: { id: transferId },
      data: {
        status: "IN_TRANSIT",
        dispatchedAt: new Date(),
        dispatchedById: userId,
        vehicleType: dispatchDetails?.vehicleType,
        vehicleNumber: dispatchDetails?.vehicleNumber,
        driverName: dispatchDetails?.driverName,
        driverPhone: dispatchDetails?.driverPhone,
        transporterName: dispatchDetails?.transporterName,
        challanNumber: dispatchDetails?.challanNumber,
        packageCount: dispatchDetails?.packageCount,
        dispatchPhotos: dispatchDetails?.dispatchPhotos as never,
        dispatchSignature: dispatchDetails?.dispatchSignature,
      },
    });

    if (userId) {
      await logAction(tx, {
        userId,
        companyId: transfer.fromLocation.companyId,
        action: "STOCK_TRANSFER_DISPATCH",
        entityType: "StockTransfer",
        entityId: transferId,
        before: { status: transfer.status },
        after: { status: "IN_TRANSIT" },
      });
    }

    return updated;
  });
}

interface CompleteTransferProof {
  receivedById?: string;
  receiverSignature?: string;
  receiverLat?: number;
  receiverLng?: number;
  receiverLocation?: string;
  photos?: unknown; // JSON array
  deliveryMode?: string;
  shortageRemarks?: string;
  damageRemarks?: string;
  // Supervisor co-signature
  supervisorSignature?: string;
  supervisorId?: string;
  // Weighbridge
  weighbridgeTicketNo?: string;
  grossWeight?: Decimal | number | string;
  tareWeight?: Decimal | number | string;
  netWeight?: Decimal | number | string;
  // Partial receipt: per-line received quantities
  lineReceipts?: { lineId: string; qtyReceived: number }[];
}

export async function completeTransfer(transferId: string, userId?: string, proof?: CompleteTransferProof) {
  const updated = await withStockTransaction(async (tx) => {
    const transfer = await tx.stockTransfer.findUnique({
      where: { id: transferId },
      include: {
        lines: true,
        fromLocation: { select: { companyId: true } },
        toLocation: { select: { companyId: true, lat: true, lng: true, geoRadius: true } },
      },
    });
    if (!transfer) throw new ServiceError("Transfer not found", 404);

    // Accept both DRAFT (legacy atomic) and IN_TRANSIT (new split flow)
    if (transfer.status !== "DRAFT" && transfer.status !== "IN_TRANSIT") {
      throw new ServiceError(`Cannot complete transfer in status ${transfer.status}`);
    }

    const wasDispatched = transfer.status === "IN_TRANSIT";

    // Helper: get received qty for a line (supports partial receipt)
    const getReceivedQty = (lineId: string, fullQty: Decimal): Decimal => {
      if (!proof?.lineReceipts) return fullQty; // default: full qty
      const lr = proof.lineReceipts.find((r) => r.lineId === lineId);
      if (!lr || lr.qtyReceived <= 0) return new Decimal(0);
      return Decimal.min(new Decimal(lr.qtyReceived), fullQty); // can't exceed dispatched qty
    };

    // Geo-fence validation
    let geoFenceOk: boolean | undefined;
    let geoFenceDistance: number | undefined;
    if (transfer.toLocation.lat != null && transfer.toLocation.lng != null && proof?.receiverLat != null && proof?.receiverLng != null) {
      const R = 6371000;
      const toRad = (d: number) => (d * Math.PI) / 180;
      const dLat = toRad(proof.receiverLat - transfer.toLocation.lat);
      const dLng = toRad(proof.receiverLng - transfer.toLocation.lng);
      const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(transfer.toLocation.lat)) * Math.cos(toRad(proof.receiverLat)) * Math.sin(dLng / 2) ** 2;
      geoFenceDistance = Math.round(2 * R * Math.asin(Math.sqrt(a)));
      geoFenceOk = geoFenceDistance <= (transfer.toLocation.geoRadius ?? 500);
    }

    // If still DRAFT (legacy path), validate stock and do TRANSFER_OUT first
    if (!wasDispatched) {
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
          throw new ServiceError(
            `Insufficient stock for transfer: available ${available}, requested ${line.qty} of material ${line.materialId}`,
          );
        }
      }
    }

    if (transfer.isInterCompany) {
      // Inter-company STO: destination receives at Transfer Price (not source MAC).
      const lineInputs: TransferPriceLineInput[] = [];

      if (wasDispatched) {
        for (const line of transfer.lines) {
          const mac = line.unitCostAtSource ? new Decimal(line.unitCostAtSource) : new Decimal(0);
          const recvQty = getReceivedQty(line.id, new Decimal(line.qty));
          lineInputs.push({ qty: recvQty, unitCostAtSource: mac });
        }
      } else {
        for (const line of transfer.lines) {
          const outResult = await recordMovement(tx, {
            materialId: line.materialId,
            movementType: "TRANSFER_OUT",
            fromLocationId: transfer.fromLocationId,
            qty: new Decimal(line.qty),
            unitCost: undefined,
            refType: "STOCK_TRANSFER",
            refId: transferId,
            userId,
          });
          const sourceMac = outResult.newMAC;
          const recvQty = getReceivedQty(line.id, new Decimal(line.qty));
          lineInputs.push({ qty: recvQty, unitCostAtSource: sourceMac });
        }
      }

      const tp = computeTransferPrice(
        lineInputs,
        transfer.freight,
        transfer.handlingFee,
        transfer.markupPct,
      );

      // TRANSFER_IN at transfer price + persist costs on lines.
      // If partial receipt (qtyReceived < qty), record the shortage as a
      // stock loss (ADJUSTMENT_OUT) so the books balance — the shortage qty
      // left source via TRANSFER_OUT but never arrived at destination.
      const shortageLines: { materialId: string; shortageQty: Decimal; unitCost: Decimal }[] = [];
      for (let i = 0; i < transfer.lines.length; i++) {
        const line = transfer.lines[i]!;
        const tpLine = tp.lines[i]!;
        const fullQty = new Decimal(line.qty);
        const recvQty = getReceivedQty(line.id, fullQty);
        if (recvQty.gt(0)) {
          await recordMovement(tx, {
            materialId: line.materialId,
            movementType: "TRANSFER_IN",
            toLocationId: transfer.toLocationId,
            qty: recvQty,
            unitCost: tpLine.unitTransferPrice,
            refType: "STOCK_TRANSFER",
            refId: transferId,
            userId,
          });
        }
        // Record shortage (lost in transit) as ADJUSTMENT_OUT at SOURCE —
        // the stock left source during dispatch but never arrived at destination.
        // Recording at destination would create negative stock (it was never there).
        const shortage = fullQty.minus(recvQty);
        if (shortage.gt(0)) {
          shortageLines.push({ materialId: line.materialId, shortageQty: shortage, unitCost: tpLine.unitCostAtSource });
          await recordMovement(tx, {
            materialId: line.materialId,
            movementType: "ADJUSTMENT_OUT",
            fromLocationId: transfer.fromLocationId,
            qty: shortage,
            unitCost: tpLine.unitCostAtSource,
            refType: "STOCK_TRANSFER_SHORTAGE",
            refId: transferId,
            userId,
          });
        }
        await tx.stockTransferLine.update({
          where: { id: line.id },
          data: {
            qtyReceived: recvQty,
            unitCostAtSource: tpLine.unitCostAtSource,
            unitTransferPrice: tpLine.unitTransferPrice,
            lineTransferTotal: tpLine.lineTransferTotal,
          },
        });
      }

      // Post GL entry for transfer shortages (debit Inventory Shrinkage, credit Inventory)
      if (shortageLines.length > 0) {
        await postTransferShortage(tx, {
          companyId: transfer.fromLocation.companyId,
          transferId,
          postedById: userId,
          lines: shortageLines,
        });
      }

      // Post inter-company GL entries (AP/AR + markup revenue)
      await postInterCompanyTransfer(tx, {
        transferId,
        sourceCompanyId: transfer.fromLocation.companyId,
        destCompanyId: transfer.toLocation.companyId,
        postedById: userId,
        lines: transfer.lines.map((l, i) => ({
          materialId: l.materialId,
          qty: new Decimal(l.qty),
          sourceUnitCost: tp.lines[i]!.unitCostAtSource,
          transferUnitPrice: tp.lines[i]!.unitTransferPrice,
        })),
        freight: new Decimal(transfer.freight ?? 0),
        handlingFee: new Decimal(transfer.handlingFee ?? 0),
      });

      await refreshMaterialCurrentCost(tx, transfer.lines.map((l) => l.materialId));

      const updated = await tx.stockTransfer.update({
        where: { id: transferId },
        data: {
          status: "COMPLETED",
          transferPriceTotal: tp.transferPriceTotal,
          receivedAt: new Date(),
          receivedById: proof?.receivedById ?? userId,
          receiverSignature: proof?.receiverSignature,
          receiverLat: proof?.receiverLat,
          receiverLng: proof?.receiverLng,
          receiverLocation: proof?.receiverLocation,
          geoFenceOk,
          geoFenceDistance,
          photos: proof?.photos as never,
          deliveryMode: proof?.deliveryMode,
          shortageRemarks: proof?.shortageRemarks,
          damageRemarks: proof?.damageRemarks,
          supervisorSignature: proof?.supervisorSignature,
          supervisorId: proof?.supervisorId,
          weighbridgeTicketNo: proof?.weighbridgeTicketNo,
          grossWeight: proof?.grossWeight != null ? new Decimal(proof.grossWeight) : undefined,
          tareWeight: proof?.tareWeight != null ? new Decimal(proof.tareWeight) : undefined,
          netWeight: proof?.netWeight != null ? new Decimal(proof.netWeight) : undefined,
        },
      });

      if (userId) {
        await logAction(tx, {
          userId,
          companyId: transfer.fromLocation.companyId,
          action: "STOCK_TRANSFER_COMPLETE",
          entityType: "StockTransfer",
          entityId: transferId,
          before: { status: transfer.status },
          after: {
            status: "COMPLETED",
            isInterCompany: true,
            transferPriceTotal: tp.transferPriceTotal.toString(),
            partial: proof?.lineReceipts ? "yes" : "no",
          },
        });
      }

      return updated;
    }

    // Intra-company: destination inherits the source MAC.
    if (!wasDispatched) {
      // Legacy path: do both OUT + IN atomically
      for (const line of transfer.lines) {
        const fullQty = new Decimal(line.qty);
        const recvQty = getReceivedQty(line.id, fullQty);
        if (recvQty.gt(0)) {
          await recordTransfer(tx, {
            materialId: line.materialId,
            fromLocationId: transfer.fromLocationId,
            toLocationId: transfer.toLocationId,
            qty: recvQty,
            refType: "STOCK_TRANSFER",
            refId: transferId,
          });
        }
        // Record shortage (lost in transit) as ADJUSTMENT_OUT at SOURCE —
        // in the legacy path, recordTransfer only moves recvQty, so the shortage
        // qty never left source. We need to write it off from source.
        const shortage = fullQty.minus(recvQty);
        if (shortage.gt(0)) {
          let sourceMac: Decimal;
          if (line.unitCostAtSource) {
            sourceMac = new Decimal(line.unitCostAtSource);
          } else {
            const item = await tx.stockLocationItem.findUnique({
              where: {
                locationId_materialId: {
                  locationId: transfer.fromLocationId,
                  materialId: line.materialId,
                },
              },
            });
            sourceMac = item ? new Decimal(item.movingAvgCost) : new Decimal(0);
          }
          await recordMovement(tx, {
            materialId: line.materialId,
            movementType: "ADJUSTMENT_OUT",
            fromLocationId: transfer.fromLocationId,
            qty: shortage,
            unitCost: sourceMac,
            refType: "STOCK_TRANSFER_SHORTAGE",
            refId: transferId,
            userId,
          });
        }
        await tx.stockTransferLine.update({
          where: { id: line.id },
          data: { qtyReceived: recvQty },
        });
      }
    } else {
      // New path: stock was already moved OUT during dispatch, just do TRANSFER_IN
      for (const line of transfer.lines) {
        const fullQty = new Decimal(line.qty);
        const recvQty = getReceivedQty(line.id, fullQty);
        let sourceMac: Decimal;
        if (line.unitCostAtSource) {
          sourceMac = new Decimal(line.unitCostAtSource);
        } else {
          const item = await tx.stockLocationItem.findUnique({
            where: {
              locationId_materialId: {
                locationId: transfer.fromLocationId,
                materialId: line.materialId,
              },
            },
          });
          sourceMac = item ? new Decimal(item.movingAvgCost) : new Decimal(0);
        }
        if (recvQty.gt(0)) {
          await recordMovement(tx, {
            materialId: line.materialId,
            movementType: "TRANSFER_IN",
            toLocationId: transfer.toLocationId,
            qty: recvQty,
            unitCost: sourceMac,
            refType: "STOCK_TRANSFER",
            refId: transferId,
            userId,
          });
        }
        // Record shortage (lost in transit) as ADJUSTMENT_OUT at SOURCE —
        // stock was moved OUT of source during dispatch but never arrived.
        // Recording at destination would create negative stock (it was never there).
        const shortage = fullQty.minus(recvQty);
        if (shortage.gt(0)) {
          await recordMovement(tx, {
            materialId: line.materialId,
            movementType: "ADJUSTMENT_OUT",
            fromLocationId: transfer.fromLocationId,
            qty: shortage,
            unitCost: sourceMac,
            refType: "STOCK_TRANSFER_SHORTAGE",
            refId: transferId,
            userId,
          });
        }
        await tx.stockTransferLine.update({
          where: { id: line.id },
          data: { qtyReceived: recvQty },
        });
      }
    }

    await refreshMaterialCurrentCost(tx, transfer.lines.map((l) => l.materialId));

    const updated = await tx.stockTransfer.update({
      where: { id: transferId },
      data: {
        status: "COMPLETED",
        receivedAt: new Date(),
        receivedById: proof?.receivedById ?? userId,
        receiverSignature: proof?.receiverSignature,
        receiverLat: proof?.receiverLat,
        receiverLng: proof?.receiverLng,
        receiverLocation: proof?.receiverLocation,
        geoFenceOk,
        geoFenceDistance,
        photos: proof?.photos as never,
        deliveryMode: proof?.deliveryMode,
        shortageRemarks: proof?.shortageRemarks,
        damageRemarks: proof?.damageRemarks,
        supervisorSignature: proof?.supervisorSignature,
        supervisorId: proof?.supervisorId,
        weighbridgeTicketNo: proof?.weighbridgeTicketNo,
        grossWeight: proof?.grossWeight != null ? new Decimal(proof.grossWeight) : undefined,
        tareWeight: proof?.tareWeight != null ? new Decimal(proof.tareWeight) : undefined,
        netWeight: proof?.netWeight != null ? new Decimal(proof.netWeight) : undefined,
      },
    });

    if (userId) {
      await logAction(tx, {
        userId,
        companyId: transfer.fromLocation.companyId,
        action: "STOCK_TRANSFER_COMPLETE",
        entityType: "StockTransfer",
        entityId: transferId,
        before: { status: transfer.status },
        after: { status: "COMPLETED", partial: proof?.lineReceipts ? "yes" : "no" },
      });
    }

    return updated;
  });

  // Auto-fill HSN/GST on materials that are missing it (best-effort, outside tx)
  const transferWithLines = await prisma.stockTransfer.findUnique({
    where: { id: transferId },
    select: { lines: { select: { materialId: true } } },
  });
  void (async () => {
    if (transferWithLines) {
      for (const line of transferWithLines.lines) {
        try {
          await autoFillHsnGst(line.materialId);
        } catch { /* best-effort */ }
      }
    }
  })();

  return updated;
}

/**
 * Return an IN_TRANSIT transfer to source — goods come back (accident, wrong
 * destination, rejected at destination). Does TRANSFER_IN back to the source
 * location and marks the transfer as CANCELLED.
 */
export async function returnTransferToSource(transferId: string, userId?: string, reason?: string) {
  return withStockTransaction(async (tx) => {
    const transfer = await tx.stockTransfer.findUnique({
      where: { id: transferId },
      include: { lines: true, fromLocation: { select: { companyId: true } } },
    });
    if (!transfer) throw new ServiceError("Transfer not found", 404);
    if (transfer.status !== "IN_TRANSIT") {
      throw new ServiceError(`Cannot return transfer in status ${transfer.status} — must be IN_TRANSIT`);
    }

    // Move stock back to source (TRANSFER_IN at source, using captured source MAC)
    for (const line of transfer.lines) {
      const sourceMac = line.unitCostAtSource ? new Decimal(line.unitCostAtSource) : new Decimal(0);
      await recordMovement(tx, {
        materialId: line.materialId,
        movementType: "TRANSFER_IN",
        toLocationId: transfer.fromLocationId,
        qty: new Decimal(line.qty),
        unitCost: sourceMac,
        refType: "STOCK_TRANSFER",
        refId: transferId,
        userId,
      });
    }

    await refreshMaterialCurrentCost(tx, transfer.lines.map((l) => l.materialId));

    const updated = await tx.stockTransfer.update({
      where: { id: transferId },
      data: {
        status: "CANCELLED",
        shortageRemarks: reason ? `Returned to source: ${reason}` : "Returned to source",
      },
    });

    if (userId) {
      await logAction(tx, {
        userId,
        companyId: transfer.fromLocation.companyId,
        action: "STOCK_TRANSFER_RETURN_TO_SOURCE",
        entityType: "StockTransfer",
        entityId: transferId,
        before: { status: "IN_TRANSIT" },
        after: { status: "CANCELLED", reason },
      });
    }

    return updated;
  });
}

export async function cancelTransfer(transferId: string, userId?: string) {
  return prisma.$transaction(async (tx) => {
    const transfer = await tx.stockTransfer.findUnique({ where: { id: transferId }, include: { fromLocation: { select: { companyId: true } } } });
    if (!transfer) throw new ServiceError("Transfer not found", 404);
    if (transfer.status !== "DRAFT") {
      throw new ServiceError(`Cannot cancel transfer in status ${transfer.status}`);
    }
    const updated = await tx.stockTransfer.update({
      where: { id: transferId },
      data: { status: "CANCELLED" },
    });

    if (userId) {
      await logAction(tx, {
        userId,
        companyId: transfer.fromLocation.companyId,
        action: "STOCK_TRANSFER_CANCEL",
        entityType: "StockTransfer",
        entityId: transferId,
        before: { status: transfer.status },
        after: { status: "CANCELLED" },
      });
    }

    return updated;
  }, { isolationLevel: "Serializable" });
}
