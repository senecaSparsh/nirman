import { prisma } from "@nirman/db";
import Decimal from "decimal.js";
import { recordMovement, withStockTransaction, refreshMaterialCurrentCost } from "./stock-ledger";
import { logAction } from "./audit";
import { postDirectPurchase, reverseJournalEntry } from "./gl-posting";
import { ServiceError } from "./errors";

/**
 * Direct Purchase Service — simplified purchase log for local/ad-hoc buys
 * that don't warrant a formal Purchase Order.
 *
 * Matches the client's paper "Purchase Register" (P-XXXXX): supplier name,
 * bill date, bill amount, optional line items. If lines specify materials +
 * qty + rate, stock is received into the location (with MAC update).
 *
 * This is NOT a replacement for the PO + GoodsReceipt flow — it's the
 * express lane for small/local purchases where raising a formal PO would
 * be more overhead than the purchase itself.
 */

/** Generate a unique bill number: P-NNNNNN (sequential, zero-padded) */
async function generateBillNumber(): Promise<string> {
  const last = await prisma.directPurchase.findFirst({
    orderBy: { billNumber: "desc" },
    select: { billNumber: true },
  });
  let nextSeq = 1;
  if (last) {
    const match = last.billNumber?.match(/^P-(\d+)$/);
    if (match?.[1]) nextSeq = parseInt(match[1], 10) + 1;
  }
  return `P-${String(nextSeq).padStart(6, "0")}`;
}

interface CreateDirectPurchaseInput {
  supplierId?: string;
  supplierName: string;
  companyId: string;
  locationId: string;
  billDate?: Date;
  notes?: string;
  createdById?: string;
  // Vehicle — how the goods were brought from the local market
  vehicleNumber?: string;
  vehicleType?: string;
  vehiclePhotoUrl?: string;
  driverName?: string;
  driverPhone?: string;
  lines?: {
    materialId: string;
    qty: Decimal | number | string;
    unitCost: Decimal | number | string;
    gstRate?: Decimal | number | string;
  }[];
}

export async function createDirectPurchase(input: CreateDirectPurchaseInput) {
  // Validate company
  const company = await prisma.company.findFirst({ where: { id: input.companyId, deletedAt: null } });
  if (!company) throw new ServiceError("Company not found", 404);

  // Validate location
  const location = await prisma.stockLocation.findFirst({
    where: { id: input.locationId, deletedAt: null, companyId: input.companyId },
  });
  if (!location) throw new ServiceError("Receive location not found or doesn't belong to this company", 404);

  // Validate supplier if provided
  if (input.supplierId) {
    const supplier = await prisma.supplier.findUnique({ where: { id: input.supplierId } });
    if (!supplier) throw new ServiceError("Supplier not found", 404);
  }

  // Validate lines
  if (input.lines && input.lines.length > 0) {
    const materialIds = input.lines.map((l) => l.materialId);
    const materials = await prisma.material.findMany({
      where: { id: { in: materialIds }, deletedAt: null },
    });
    if (materials.length !== materialIds.length) {
      throw new ServiceError("One or more materials not found or deleted", 404);
    }
    for (const line of input.lines) {
      if (!new Decimal(line.qty).gt(0)) throw new ServiceError("Line qty must be > 0");
      if (!new Decimal(line.unitCost).gte(0)) throw new ServiceError("Line unit cost must be >= 0");
    }
  }

  const billNumber = await generateBillNumber();

  // If there are lines that receive stock, use the stock transaction wrapper
  const hasStockLines = input.lines && input.lines.length > 0;

  if (hasStockLines) {
    return withStockTransaction(async (tx) => {
      let subtotal = new Decimal(0);
      let gstTotal = new Decimal(0);
      const lineData: { materialId: string; qty: Decimal; unitCost: Decimal; gstRate: Decimal; lineTotal: Decimal }[] = [];

      for (const line of input.lines!) {
        const qty = new Decimal(line.qty);
        const unitCost = new Decimal(line.unitCost);
        const gstRate = line.gstRate ? new Decimal(line.gstRate) : new Decimal(0);
        const lineSubtotal = qty.times(unitCost);
        const gstAmount = lineSubtotal.times(gstRate).div(100);
        const lineTotal = lineSubtotal.plus(gstAmount);

        subtotal = subtotal.plus(lineSubtotal);
        gstTotal = gstTotal.plus(gstAmount);

        // Receive stock: record a PURCHASE_RECEIPT movement (adds qty, updates MAC)
        await recordMovement(tx, {
          materialId: line.materialId,
          movementType: "PURCHASE_RECEIPT",
          toLocationId: input.locationId,
          qty,
          unitCost,
          refType: "DIRECT_PURCHASE",
          userId: input.createdById,
        });

        lineData.push({ materialId: line.materialId, qty, unitCost, gstRate, lineTotal });
      }

      const roundOff = new Decimal(0); // direct purchases don't typically have round-off
      const billAmount = subtotal.plus(gstTotal).plus(roundOff);

      const purchase = await tx.directPurchase.create({
        data: {
          billNumber,
          supplierId: input.supplierId,
          supplierName: input.supplierName,
          companyId: input.companyId,
          locationId: input.locationId,
          billDate: input.billDate ?? new Date(),
          notes: input.notes,
          createdById: input.createdById,
          vehicleNumber: input.vehicleNumber,
          vehicleType: input.vehicleType,
          vehiclePhotoUrl: input.vehiclePhotoUrl,
          driverName: input.driverName,
          driverPhone: input.driverPhone,
          subtotal,
          gstTotal,
          roundOff,
          billAmount,
          lines: {
            create: lineData.map((l) => ({
              materialId: l.materialId,
              qty: l.qty,
              unitCost: l.unitCost,
              gstRate: l.gstRate,
              lineTotal: l.lineTotal,
            })),
          },
        },
        include: { lines: true },
      });

      // Post to the General Ledger: capitalise inventory + recognise input GST + credit AP.
      await postDirectPurchase(tx, {
        companyId: input.companyId,
        directPurchaseId: purchase.id,
        postedById: input.createdById,
        lines: lineData.map((l) => ({ qty: l.qty, unitCost: l.unitCost, gstRate: l.gstRate })),
      });

      if (input.createdById) {
        await logAction(tx, {
          userId: input.createdById,
          action: "DIRECT_PURCHASE_CREATE",
          entityType: "DirectPurchase",
          entityId: purchase.id,
          after: { billNumber, supplierName: input.supplierName, billAmount },
        });
      }

      return { purchase, billNumber, billAmount };
    });
  }

  // No stock lines — just a log entry (e.g. a service purchase with no material)
  const billAmount = new Decimal(0);
  const purchase = await prisma.$transaction(async (tx) => {
    const dp = await tx.directPurchase.create({
      data: {
        billNumber,
        supplierId: input.supplierId,
        supplierName: input.supplierName,
        companyId: input.companyId,
        locationId: input.locationId,
        billDate: input.billDate ?? new Date(),
        notes: input.notes,
        createdById: input.createdById,
        vehicleNumber: input.vehicleNumber,
        vehicleType: input.vehicleType,
        vehiclePhotoUrl: input.vehiclePhotoUrl,
        driverName: input.driverName,
        driverPhone: input.driverPhone,
        subtotal: new Decimal(0),
        gstTotal: new Decimal(0),
        roundOff: new Decimal(0),
        billAmount,
      },
      include: { lines: true },
    });

    if (input.createdById) {
      await logAction(tx, {
        userId: input.createdById,
        action: "DIRECT_PURCHASE_CREATE",
        entityType: "DirectPurchase",
        entityId: dp.id,
        after: { billNumber, supplierName: input.supplierName, billAmount },
      });
    }
    return dp;
  });

  return { purchase, billNumber, billAmount };
}

