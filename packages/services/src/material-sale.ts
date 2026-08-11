import { prisma, type Prisma } from "@nirman/db";
import Decimal from "decimal.js";
import { recordMovement, refreshMaterialCurrentCost } from "./stock-ledger";
import { postMaterialSale, reverseJournalEntry } from "./gl-posting";
import { reallocateProjectCosts } from "./valuation";
import { logAction } from "./audit";
import { ServiceError } from "./errors";
import { autoSyncEntryToTally } from "./auto-sync";

/**
 * Material Sale Service — sell raw materials / stock items to customers.
 *
 * Unlike asset sales (which sell land parcels or built units), material sales
 * sell inventory items from a stock location. Each sale can have multiple line
 * items (different materials from the same or different locations).
 *
 * Invariants enforced:
 * - Each line must have sufficient stock at the specified location
 * - Stock is relieved via a SALE StockMovement (MAC is preserved as unitCost)
 * - GL posts: AR (receivable) + Sales Revenue + Output GST + COGS + Inventory relief
 * - All happens inside one Serializable transaction — stock, sale, and GL never diverge
 */

async function generateMaterialSaleNumber(tx: Prisma.TransactionClient): Promise<string> {
  const d = new Date();
  const ymd = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
  const prefix = `MS-${ymd}-`;
  const count = await tx.materialSale.count({ where: { saleNumber: { startsWith: prefix } } });
  return `${prefix}${String(count + 1).padStart(4, "0")}`;
}

export interface MaterialSaleLineInput {
  materialId: string;
  locationId: string;
  qty: Decimal | number | string;
  unitPrice: Decimal | number | string;
  gstRate?: Decimal | number | string; // GST % on this line (e.g. 5, 12, 18). Default 0.
}

export interface CreateMaterialSaleInput {
  companyId: string;
  customerId: string;
  projectId?: string;
  lines: MaterialSaleLineInput[];
  paymentMode?: string;
  notes?: string;
  userId?: string;
  roundOff?: Decimal | number | string; // rounding adjustment
  partyName?: string; // override party name on invoice (for walk-in customers)
}

