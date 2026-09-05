import { prisma, type Prisma, type ProcurementScope, type PurchaseOrderStatus } from "@nirman/db";
import Decimal from "decimal.js";
import { recordMovement, withStockTransaction, refreshMaterialCurrentCost } from "./stock-ledger";
import { withSerializableTransaction } from "./transaction";
import { reallocateProjectCosts } from "./valuation";
import { logAction } from "./audit";
import { postPurchaseReceipt } from "./gl-posting";
import { getApprovalRouting } from "./procurement-advanced";
import { ServiceError } from "./errors";
import { emitNotificationEvent, NotificationEventType } from "./notification-event-bus";
import { autoSyncEntryToTally } from "./auto-sync";
import { autoFillHsnGst } from "./material-service";
import { nextSequenceNumber } from "./sequence";

/**
 * Haversine distance between two lat/lng points in metres.
 * Used for geo-fence validation of GPS-tagged receipts.
 */
export function haversineDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000; // Earth radius in metres
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return Math.round(2 * R * Math.asin(Math.sqrt(a)));
}

/** Role hierarchy for value-based approval routing (higher index = more authority). */
const ROLE_RANK: Record<string, number> = {
  SUPERVISOR: 0,
  QAQC_ENGINEER: 0,
  SALES_MANAGER: 0,
  SALES: 0,
  ACCOUNTANT: 0,
  SITE_ENGINEER: 0,
  STORE_KEEPER: 0,
  // Tier 3 — Middle Mgmt: can approve low-value POs (< manager threshold)
  PROJECT_MANAGER: 1,
  PROCUREMENT_MANAGER: 1,
  HR_MANAGER: 1,
  MANAGER: 1, // legacy alias
  // Tier 2 — Senior Mgmt
  PROJECT_DIRECTOR: 2,
  FINANCE_HEAD: 2,
  // Tier 1 — Executive (always pass — superusers)
  ADMIN: 3,
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
  /** Override the initial status (default: DRAFT). Used by quotation approval to create APPROVED POs. */
  initialStatus?: "DRAFT" | "APPROVED";
  /** Who approved the PO (set when initialStatus = APPROVED). */
  approvedById?: string;
  lines: {
    materialId: string;
    qtyOrdered: Decimal | number | string;
    unitCost: Decimal | number | string;
    gstRate?: Decimal | number | string;
    // Per-unit landed-cost components (from VendorQuoteLine)
    freightPerUnit?: Decimal | number | string;
    loadingPerUnit?: Decimal | number | string;
    packingPerUnit?: Decimal | number | string;
    insurancePerUnit?: Decimal | number | string;
    discountPerUnit?: Decimal | number | string;
  }[];
  // Header-level itemized charges (e.g. "Loading", "Fuel Charge", "Transportation")
  charges?: {
    heading: string;
    amount: Decimal | number | string;
    notes?: string;
  }[];
}

async function generatePoNumber(tx: Prisma.TransactionClient): Promise<string> {
  const d = new Date();
  const ymd = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
  const prefix = `PO-${ymd}-`;
  return nextSequenceNumber(tx, prefix, 4);
}

