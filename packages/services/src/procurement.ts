import { prisma, type Prisma, type ProcurementScope, type PurchaseOrderStatus } from "@nirman/db";
import Decimal from "decimal.js";
import { recordMovement, withStockTransaction, refreshMaterialCurrentCost } from "./stock-ledger";
import { reallocateProjectCosts } from "./valuation";
import { logAction } from "./audit";
import { postPurchaseReceipt } from "./gl-posting";
import { getApprovalRouting } from "./procurement-advanced";
import { ServiceError } from "./errors";
import { emitNotificationEvent, NotificationEventType } from "./notification-event-bus";
import { autoSyncEntryToTally } from "./auto-sync";

/** Role hierarchy for value-based approval routing (higher index = more authority). */
const ROLE_RANK: Record<string, number> = {
  SUPERVISOR: 0,
  SALES: 0,
  ACCOUNTANT: 0,
  MANAGER: 1,
  ADMIN: 2,
  OWNER: 3,
};

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

async function generatePoNumber(tx: Prisma.TransactionClient): Promise<string> {
  const d = new Date();
  const ymd = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
  const prefix = `PO-${ymd}-`;
  const count = await tx.purchaseOrder.count({ where: { poNumber: { startsWith: prefix } } });
  return `${prefix}${String(count + 1).padStart(4, "0")}`;
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
    if (!location) throw new ServiceError("Destination location not found or deleted", 404);

    if (input.procurementScope === "COMPANY") {
      if (location.type !== "COMPANY_WAREHOUSE") {
        throw new ServiceError("COMPANY-scope PO must destination a COMPANY_WAREHOUSE location");
      }
      if (input.projectId) {
        throw new ServiceError("COMPANY-scope PO must not have a projectId");
      }
    } else {
      if (location.type !== "PROJECT_SITE") {
        throw new ServiceError("PROJECT-scope PO must destination a PROJECT_SITE location");
      }
      if (!input.projectId) {
        throw new ServiceError("PROJECT-scope PO requires a projectId");
      }
      if (location.projectId !== input.projectId) {
        throw new ServiceError("PROJECT-scope PO destination location must belong to the specified project");
      }
    }

    if (location.companyId !== input.companyId) {
      throw new ServiceError("Destination location does not belong to this company");
    }

    // 2. Validate supplier
    const supplier = await tx.supplier.findFirst({
      where: { id: input.supplierId, companyId: input.companyId, deletedAt: null },
    });
    if (!supplier) throw new ServiceError("Supplier not found or deleted", 404);

    // 3. Validate lines + materials
    if (input.lines.length === 0) throw new ServiceError("PO must have at least one line");
    const materialIds = input.lines.map((l) => l.materialId);
    const materials = await tx.material.findMany({
      where: { id: { in: materialIds }, deletedAt: null },
    });
    if (materials.length !== materialIds.length) {
      throw new ServiceError("One or more materials not found or deleted", 404);
    }

    for (const line of input.lines) {
      const qty = new Decimal(line.qtyOrdered);
      const cost = new Decimal(line.unitCost);
      if (!qty.gt(0)) throw new ServiceError(`qtyOrdered must be > 0 for material ${line.materialId}`);
      if (cost.lt(0)) throw new ServiceError(`unitCost must be >= 0 for material ${line.materialId}`);
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
        poNumber: await generatePoNumber(tx),
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
      companyId: po.companyId,
      action: "PURCHASE_ORDER_CREATE",
      entityType: "PurchaseOrder",
      entityId: po.id,
      after: { poNumber: po.poNumber, status: po.status, total: po.total },
    });

    return po;
}