export async function createMaterialSale(input: CreateMaterialSaleInput) {
  if (input.lines.length === 0) throw new ServiceError("At least one line item is required");

  const sale = await prisma.$transaction(async (tx) => {
    // Validate customer
    const customer = await tx.customer.findFirst({
      where: { id: input.customerId, companyId: input.companyId, deletedAt: null },
    });
    if (!customer) throw new ServiceError("Customer not found or deleted", 404);

    // Validate project if provided
    if (input.projectId) {
      const project = await tx.project.findFirst({
        where: { id: input.projectId, companyId: input.companyId, deletedAt: null },
      });
      if (!project) throw new ServiceError("Project not found or does not belong to this company", 404);
    }

    let subtotal = new Decimal(0);
    let gstTotal = new Decimal(0);
    let totalCost = new Decimal(0);
    let scrapSubtotal = new Decimal(0);

    // Pre-validate all lines (check stock availability) before making any changes
    const validatedLines: {
      materialId: string;
      locationId: string;
      qty: Decimal;
      unitPrice: Decimal;
      gstRate: Decimal;
      gstAmount: Decimal;
      lineTotal: Decimal;
      unitCost: Decimal; // MAC at time of sale
      isScrap: boolean;
    }[] = [];

    for (const line of input.lines) {
      const qty = new Decimal(line.qty);
      if (!qty.gt(0)) throw new ServiceError("Quantity must be > 0");

      const unitPrice = new Decimal(line.unitPrice);
      if (!unitPrice.gt(0)) throw new ServiceError("Unit price must be > 0");

      const gstRate = line.gstRate ? new Decimal(line.gstRate) : new Decimal(0);
      if (gstRate.lt(0) || gstRate.gt(100)) throw new ServiceError("gstRate must be between 0 and 100");

      // Check stock availability
      const stockItem = await tx.stockLocationItem.findUnique({
        where: {
          locationId_materialId: {
            locationId: line.locationId,
            materialId: line.materialId,
          },
        },
      });
      if (!stockItem || new Decimal(stockItem.qty).lt(qty)) {
        const available = stockItem ? stockItem.qty.toString() : "0";
        throw new ServiceError(`Insufficient stock for material ${line.materialId} at location ${line.locationId}: requested ${qty}, available ${available}`);
      }

      // Validate location belongs to company
      const location = await tx.stockLocation.findFirst({
        where: { id: line.locationId, companyId: input.companyId, deletedAt: null },
      });
      if (!location) throw new ServiceError(`Stock location ${line.locationId} not found or does not belong to this company`, 404);

      // Validate material exists
      const material = await tx.material.findFirst({
        where: { id: line.materialId, deletedAt: null },
      });
      if (!material) throw new ServiceError(`Material ${line.materialId} not found or deleted`, 404);

      const unitCost = new Decimal(stockItem.movingAvgCost); // MAC at time of sale
      const lineSubtotal = unitPrice.mul(qty).toDecimalPlaces(2);
      const gstAmount = lineSubtotal.mul(gstRate).div(100).toDecimalPlaces(2);
      const lineTotal = lineSubtotal.plus(gstAmount);

      validatedLines.push({
        materialId: line.materialId,
        locationId: line.locationId,
        qty,
        unitPrice,
        gstRate,
        gstAmount,
        lineTotal,
        unitCost,
        isScrap: material.isScrap,
      });

      if (material.isScrap) {
        scrapSubtotal = scrapSubtotal.plus(lineSubtotal);
      }
      subtotal = subtotal.plus(lineSubtotal);
      gstTotal = gstTotal.plus(gstAmount);
      totalCost = totalCost.plus(unitCost.mul(qty));
    }

    subtotal = subtotal.toDecimalPlaces(2);
    gstTotal = gstTotal.toDecimalPlaces(2);
    totalCost = totalCost.toDecimalPlaces(2);
    const roundOff = new Decimal(input.roundOff ?? 0).toDecimalPlaces(2);
    const totalAmount = subtotal.plus(gstTotal).plus(roundOff);
    const grossProfit = subtotal.minus(totalCost);

    // Create the material sale
    const sale = await tx.materialSale.create({
      data: {
        saleNumber: await generateMaterialSaleNumber(tx),
        customerId: input.customerId,
        companyId: input.companyId,
        projectId: input.projectId ?? null,
        subtotal,
        gstTotal,
        roundOff,
        totalAmount,
        totalCost,
        scrapSubtotal,
        grossProfit,
        partyName: input.partyName,
        paymentMode: input.paymentMode,
        notes: input.notes,
        createdById: input.userId,
      },
    });

    // Create line items + relieve stock for each line
    for (const line of validatedLines) {
      await tx.materialSaleLine.create({
        data: {
          materialSaleId: sale.id,
          materialId: line.materialId,
          locationId: line.locationId,
          qty: line.qty,
          unitPrice: line.unitPrice,
          unitCost: line.unitCost,
          gstRate: line.gstRate,
          gstAmount: line.gstAmount,
          lineTotal: line.lineTotal,
        },
      });

      // Relieve stock via SALE movement (updates StockLocationItem + appends StockMovement)
      await recordMovement(tx, {
        materialId: line.materialId,
        movementType: "SALE",
        fromLocationId: line.locationId,
        qty: line.qty,
        reason: `Material sale ${sale.saleNumber}`,
        refType: "MaterialSale",
        refId: sale.id,
        userId: input.userId,
      });
    }

    // Post to the General Ledger
    await postMaterialSale(tx, {
      companyId: input.companyId,
      materialSaleId: sale.id,
      subtotal,
      gstTotal,
      roundOff,
      totalCost,
      scrapSubtotal,
      postedById: input.userId,
    });

    if (input.userId) {
      await logAction(tx, {
        userId: input.userId,
        companyId: input.companyId,
        action: "MATERIAL_SALE_CREATE",
        entityType: "MaterialSale",
        entityId: sale.id,
        after: {
          saleNumber: sale.saleNumber,
          customerId: input.customerId,
          subtotal: subtotal.toString(),
          gstTotal: gstTotal.toString(),
          totalAmount: totalAmount.toString(),
          totalCost: totalCost.toString(),
          grossProfit: grossProfit.toString(),
          lineCount: validatedLines.length,
        },
      });
    }

    // If this is a scrap sale linked to a project, the cost recovery changes
    // the project's per-unit production cost allocation — re-run it.
    if (input.projectId) {
      await reallocateProjectCosts(tx, input.projectId);
    }

    return sale;
  }, { isolationLevel: "Serializable" });

  // Auto-sync to Tally (best-effort, outside the transaction)
  void (async () => {
    try {
      const je = await prisma.journalEntry.findFirst({
        where: { sourceId: sale.id, sourceType: "MATERIAL_SALE" },
        select: { id: true },
      });
      if (je) await autoSyncEntryToTally(input.companyId, je.id);
    } catch { /* best-effort */ }
  })();

  return sale;
}

