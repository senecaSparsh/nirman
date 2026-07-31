import { prisma, type Prisma, type ProcurementScope, type PurchaseOrderStatus } from "@nirman/db";
import Decimal from "decimal.js";
import { recordMovement, withStockTransaction, refreshMaterialCurrentCost } from "./stock-ledger";
import { reallocateProjectCosts } from "./valuation";
import { logAction } from "./audit";

/**
 * Procurement Service — Purchase Order lifecycle.
 *
 * Flows:
 *   createPurchaseOrder → approvePurchaseOrder → orderPurchaseOrder → receiveGoods
 *   cancelPurchaseOrder (from DRAFT or APPROVED only)
 *
 * Scope validation:
 *   COMPANY  → destinationLocation must be COMPANY_WAREHOUSE, projectId null
 *   PROJECT  → destinationLocation must be PROJECT_SITE, projectId set + matching
 */

interface CreatePOInput {
  supplierId: string;
  procurementScope: ProcurementScope;
  companyId: string;
  projectId?: string;
  destinationLocationId: string;
  expectedDate?: Date;
  notes?: string;
  createdById?: string;
  lines: {
    materialId: string;
    qtyOrdered: Decimal | number | string;
    unitCost: Decimal | number | string;
    gstRate?: Decimal | number | string;
  }[];
}

function generatePoNumber(): string {
  const d = new Date();
  const ymd = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
  const rand = String(Math.floor(Math.random() * 10000)).padStart(4, "0");
  return `PO-${ymd}-${rand}`;
}

export async function createPurchaseOrder(input: CreatePOInput) {
  return prisma.$transaction(async (tx) => createPurchaseOrderTx(tx, input));
}

/** Internal: creates a PO within a caller-provided transaction. */
export async function createPurchaseOrderTx(tx: Prisma.TransactionClient, input: CreatePOInput) {
    // 1. Validate scope + destination location
    const location = await tx.stockLocation.findFirst({
      where: { id: input.destinationLocationId, deletedAt: null },
    });
    if (!location) throw new Error("Destination location not found or deleted");

    if (input.procurementScope === "COMPANY") {
      if (location.type !== "COMPANY_WAREHOUSE") {
        throw new Error("COMPANY-scope PO must destination a COMPANY_WAREHOUSE location");
      }
      if (input.projectId) {
        throw new Error("COMPANY-scope PO must not have a projectId");
      }
    } else {
      if (location.type !== "PROJECT_SITE") {
        throw new Error("PROJECT-scope PO must destination a PROJECT_SITE location");
      }
      if (!input.projectId) {
        throw new Error("PROJECT-scope PO requires a projectId");
      }
      if (location.projectId !== input.projectId) {
        throw new Error("PROJECT-scope PO destination location must belong to the specified project");
      }
    }

    if (location.companyId !== input.companyId) {
      throw new Error("Destination location does not belong to this company");
    }

    // 2. Validate supplier
    const supplier = await tx.supplier.findFirst({
      where: { id: input.supplierId, deletedAt: null },
    });
    if (!supplier) throw new Error("Supplier not found or deleted");

    // 3. Validate lines + materials
    if (input.lines.length === 0) throw new Error("PO must have at least one line");
    const materialIds = input.lines.map((l) => l.materialId);
    const materials = await tx.material.findMany({
      where: { id: { in: materialIds }, deletedAt: null },
    });
    if (materials.length !== materialIds.length) {
      throw new Error("One or more materials not found or deleted");
    }

    for (const line of input.lines) {
      const qty = new Decimal(line.qtyOrdered);
      const cost = new Decimal(line.unitCost);
      if (!qty.gt(0)) throw new Error(`qtyOrdered must be > 0 for material ${line.materialId}`);
      if (cost.lt(0)) throw new Error(`unitCost must be >= 0 for material ${line.materialId}`);
    }

    // 4. Compute totals
    let subtotal = new Decimal(0);
    let gstTotal = new Decimal(0);
    const lineData = input.lines.map((l) => {
      const qty = new Decimal(l.qtyOrdered);
      const cost = new Decimal(l.unitCost);
      const gstRate = new Decimal(l.gstRate ?? 0);
      const lineSubtotal = qty.times(cost);
      const lineGst = lineSubtotal.times(gstRate).div(100);
      const lineTotal = lineSubtotal.plus(lineGst);
      subtotal = subtotal.plus(lineSubtotal);
      gstTotal = gstTotal.plus(lineGst);
      return {
        materialId: l.materialId,
        qtyOrdered: qty,
        unitCost: cost,
        gstRate,
        lineTotal,
      };
    });

    // 5. Create PO
    const po = await tx.purchaseOrder.create({
      data: {
        poNumber: generatePoNumber(),
        supplierId: input.supplierId,
        procurementScope: input.procurementScope,
        companyId: input.companyId,
        projectId: input.projectId ?? null,
        destinationLocationId: input.destinationLocationId,
        status: "DRAFT",
        expectedDate: input.expectedDate,
        subtotal,
        gstTotal,
        total: subtotal.plus(gstTotal),
        notes: input.notes,
        createdById: input.createdById,
        lines: {
          create: lineData.map((l) => ({
            materialId: l.materialId,
            qtyOrdered: l.qtyOrdered,
            unitCost: l.unitCost,
            gstRate: l.gstRate,
            lineTotal: l.lineTotal,
          })),
        },
      },
      include: { lines: true },
    });

    await logAction(tx, {
      userId: input.createdById,
      action: "PURCHASE_ORDER_CREATE",
      entityType: "PurchaseOrder",
      entityId: po.id,
      after: { poNumber: po.poNumber, status: po.status, total: po.total },
    });

    return po;
}