export async function approvePurchaseOrder(
  poId: string,
  approverRole: string,
  approvedById?: string,
  approvalNotes?: string,
) {
  const result = await prisma.$transaction(async (tx) => {
    const po = await tx.purchaseOrder.findUnique({ where: { id: poId } });
    if (!po) throw new ServiceError("PO not found", 404);
    if (po.status !== "DRAFT") throw new ServiceError(`Cannot approve PO in status ${po.status}`);

    // Enforce value-based approval routing: check the approver's role is
    // sufficient for the PO's total value. OWNER/ADMIN always pass (superusers).
    // approverRole is REQUIRED — callers must always pass it so the routing
    // check cannot be bypassed by omitting the parameter.
    if (approverRole !== "OWNER" && approverRole !== "ADMIN") {
      const routing = await getApprovalRouting(po.total, po.companyId);
      const approverRank = ROLE_RANK[approverRole] ?? 0;
      const requiredRank = ROLE_RANK[routing.requiredRole] ?? 0;
      if (approverRank < requiredRank) {
        throw new ServiceError(
          `This PO (${new Decimal(po.total).toFixed(0)}) requires ${routing.requiredRole} approval. ${routing.reason}`,
          403,
        );
      }
    }

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
      companyId: po.companyId,
      action: "PURCHASE_ORDER_APPROVE",
      entityType: "PurchaseOrder",
      entityId: poId,
      before: { status: po.status },
      after: { status: "APPROVED", approvedAt: updated.approvedAt },
    });
    return { updated, po };
  });

  // Emit notification (best-effort, outside the transaction)
  void emitNotificationEvent({
    eventType: NotificationEventType.PO_APPROVED,
    companyId: result.po.companyId,
    entityType: "PurchaseOrder",
    entityId: poId,
    variables: {
      poNumber: result.updated.poNumber ?? poId,
      total: new Decimal(result.updated.total).toFixed(2),
    },
    timestamp: new Date(),
  });

  return result.updated;
}

export async function orderPurchaseOrder(poId: string, userId?: string) {
  const result = await prisma.$transaction(async (tx) => {
    const po = await tx.purchaseOrder.findUnique({ where: { id: poId } });
    if (!po) throw new ServiceError("PO not found", 404);
    if (po.status !== "APPROVED") throw new ServiceError(`Cannot order PO in status ${po.status}`);
    const updated = await tx.purchaseOrder.update({
      where: { id: poId },
      data: { status: "ORDERED", orderDate: new Date() },
    });
    await logAction(tx, {
      userId,
      companyId: po.companyId,
      action: "PURCHASE_ORDER_ORDER",
      entityType: "PurchaseOrder",
      entityId: poId,
      before: { status: po.status },
      after: { status: "ORDERED" },
    });
    return { updated, po };
  });

  void emitNotificationEvent({
    eventType: NotificationEventType.PO_ORDERED,
    companyId: result.po.companyId,
    entityType: "PurchaseOrder",
    entityId: poId,
    variables: {
      poNumber: result.updated.poNumber ?? poId,
    },
    timestamp: new Date(),
  });

  return result.updated;
}