/** Cancel a material sale — only if no payments have been received. */
export async function cancelMaterialSale(id: string, companyId: string, userId?: string) {
  return prisma.$transaction(async (tx) => {
    const sale = await tx.materialSale.findFirst({
      where: { id, companyId },
      include: { lines: true },
    });
    if (!sale) throw new ServiceError("Material sale not found", 404);
    if (sale.status === "CANCELLED") throw new ServiceError("Sale is already cancelled");

    // Check for existing payments — don't allow cancellation if payments exist
    const paymentCount = await tx.materialSalePayment.count({ where: { saleId: sale.id } });
    if (paymentCount > 0) {
      throw new ServiceError("Cannot cancel a sale with recorded payments. Reverse the payments first.");
    }

    // Reverse the stock movements — put stock back
    for (const line of sale.lines) {
      // Find the original SALE movement and reverse it
      const movement = await tx.stockMovement.findFirst({
        where: {
          refType: "MaterialSale",
          refId: sale.id,
          materialId: line.materialId,
          fromLocationId: line.locationId,
          movementType: "SALE",
        },
      });
      if (movement) {
        // Reverse: put stock back (ADJUSTMENT_IN)
        await recordMovement(tx, {
          materialId: line.materialId,
          movementType: "ADJUSTMENT_IN",
          toLocationId: line.locationId,
          qty: line.qty,
          unitCost: line.unitCost, // restore at original MAC
          reason: `Reversal of material sale ${sale.saleNumber}`,
          refType: "MaterialSale",
          refId: sale.id,
          userId,
        });
      }
    }

    // Refresh MAC for restored materials
    const restoredMaterials = sale.lines.map((l) => l.materialId);
    if (restoredMaterials.length > 0) {
      await refreshMaterialCurrentCost(tx, restoredMaterials);
    }

    // Reverse the GL entries using the standard reversal helper
    const journalEntries = await tx.journalEntry.findMany({
      where: { sourceId: sale.id, sourceType: { in: ["MATERIAL_SALE", "MATERIAL_SALE_COGS"] } },
    });
    for (const je of journalEntries) {
      await reverseJournalEntry(tx, je.id, { postedById: userId, memo: `Reversal of ${je.memo}` });
    }

    const updated = await tx.materialSale.update({
      where: { id: sale.id },
      data: { status: "CANCELLED" },
    });

    // If the cancelled sale was linked to a project, the cost recovery change
    // affects the project's per-unit production cost allocation — re-run it.
    if (sale.projectId) {
      await reallocateProjectCosts(tx, sale.projectId);
    }

    if (userId) {
      await logAction(tx, {
        userId,
        companyId: sale.companyId,
        action: "MATERIAL_SALE_CANCEL",
        entityType: "MaterialSale",
        entityId: sale.id,
        before: { status: sale.status },
        after: { status: "CANCELLED" },
      });
    }

    return updated;
  }, { isolationLevel: "Serializable" });
}
