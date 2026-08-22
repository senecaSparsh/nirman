import { NextRequest } from "next/server";
import { prisma } from "@nirman/db";
import { receiveGoods, rejectDelivery, recordVehicleTrip } from "@nirman/services";
import { PERM } from "@/lib/roles";
import { apiHandler, getCompany, getCompanyGroupIds, json, receiveGoodsSchema, rejectDeliverySchema, requirePermission } from "@/lib/server";

/**
 * POST /api/purchase-orders/[id]/receive — record a goods receipt against a PO.
 * Body: { notes?, lines: [{ purchaseOrderLineId, materialId, qtyReceived, unitCost }] }
 *
 * POST /api/purchase-orders/[id]/receive — reject a delivery at the gate.
 * Body: { action: "reject", rejectionReason, rejectionPhotos?, ... }
 *
 * Delegates to the procurement service which atomically:
 *  - records PURCHASE_RECEIPT stock movements (updates StockLocationItem + MAC)
 *  - creates a GoodsReceipt + lines
 *  - updates PO line qtyReceived + recomputes PO status (PARTIAL/RECEIVED)
 *
 * NOTE: The PO may belong to a DIFFERENT company in the group (e.g. the
 * parent's central warehouse). We allow receiving any PO in the company
 * GROUP, not just the user's current company.
 */
export const POST = apiHandler(async (req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  const user = await requirePermission(PERM.PROCUREMENT_MANAGE);
  const company = await getCompany();
  const { id } = await params;
  const body = await req.json();

  // ── Reject delivery at gate ──
  if (body.action === "reject") {
    const parsed = rejectDeliverySchema.safeParse(body);
    if (!parsed.success) {
      return json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
    }
    const groupCompanyIds = await getCompanyGroupIds(company);
    const po = await prisma.purchaseOrder.findFirst({
      where: { id, companyId: { in: groupCompanyIds } },
      select: { destinationLocationId: true, status: true },
    });
    if (!po) return json({ error: "Purchase order not found" }, { status: 404 });

    const result = await rejectDelivery({
      purchaseOrderId: id,
      locationId: po.destinationLocationId,
      rejectedById: user.id,
      rejectionReason: parsed.data.rejectionReason,
      rejectionPhotos: parsed.data.rejectionPhotos,
      vehicleNumber: parsed.data.vehicleNumber,
      challanNumber: parsed.data.challanNumber,
      notes: parsed.data.notes,
      receiverLat: parsed.data.receiverLat,
      receiverLng: parsed.data.receiverLng,
      receiverLocation: parsed.data.receiverLocation,
      gatePassNo: parsed.data.gatePassNo,
    });

    // Log the vehicle trip for the rejected delivery
    if (parsed.data.vehicleNumber) {
      await recordVehicleTrip({
        vehicleNumber: parsed.data.vehicleNumber,
        vehicleType: "OTHER",
        movementType: "PURCHASE_RECEIPT",
        refType: "GoodsReceipt",
        refId: result.goodsReceipt.id,
        toLocationId: po.destinationLocationId,
        photos: parsed.data.rejectionPhotos,
        companyId: company.id,
      }).catch(() => { /* best-effort */ });
    }

    return json({ ok: true, goodsReceiptId: result.goodsReceipt.id }, { status: 201 });
  }

  // ── Normal goods receipt ──
  const parsed = receiveGoodsSchema.safeParse(body);
  if (!parsed.success) {
    return json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  }

  // Allow receiving POs from any company in the group (parent/child).
  const groupCompanyIds = await getCompanyGroupIds(company);
  const po = await prisma.purchaseOrder.findFirst({
    where: { id, companyId: { in: groupCompanyIds } },
    select: { destinationLocationId: true, status: true },
  });
  if (!po) return json({ error: "Purchase order not found" }, { status: 404 });

  const result = await receiveGoods({
    purchaseOrderId: id,
    locationId: po.destinationLocationId,
    receivedById: user.id,
    notes: parsed.data.notes ?? undefined,
    lines: parsed.data.lines.map((l) => ({
      purchaseOrderLineId: l.purchaseOrderLineId,
      materialId: l.materialId,
      qtyReceived: l.qtyReceived,
      unitCost: l.unitCost,
      lotNumber: l.lotNumber ?? undefined,
      batchCode: l.batchCode ?? undefined,
      expiryDate: l.expiryDate ?? undefined,
      manufacturingDate: l.manufacturingDate ?? undefined,
      inspectionStatus: l.inspectionStatus ?? undefined,
      inspectionRemarks: l.inspectionRemarks ?? undefined,
    })),
    // Delivery proof & logistics
    deliveryTermsType: parsed.data.deliveryTermsType,
    deliveryMode: parsed.data.deliveryMode,
    vehicleType: parsed.data.vehicleType,
    vehicleNumber: parsed.data.vehicleNumber,
    driverName: parsed.data.driverName,
    driverPhone: parsed.data.driverPhone,
    transporterName: parsed.data.transporterName,
    challanNumber: parsed.data.challanNumber,
    invoiceNumber: parsed.data.invoiceNumber,
    ewayBillNumber: parsed.data.ewayBillNumber,
    lrNumber: parsed.data.lrNumber,
    packageCount: parsed.data.packageCount,
    photos: parsed.data.photos,
    receiverSignature: parsed.data.receiverSignature,
    receiverLat: parsed.data.receiverLat,
    receiverLng: parsed.data.receiverLng,
    receiverLocation: parsed.data.receiverLocation,
    gateInAt: parsed.data.gateInAt,
    shortageRemarks: parsed.data.shortageRemarks,
    damageRemarks: parsed.data.damageRemarks,
    supervisorSignature: parsed.data.supervisorSignature,
    supervisorId: parsed.data.supervisorId,
    weighbridgeTicketNo: parsed.data.weighbridgeTicketNo,
    grossWeight: parsed.data.grossWeight,
    tareWeight: parsed.data.tareWeight,
    netWeight: parsed.data.netWeight,
    // Gate pass / receiving + unloading
    gatePassNo: parsed.data.gatePassNo,
    receivingPhotoUrl: parsed.data.receivingPhotoUrl,
    unloadingSlipNo: parsed.data.unloadingSlipNo,
    unloadedAt: parsed.data.unloadedAt,
    unloadingLocation: parsed.data.unloadingLocation,
    unloadingRemarks: parsed.data.unloadingRemarks,
  });

  // Log the vehicle trip (auto-creates/updates Vehicle master)
  if (parsed.data.vehicleNumber) {
    await recordVehicleTrip({
      vehicleNumber: parsed.data.vehicleNumber,
      vehicleType: parsed.data.vehicleType ?? "OTHER",
      driverName: parsed.data.driverName,
      driverPhone: parsed.data.driverPhone,
      transporterName: parsed.data.transporterName,
      movementType: "PURCHASE_RECEIPT",
      refType: "GoodsReceipt",
      refId: result.goodsReceipt.id,
      toLocationId: po.destinationLocationId,
      photos: parsed.data.photos,
      companyId: company.id,
    }).catch(() => { /* best-effort — don't fail the receipt */ });
  }

  return json({ ok: true, newStatus: result.newStatus, goodsReceiptId: result.goodsReceipt.id }, { status: 201 });
});