export async function createPurchaseOrder(input: CreatePOInput) {
  return withSerializableTransaction(async (tx) => createPurchaseOrderTx(tx, input));
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

    // 4. Compute totals — line subtotals + GST + per-line landed-cost components
    let subtotal = new Decimal(0);
    let gstTotal = new Decimal(0);
    let freightTotal = new Decimal(0);
    let loadingTotal = new Decimal(0);
    let packingTotal = new Decimal(0);
    let insuranceTotal = new Decimal(0);
    let discountTotal = new Decimal(0);
    const lineData = input.lines.map((l) => {
      const qty = new Decimal(l.qtyOrdered);
      const cost = new Decimal(l.unitCost);
      const gstRate = new Decimal(l.gstRate ?? 0);
      const freightPU = new Decimal(l.freightPerUnit ?? 0);
      const loadingPU = new Decimal(l.loadingPerUnit ?? 0);
      const packingPU = new Decimal(l.packingPerUnit ?? 0);
      const insurancePU = new Decimal(l.insurancePerUnit ?? 0);
      const discountPU = new Decimal(l.discountPerUnit ?? 0);
      const lineSubtotal = qty.times(cost);
      const lineGst = lineSubtotal.times(gstRate).div(100);
      // Per-unit landed cost = (unitCost − discount + packing) × (1 + gst/100) + freight + loading + insurance
      const taxablePU = cost.minus(discountPU).plus(packingPU);
      const unitLandedCost = taxablePU.times(new Decimal(1).plus(gstRate.div(100)))
        .plus(freightPU).plus(loadingPU).plus(insurancePU);
      const lineTotal = qty.times(unitLandedCost);
      subtotal = subtotal.plus(lineSubtotal);
      gstTotal = gstTotal.plus(lineGst);
      freightTotal = freightTotal.plus(freightPU.times(qty));
      loadingTotal = loadingTotal.plus(loadingPU.times(qty));
      packingTotal = packingTotal.plus(packingPU.times(qty));
      insuranceTotal = insuranceTotal.plus(insurancePU.times(qty));
      discountTotal = discountTotal.plus(discountPU.times(qty));
      return {
        materialId: l.materialId,
        qtyOrdered: qty,
        unitCost: cost,
        gstRate,
        freightPerUnit: freightPU,
        loadingPerUnit: loadingPU,
        packingPerUnit: packingPU,
        insurancePerUnit: insurancePU,
        discountPerUnit: discountPU,
        unitLandedCost,
        lineTotal,
      };
    });

    // 4b. Compute misc charges total from itemized charges
    const charges = input.charges ?? [];
    let miscChargesTotal = new Decimal(0);
    for (const c of charges) {
      miscChargesTotal = miscChargesTotal.plus(new Decimal(c.amount));
    }

    // 4c. Grand total = subtotal + GST + freight + loading + packing + insurance + misc − discount
    const grandTotal = subtotal
      .plus(gstTotal)
      .plus(freightTotal)
      .plus(loadingTotal)
      .plus(packingTotal)
      .plus(insuranceTotal)
      .plus(miscChargesTotal)
      .minus(discountTotal);

    // 5. Create PO
    const initialStatus = input.initialStatus ?? "DRAFT";
    const po = await tx.purchaseOrder.create({
      data: {
        poNumber: await generatePoNumber(tx),
        supplierId: input.supplierId,
        procurementScope: input.procurementScope,
        companyId: input.companyId,
        projectId: input.projectId ?? null,
        destinationLocationId: input.destinationLocationId,
        status: initialStatus,
        approvedById: initialStatus === "APPROVED" ? (input.approvedById ?? input.createdById) : null,
        approvedAt: initialStatus === "APPROVED" ? new Date() : null,
        expectedDate: input.expectedDate,
        subtotal,
        gstTotal,
        freightTotal,
        loadingTotal,
        packingTotal,
        insuranceTotal,
        discountTotal,
        miscChargesTotal,
        total: grandTotal,
        notes: input.notes,
        createdById: input.createdById,
        lines: {
          create: lineData.map((l) => ({
            materialId: l.materialId,
            qtyOrdered: l.qtyOrdered,
            unitCost: l.unitCost,
            gstRate: l.gstRate,
            freightPerUnit: l.freightPerUnit,
            loadingPerUnit: l.loadingPerUnit,
            packingPerUnit: l.packingPerUnit,
            insurancePerUnit: l.insurancePerUnit,
            discountPerUnit: l.discountPerUnit,
            unitLandedCost: l.unitLandedCost,
            lineTotal: l.lineTotal,
          })),
        },
        charges: charges.length > 0 ? {
          create: charges.map((c) => ({
            heading: c.heading,
            amount: new Decimal(c.amount),
            notes: c.notes ?? null,
          })),
        } : undefined,
      },
      include: { lines: true, charges: true },
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
  const result = await withSerializableTransaction(async (tx) => {
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
  const result = await withSerializableTransaction(async (tx) => {
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
  return withSerializableTransaction(async (tx) => {
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

/**
 * Add a single line to an existing Purchase Order.
 *
 * Allowed only when the PO is in ORDERED or PARTIAL status (lines can be
 * appended after ordering, e.g. to top up a running order). Validates that:
 *   - the PO exists
 *   - the PO is in an orderable status
 *   - the material exists and is not soft-deleted
 *   - the material isn't already present on the PO (one line per material)
 *
 * The line is created inside a `prisma.$transaction` together with an
 * `logAction` audit entry, so the audit trail never diverges from the data.
 */
export async function addLineToPurchaseOrder(input: {
  poId: string;
  materialId: string;
  qtyOrdered: Decimal | number | string;
  unitCost: Decimal | number | string;
  userId?: string;
}) {
  return withSerializableTransaction(async (tx) => {
    const po = await tx.purchaseOrder.findUnique({
      where: { id: input.poId },
      select: { id: true, status: true, companyId: true, poNumber: true },
    });
    if (!po) throw new ServiceError("PO not found", 404);
    if (po.status !== "ORDERED" && po.status !== "PARTIAL") {
      throw new ServiceError(`Cannot add lines to PO in status ${po.status}`);
    }

    // Validate the material exists and is not soft-deleted.
    // (Materials are global — not company-scoped — so we don't filter by
    // companyId here, matching the createPurchaseOrderTx validation.)
    const material = await tx.material.findFirst({
      where: { id: input.materialId, deletedAt: null },
      select: { id: true, code: true, name: true, unit: true, gstRate: true },
    });
    if (!material) throw new ServiceError("Material not found or deleted", 404);

    // Prevent duplicate material on the same PO — one line per material keeps
    // receiving + variance reporting unambiguous.
    const existingLine = await tx.purchaseOrderLine.findFirst({
      where: { purchaseOrderId: input.poId, materialId: input.materialId },
      select: { id: true },
    });
    if (existingLine) {
      throw new ServiceError("Material is already on this PO — edit the existing line instead");
    }

    const qty = new Decimal(input.qtyOrdered);
    const cost = new Decimal(input.unitCost);
    if (!qty.gt(0)) throw new ServiceError("qtyOrdered must be > 0");
    if (cost.lt(0)) throw new ServiceError("unitCost must be >= 0");

    const gstRate = new Decimal(material.gstRate ?? 0);
    const lineTotal = qty.times(cost);
    const lineGstTotal = lineTotal.times(gstRate).div(100);

    const line = await tx.purchaseOrderLine.create({
      data: {
        purchaseOrderId: input.poId,
        materialId: input.materialId,
        qtyOrdered: qty,
        unitCost: cost,
        gstRate,
        qtyReceived: 0,
        lineTotal,
      },
    });

    // Recompute PO header totals so they stay in sync with lines
    const allLines = await tx.purchaseOrderLine.findMany({
      where: { purchaseOrderId: input.poId },
      select: { qtyOrdered: true, unitCost: true, gstRate: true, lineTotal: true },
    });
    const subtotal = allLines.reduce((s, l) => s.plus(new Decimal(l.lineTotal)), new Decimal(0));
    const gstTotal = allLines.reduce((s, l) => {
      const lt = new Decimal(l.lineTotal);
      const gr = new Decimal(l.gstRate);
      return s.plus(lt.times(gr).div(100));
    }, new Decimal(0));
    const total = subtotal.plus(gstTotal);
    await tx.purchaseOrder.update({
      where: { id: input.poId },
      data: { subtotal, gstTotal, total },
    });

    await logAction(tx, {
      userId: input.userId,
      companyId: po.companyId,
      action: "PURCHASE_ORDER_ADD_LINE",
      entityType: "PurchaseOrder",
      entityId: input.poId,
      after: {
        lineId: line.id,
        materialId: input.materialId,
        materialCode: material.code,
        materialName: material.name,
        qtyOrdered: qty.toString(),
        unitCost: cost.toString(),
        lineTotal: lineTotal.toString(),
        poNumber: po.poNumber,
      },
    });

    return line;
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
    lotNumber?: string;
    batchCode?: string;
    expiryDate?: Date;
    manufacturingDate?: Date;
    inspectionStatus?: string; // PENDING | PASSED | FAILED | REJECTED
    inspectionRemarks?: string;
  }[];
  // ── Delivery proof & logistics (GRN enhancement) ──
  deliveryTermsType?: string;
  deliveryMode?: string;
  vehicleType?: string;
  vehicleNumber?: string;
  driverName?: string;
  driverPhone?: string;
  transporterName?: string;
  challanNumber?: string;
  invoiceNumber?: string;
  ewayBillNumber?: string;
  lrNumber?: string;
  packageCount?: number;
  photos?: unknown; // JSON array of { url, fileName }
  receiverSignature?: string; // base64 PNG
  receiverLat?: number;
  receiverLng?: number;
  receiverLocation?: string;
  gateInAt?: Date;
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
  // Gate pass / receiving + unloading
  gatePassNo?: string;
  receivingPhotoUrl?: string;
  unloadingSlipNo?: string;
  unloadedAt?: Date;
  unloadingLocation?: string;
  unloadingRemarks?: string;
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

    // Duplicate prevention: if a GRN was created for this PO in the last 10 seconds,
    // reject as likely double-submit (client button disable is not enough)
    if (input.receivedById) {
      const recentGrn = await tx.goodsReceipt.findFirst({
        where: {
          purchaseOrderId: input.purchaseOrderId,
          receivedById: input.receivedById,
          rejectedAt: null,
          receiptDate: { gte: new Date(Date.now() - 10_000) },
        },
        select: { id: true },
      });
      if (recentGrn) {
        throw new ServiceError("A receipt was just recorded for this PO. Wait a few seconds before receiving again.");
      }
    }
    if (input.locationId !== po.destinationLocationId) {
      throw new ServiceError("Receipt location must match PO destination location");
    }

    // Enforce procurement scope: COMPANY POs → COMPANY_WAREHOUSE, PROJECT POs → PROJECT_SITE.
    const destLocation = await tx.stockLocation.findFirst({
      where: { id: po.destinationLocationId, deletedAt: null },
      select: { type: true, lat: true, lng: true, geoRadius: true },
    });
    if (destLocation) {
      if (po.procurementScope === "COMPANY" && destLocation.type !== "COMPANY_WAREHOUSE" && destLocation.type !== "CENTRAL_WAREHOUSE") {
        throw new ServiceError("COMPANY-scope PO must be received into a COMPANY_WAREHOUSE or CENTRAL_WAREHOUSE location");
      }
      if (po.procurementScope === "PROJECT" && destLocation.type !== "PROJECT_SITE") {
        throw new ServiceError("PROJECT-scope PO must be received into a PROJECT_SITE location");
      }
    }

    // Geo-fence validation: if the location has coordinates and the receiver
    // captured GPS, compute the distance. Flag (don't block) if outside radius.
    let geoFenceOk: boolean | undefined;
    let geoFenceDistance: number | undefined;
    if (destLocation?.lat != null && destLocation?.lng != null && input.receiverLat != null && input.receiverLng != null) {
      const dist = haversineDistance(destLocation.lat, destLocation.lng, input.receiverLat, input.receiverLng);
      geoFenceDistance = dist;
      const radius = destLocation.geoRadius ?? 500; // default 500m
      geoFenceOk = dist <= radius;
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
      //    Pass lotNumber + companyId so lot-tracked materials auto-create a MaterialLot.
      await recordMovement(tx, {
        materialId: line.materialId,
        movementType: "PURCHASE_RECEIPT",
        toLocationId: input.locationId,
        qty: recvQty,
        unitCost: recvCost,
        refType: "PURCHASE_ORDER",
        refId: input.purchaseOrderId,
        userId: input.receivedById,
        lotNumber: line.lotNumber,
        companyId: po.companyId,
      });

      // 3. Update PO line qtyReceived
      await tx.purchaseOrderLine.update({
        where: { id: line.purchaseOrderLineId },
        data: { qtyReceived: cumulative },
      });

      // 4. Auto-populate standardCost from the last purchase price.
      // The standardCost is updated to the unit cost from this receipt,
      // so it always reflects the most recent purchase price.
      await tx.material.update({
        where: { id: line.materialId },
        data: {
          standardCost: recvCost,
          currentCost: recvCost,
        },
      });
    }

    // Create GoodsReceipt + lines (audit record)
    const goodsReceipt = await tx.goodsReceipt.create({
      data: {
        purchaseOrderId: input.purchaseOrderId,
        locationId: input.locationId,
        receivedById: input.receivedById,
        notes: input.notes,
        // Delivery proof & logistics
        deliveryTermsType: input.deliveryTermsType,
        deliveryMode: input.deliveryMode,
        vehicleType: input.vehicleType,
        vehicleNumber: input.vehicleNumber,
        driverName: input.driverName,
        driverPhone: input.driverPhone,
        transporterName: input.transporterName,
        challanNumber: input.challanNumber,
        invoiceNumber: input.invoiceNumber,
        ewayBillNumber: input.ewayBillNumber,
        lrNumber: input.lrNumber,
        packageCount: input.packageCount,
        photos: input.photos as never,
        receiverSignature: input.receiverSignature,
        receiverLat: input.receiverLat,
        receiverLng: input.receiverLng,
        receiverLocation: input.receiverLocation,
        geoFenceOk,
        geoFenceDistance,
        gateInAt: input.gateInAt,
        shortageRemarks: input.shortageRemarks,
        damageRemarks: input.damageRemarks,
        // Supervisor co-signature
        supervisorSignature: input.supervisorSignature,
        supervisorId: input.supervisorId,
        // Weighbridge
        weighbridgeTicketNo: input.weighbridgeTicketNo,
        grossWeight: input.grossWeight != null ? new Decimal(input.grossWeight) : undefined,
        tareWeight: input.tareWeight != null ? new Decimal(input.tareWeight) : undefined,
        netWeight: input.netWeight != null ? new Decimal(input.netWeight) : undefined,
        // Gate pass / receiving + unloading
        gatePassNo: input.gatePassNo,
        receivingPhotoUrl: input.receivingPhotoUrl,
        unloadingSlipNo: input.unloadingSlipNo,
        unloadedById: input.receivedById, // default: same person who receives
        unloadedAt: input.unloadedAt,
        unloadingLocation: input.unloadingLocation,
        unloadingRemarks: input.unloadingRemarks,
        lines: {
          create: input.lines.map((l) => ({
            purchaseOrderLineId: l.purchaseOrderLineId,
            materialId: l.materialId,
            qtyReceived: new Decimal(l.qtyReceived),
            unitCost: new Decimal(l.unitCost),
            lotNumber: l.lotNumber,
            batchCode: l.batchCode,
            expiryDate: l.expiryDate,
            manufacturingDate: l.manufacturingDate,
            inspectionStatus: (l.inspectionStatus as never) ?? undefined,
            inspectionRemarks: l.inspectionRemarks,
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
    const supplier = await tx.supplier.findFirst({ where: { id: po.supplierId, deletedAt: null } });
    if (supplier) {
      const newBalance = new Decimal(supplier.balanceOwed).plus(receiptTotal);
      await tx.supplier.update({
        where: { id: po.supplierId },
        data: { balanceOwed: newBalance },
      });
    }

    // Audit log for goods receipt
    if (input.receivedById) {
      await logAction(tx, {
        userId: input.receivedById,
        companyId: po.companyId,
        action: "PURCHASE_ORDER_RECEIVE",
        entityType: "PurchaseOrder",
        entityId: input.purchaseOrderId,
        after: {
          goodsReceiptId: goodsReceipt.id,
          receiptSubtotal: receiptSubtotal.toString(),
          receiptGst: receiptGst.toString(),
          newStatus,
        },
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

  // Auto-fill HSN/GST on materials that are missing it (best-effort, outside tx)
  // Ensures GST compliance — if a material was created without HSN/GST, the
  // system auto-suggests from the government HSN master at receipt time.
  void (async () => {
    for (const line of input.lines) {
      try {
        await autoFillHsnGst(line.materialId);
      } catch { /* best-effort — don't block receipt for HSN lookup failure */ }
    }
  })();

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

/**
 * Reject a delivery at the gate — goods are refused entry (damaged, wrong, etc.).
 * Creates a GoodsReceipt with rejection fields set but NO stock movements
 * (stock is not received). This records the rejection event for audit + supplier
 * dispute resolution. Optionally links to a SupplierReturn for the return process.
 */
export async function rejectDelivery(input: {
  purchaseOrderId: string;
  locationId: string;
  rejectedById?: string;
  rejectionReason: string;
  rejectionPhotos?: unknown; // JSON array of { url, fileName }
  vehicleNumber?: string;
  challanNumber?: string;
  notes?: string;
  receiverLat?: number;
  receiverLng?: number;
  receiverLocation?: string;
  gatePassNo?: string;
}) {
  return withStockTransaction(async (tx) => {
    const po = await tx.purchaseOrder.findUnique({
      where: { id: input.purchaseOrderId },
      select: { status: true, poNumber: true, supplierId: true, companyId: true },
    });
    if (!po) throw new ServiceError("PO not found", 404);
    if (po.status !== "ORDERED" && po.status !== "PARTIAL") {
      throw new ServiceError(`Cannot reject delivery for PO in status ${po.status}`);
    }

    // Create a GoodsReceipt record marked as rejected (no stock movements)
    const goodsReceipt = await tx.goodsReceipt.create({
      data: {
        purchaseOrderId: input.purchaseOrderId,
        locationId: input.locationId,
        receivedById: input.rejectedById,
        notes: input.notes,
        vehicleNumber: input.vehicleNumber,
        challanNumber: input.challanNumber,
        // Geo-tag the rejection — proves it happened at the gate
        receiverLat: input.receiverLat,
        receiverLng: input.receiverLng,
        receiverLocation: input.receiverLocation,
        // Gate pass no. (if the vehicle had one)
        gatePassNo: input.gatePassNo,
        // Rejection fields
        rejectedAt: new Date(),
        rejectedById: input.rejectedById,
        rejectionReason: input.rejectionReason,
        rejectionPhotos: input.rejectionPhotos as never,
        // Mark all lines as REJECTED inspection status
        inspectionStatus: "REJECTED",
        inspectionNotes: input.rejectionReason,
        // No lines created — stock is not received
      },
    });

    // Mark the PO with rejection info (PO stays ORDERED — supplier can re-deliver)
    await tx.purchaseOrder.update({
      where: { id: input.purchaseOrderId },
      data: {
        rejectedAt: new Date(),
        rejectedById: input.rejectedById,
        rejectionReason: input.rejectionReason,
      },
    });

    if (input.rejectedById) {
      await logAction(tx, {
        userId: input.rejectedById,
        companyId: po.companyId,
        action: "DELIVERY_REJECTED",
        entityType: "PurchaseOrder",
        entityId: input.purchaseOrderId,
        after: {
          goodsReceiptId: goodsReceipt.id,
          reason: input.rejectionReason,
          poNumber: po.poNumber,
        },
      });
    }

    return { goodsReceipt, po };
  });
}