export async function cancelPurchaseOrder(poId: string, userId?: string) {
  return prisma.$transaction(async (tx) => {
    const po = await tx.purchaseOrder.findUnique({
      where: { id: poId },
      include: { lines: { select: { qtyReceived: true } } },
    });
    if (!po) throw new ServiceError("PO not found", 404);
    if (po.status === "CANCELLED") throw new ServiceError("PO already cancelled");
    if (po.status === "RECEIVED") throw new ServiceError("Cannot cancel a fully received PO");
    // If any goods received (PARTIAL), can't cancel — goods are in stock
    const totalReceived = po.lines.reduce(
      (sum, l) => sum.plus(new Decimal(l.qtyReceived)),
      new Decimal(0),
    );
    if (totalReceived.gt(0)) {
      throw new ServiceError("Cannot cancel PO with received goods — received stock is real. Use a stock adjustment instead.");
    }
    const updated = await tx.purchaseOrder.update({ where: { id: poId }, data: { status: "CANCELLED" } });
    await logAction(tx, {
      userId,
      companyId: po.companyId,
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
  const result = await withStockTransaction(async (tx) => {
    const po = await tx.purchaseOrder.findUnique({
      where: { id: input.purchaseOrderId },
      include: { lines: true },
    });
    if (!po) throw new ServiceError("PO not found", 404);
    if (po.status !== "ORDERED" && po.status !== "PARTIAL") {
      throw new ServiceError(`Cannot receive goods against PO in status ${po.status}`);
    }
    if (input.locationId !== po.destinationLocationId) {
      throw new ServiceError("Receipt location must match PO destination location");
    }

    // Enforce procurement scope: COMPANY POs → COMPANY_WAREHOUSE, PROJECT POs → PROJECT_SITE.
    const destLocation = await tx.stockLocation.findFirst({
      where: { id: po.destinationLocationId, deletedAt: null },
      select: { type: true },
    });
    if (destLocation) {
      if (po.procurementScope === "COMPANY" && destLocation.type !== "COMPANY_WAREHOUSE") {
        throw new ServiceError("COMPANY-scope PO must be received into a COMPANY_WAREHOUSE location");
      }
      if (po.procurementScope === "PROJECT" && destLocation.type !== "PROJECT_SITE") {
        throw new ServiceError("PROJECT-scope PO must be received into a PROJECT_SITE location");
      }
    }

    // Process each receipt line
    for (const line of input.lines) {
      const poLine = po.lines.find((l) => l.id === line.purchaseOrderLineId);
      if (!poLine) throw new ServiceError(`PO line ${line.purchaseOrderLineId} not found`, 404);

      const recvQty = new Decimal(line.qtyReceived);
      const recvCost = new Decimal(line.unitCost);

      if (!recvQty.gt(0)) throw new ServiceError("qtyReceived must be > 0");
      if (recvCost.lt(0)) throw new ServiceError("unitCost must be >= 0");

      const existingReceived = new Decimal(poLine.qtyReceived);
      const cumulative = existingReceived.plus(recvQty);
      if (cumulative.gt(new Decimal(poLine.qtyOrdered))) {
        throw new ServiceError(
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

    // 6. Post the receipt to the General Ledger (inventory + input GST + AP).
    //    Uses each PO line's gstRate to compute the recoverable input tax.
    let receiptSubtotal = new Decimal(0);
    let receiptGst = new Decimal(0);
    const receiptLines = input.lines.map((l) => {
      const poLine = po.lines.find((pl) => pl.id === l.purchaseOrderLineId)!;
      const qty = new Decimal(l.qtyReceived);
      const unitCost = new Decimal(l.unitCost);
      const gstRate = new Decimal(poLine.gstRate);
      const lineSubtotal = qty.times(unitCost);
      const lineGst = lineSubtotal.times(gstRate).div(100);
      receiptSubtotal = receiptSubtotal.plus(lineSubtotal);
      receiptGst = receiptGst.plus(lineGst);
      return { materialId: l.materialId, qty, unitCost, gstRate };
    });
    await postPurchaseReceipt(tx, {
      companyId: po.companyId,
      purchaseOrderId: input.purchaseOrderId,
      goodsReceiptId: goodsReceipt.id,
      postedById: input.receivedById,
      lines: receiptLines,
    });

    // 7. Increment Supplier.balanceOwed by the total invoice amount (subtotal + GST).
    //    This mirrors the Cr AP posted above and keeps balanceOwed in sync —
    //    createSupplierPayment decrements it on payment.
    const receiptTotal = receiptSubtotal.plus(receiptGst);
    const supplier = await tx.supplier.findUnique({ where: { id: po.supplierId } });
    if (supplier) {
      const newBalance = new Decimal(supplier.balanceOwed).plus(receiptTotal);
      await tx.supplier.update({
        where: { id: po.supplierId },
        data: { balanceOwed: newBalance },
      });
    }

    return { goodsReceipt, newStatus, po };
  });

  // Emit notification (best-effort, outside the transaction)
  void emitNotificationEvent({
    eventType: NotificationEventType.GOODS_RECEIVED,
    companyId: result.po.companyId,
    entityType: "PurchaseOrder",
    entityId: input.purchaseOrderId,
    variables: {
      poNumber: result.po.poNumber ?? input.purchaseOrderId,
      receiptId: result.goodsReceipt.id,
    },
    timestamp: new Date(),
  });

  // Auto-sync to Tally (best-effort, outside the transaction)
  // Find the journal entry posted for this goods receipt
  void (async () => {
    try {
      const je = await prisma.journalEntry.findFirst({
        where: { sourceId: result.goodsReceipt.id, sourceType: "PO_RECEIPT" },
        select: { id: true },
      });
      if (je) await autoSyncEntryToTally(result.po.companyId, je.id);
    } catch { /* best-effort */ }
  })();

  return { goodsReceipt: result.goodsReceipt, newStatus: result.newStatus };
}