export async function listDirectPurchases(opts: {
  companyId: string;
  from?: Date;
  to?: Date;
  supplierId?: string;
}) {
  const where: {
    companyId: string;
    billDate?: { gte?: Date; lte?: Date };
    supplierId?: string;
  } = { companyId: opts.companyId };
  if (opts.from || opts.to) {
    where.billDate = {};
    if (opts.from) where.billDate.gte = opts.from;
    if (opts.to) {
      const end = new Date(opts.to);
      end.setHours(23, 59, 59, 999);
      where.billDate.lte = end;
    }
  }
  if (opts.supplierId) where.supplierId = opts.supplierId;

  return prisma.directPurchase.findMany({
    where,
    include: {
      supplier: { select: { id: true, name: true, phone: true } },
      location: { select: { id: true, name: true } },
      lines: {
        include: {
          material: { select: { id: true, code: true, name: true, unit: true } },
        },
      },
    },
    orderBy: { billDate: "desc" },
  });
}

/** Cancel a direct purchase — reverse stock (if lines existed) and GL entries. */
export async function cancelDirectPurchase(id: string, userId?: string) {
  return withStockTransaction(async (tx) => {
    const dp = await tx.directPurchase.findFirst({
      where: { id },
      include: { lines: true },
    });
    if (!dp) throw new ServiceError("Direct purchase not found", 404);
    if (dp.status === "CANCELLED") throw new ServiceError("Direct purchase is already cancelled");

    // Reverse stock: remove the received materials (ADJUSTMENT_OUT at original cost)
    for (const line of dp.lines) {
      await recordMovement(tx, {
        materialId: line.materialId,
        movementType: "ADJUSTMENT_OUT",
        fromLocationId: dp.locationId,
        qty: line.qty,
        unitCost: line.unitCost,
        reason: `Reversal of direct purchase ${dp.billNumber}`,
        refType: "DIRECT_PURCHASE",
        refId: dp.id,
        userId,
        companyId: dp.companyId,
      });
    }

    // Refresh MAC for affected materials
    const affectedMaterials = dp.lines.map((l) => l.materialId);
    if (affectedMaterials.length > 0) {
      await refreshMaterialCurrentCost(tx, affectedMaterials);
    }

    // Reverse GL entries
    const journalEntries = await tx.journalEntry.findMany({
      where: { sourceId: dp.id, sourceType: "DIRECT_PURCHASE" },
    });
    for (const je of journalEntries) {
      await reverseJournalEntry(tx, je.id, { postedById: userId, memo: `Reversal of ${je.memo}` });
    }

    const updated = await tx.directPurchase.update({
      where: { id: dp.id },
      data: {
        status: "CANCELLED",
        cancelledAt: new Date(),
        cancelledById: userId ?? null,
      },
    });

    if (userId) {
      await logAction(tx, {
        userId,
        companyId: dp.companyId,
        action: "DIRECT_PURCHASE_CANCEL",
        entityType: "DirectPurchase",
        entityId: dp.id,
        before: { status: "COMPLETED" },
        after: { status: "CANCELLED" },
      });
    }

    return updated;
  });
}