export async function approvePurchaseOrder(poId: string, approvedById?: string, approvalNotes?: string) {
  return prisma.$transaction(async (tx) => {
    const po = await tx.purchaseOrder.findUnique({ where: { id: poId } });
    if (!po) throw new Error("PO not found");
    if (po.status !== "DRAFT") throw new Error(`Cannot approve PO in status ${po.status}`);
    const updated = await tx.purchaseOrder.update({
      where: { id: poId },
      data: {
        status: "APPROVED",
        approvedById,
        approvedAt: new Date(),
        approvalNotes,
      },
    });
    await logAction(tx, {
      userId: approvedById,
      action: "PURCHASE_ORDER_APPROVE",
      entityType: "PurchaseOrder",
      entityId: poId,
      before: { status: po.status },
      after: { status: "APPROVED", approvedAt: updated.approvedAt },
    });
    return updated;
  });
}

export async function orderPurchaseOrder(poId: string, userId?: string) {
  return prisma.$transaction(async (tx) => {
    const po = await tx.purchaseOrder.findUnique({ where: { id: poId } });
    if (!po) throw new Error("PO not found");
    if (po.status !== "APPROVED") throw new Error(`Cannot order PO in status ${po.status}`);
    const updated = await tx.purchaseOrder.update({
      where: { id: poId },
      data: { status: "ORDERED", orderDate: new Date() },
    });
    await logAction(tx, {
      userId,
      action: "PURCHASE_ORDER_ORDER",
      entityType: "PurchaseOrder",
      entityId: poId,
      before: { status: po.status },
      after: { status: "ORDERED" },
    });
    return updated;
  });
}

export async function cancelPurchaseOrder(poId: string, userId?: string) {
  return prisma.$transaction(async (tx) => {
    const po = await tx.purchaseOrder.findUnique({
      where: { id: poId },
      include: { lines: { select: { qtyReceived: true } } },
    });
    if (!po) throw new Error("PO not found");
    if (po.status === "CANCELLED") throw new Error("PO already cancelled");
    if (po.status === "RECEIVED") throw new Error("Cannot cancel a fully received PO");
    // If any goods received (PARTIAL), can't cancel — goods are in stock
    const totalReceived = po.lines.reduce(
      (sum, l) => sum.plus(new Decimal(l.qtyReceived)),
      new Decimal(0),
    );
    if (totalReceived.gt(0)) {
      throw new Error("Cannot cancel PO with received goods — received stock is real. Use a stock adjustment instead.");
    }
    const updated = await tx.purchaseOrder.update({ where: { id: poId }, data: { status: "CANCELLED" } });
    await logAction(tx, {
      userId,
      action: "PURCHASE_ORDER_CANCEL",
      entityType: "PurchaseOrder",
      entityId: poId,
      before: { status: po.status },
      after: { status: "CANCELLED" },
    });
    return updated;
  });
}

interface ReceiveGoodsInput {
  purchaseOrderId: string;
  locationId: string; // must match PO.destinationLocationId
  receivedById?: string;
  notes?: string;
  lines: {
    purchaseOrderLineId: string;
    materialId: string;
    qtyReceived: Decimal | number | string;
    unitCost: Decimal | number | string; // actual invoice cost (may differ from PO)
  }[];
}

export async function receiveGoods(input: ReceiveGoodsInput) {
  return withStockTransaction(async (tx) => {
    const po = await tx.purchaseOrder.findUnique({
      where: { id: input.purchaseOrderId },
      include: { lines: true },
    });
    if (!po) throw new Error("PO not found");
    if (po.status !== "ORDERED" && po.status !== "PARTIAL") {
      throw new Error(`Cannot receive goods against PO in status ${po.status}`);
    }
    if (input.locationId !== po.destinationLocationId) {
      throw new Error("Receipt location must match PO destination location");
    }

    // Process each receipt line
    for (const line of input.lines) {
      const poLine = po.lines.find((l) => l.id === line.purchaseOrderLineId);
      if (!poLine) throw new Error(`PO line ${line.purchaseOrderLineId} not found`);

      const recvQty = new Decimal(line.qtyReceived);
      const recvCost = new Decimal(line.unitCost);

      if (!recvQty.gt(0)) throw new Error("qtyReceived must be > 0");
      if (recvCost.lt(0)) throw new Error("unitCost must be >= 0");

      const existingReceived = new Decimal(poLine.qtyReceived);
      const cumulative = existingReceived.plus(recvQty);
      if (cumulative.gt(new Decimal(poLine.qtyOrdered))) {
        throw new Error(
          `Over-delivery: cumulative ${cumulative} > ordered ${poLine.qtyOrdered} for line ${line.purchaseOrderLineId}`,
        );
      }

      // 1. Create GoodsReceiptLine (GoodsReceipt header created once below)
      // 2. Record stock movement (PURCHASE_RECEIPT) — updates StockLocationItem + MAC
      await recordMovement(tx, {
        materialId: line.materialId,
        movementType: "PURCHASE_RECEIPT",
        toLocationId: input.locationId,
        qty: recvQty,
        unitCost: recvCost,
        refType: "PURCHASE_ORDER",
        refId: input.purchaseOrderId,
        userId: input.receivedById,
      });

      // 3. Update PO line qtyReceived
      await tx.purchaseOrderLine.update({
        where: { id: line.purchaseOrderLineId },
        data: { qtyReceived: cumulative },
      });
    }

    // Create GoodsReceipt + lines (audit record)
    const goodsReceipt = await tx.goodsReceipt.create({
      data: {
        purchaseOrderId: input.purchaseOrderId,
        locationId: input.locationId,
        receivedById: input.receivedById,
        notes: input.notes,
        lines: {
          create: input.lines.map((l) => ({
            purchaseOrderLineId: l.purchaseOrderLineId,
            materialId: l.materialId,
            qtyReceived: new Decimal(l.qtyReceived),
            unitCost: new Decimal(l.unitCost),
          })),
        },
      },
    });

    // 4. Recompute PO status
    const refreshedLines = await tx.purchaseOrderLine.findMany({
      where: { purchaseOrderId: input.purchaseOrderId },
    });
    const allReceived = refreshedLines.every(
      (l) => new Decimal(l.qtyReceived).gte(new Decimal(l.qtyOrdered)),
    );
    const anyReceived = refreshedLines.some((l) => new Decimal(l.qtyReceived).gt(0));
    const newStatus: PurchaseOrderStatus = allReceived ? "RECEIVED" : anyReceived ? "PARTIAL" : po.status;

    await tx.purchaseOrder.update({
      where: { id: input.purchaseOrderId },
      data: { status: newStatus },
    });

    // 5. Refresh Material.currentCost (weighted average of all location MACs)
    await refreshMaterialCurrentCost(tx, input.lines.map((l) => l.materialId));

    return { goodsReceipt, newStatus };
  });
}
