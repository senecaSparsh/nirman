import { NextRequest } from "next/server";
import { revalidatePath } from "next/cache";
import { prisma } from "@nirman/db";
import {
  approvePurchaseOrder,
  cancelPurchaseOrder,
  orderPurchaseOrder,
  addLineToPurchaseOrder,
  ServiceError,
} from "@nirman/services";
import { PERM } from "@/lib/roles";
import { apiHandler, getCompany, getCompanyGroupIds, json, requirePermission, requireUser, toNum } from "@/lib/server";

export const GET = apiHandler(async (_req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  await requirePermission(PERM.PROCUREMENT_VIEW);
  const company = await getCompany();
  const { id } = await params;
  const groupCompanyIds = await getCompanyGroupIds(company);
  const po = await prisma.purchaseOrder.findFirst({
    where: { id, companyId: { in: groupCompanyIds } },
    include: {
      supplier: true,
      project: { select: { id: true, name: true } },
      destinationLocation: { select: { id: true, name: true, type: true, companyId: true, company: { select: { id: true, name: true } } } },
      approvedBy: { select: { id: true, name: true } },
      rejectedBy: { select: { id: true, name: true } },
      lines: {
        include: {
          material: { select: { id: true, code: true, name: true, unit: true } },
        },
        orderBy: { material: { name: "asc" } },
      },
      goodsReceipts: {
        include: { lines: { select: { materialId: true, qtyReceived: true, unitCost: true } } },
        orderBy: { receiptDate: "desc" },
      },
    },
  });
  if (!po) return json({ error: "Purchase order not found" }, { status: 404 });

  // Fetch the source requisition (if this PO was converted from one)
  const sourceRequisition = await prisma.materialRequisition.findFirst({
    where: { convertedPoId: po.id },
    select: { id: true, reqNumber: true },
  });

  const lines = po.lines.map((l) => ({
    id: l.id,
    materialId: l.materialId,
    materialCode: l.material.code,
    materialName: l.material.name,
    unit: l.material.unit,
    qtyOrdered: toNum(l.qtyOrdered),
    qtyReceived: toNum(l.qtyReceived),
    unitCost: toNum(l.unitCost),
    gstRate: toNum(l.gstRate),
    lineTotal: toNum(l.lineTotal),
    remaining: toNum(l.qtyOrdered) - toNum(l.qtyReceived),
  }));

  const receipts = po.goodsReceipts.map((gr) => ({
    id: gr.id,
    receiptDate: gr.receiptDate.toISOString(),
    inspectionStatus: gr.inspectionStatus,
    inspectionNotes: gr.inspectionNotes,
    notes: gr.notes,
    lineCount: gr.lines.length,
    deliveryMode: gr.deliveryMode,
    vehicleNumber: gr.vehicleNumber,
    driverName: gr.driverName,
    transporterName: gr.transporterName,
    challanNumber: gr.challanNumber,
    invoiceNumber: gr.invoiceNumber,
    ewayBillNumber: gr.ewayBillNumber,
    lrNumber: gr.lrNumber,
    packageCount: gr.packageCount,
  }));

  return json({
    id: po.id,
    poNumber: po.poNumber,
    supplierId: po.supplierId,
    supplier: {
      id: po.supplier.id,
      name: po.supplier.name,
      gstin: po.supplier.gstin,
      phone: po.supplier.phone,
      email: po.supplier.email,
      address: po.supplier.address,
    },
    procurementScope: po.procurementScope,
    projectId: po.projectId,
    projectName: po.project?.name ?? null,
    destinationLocationId: po.destinationLocationId,
    destinationLocation: po.destinationLocation
      ? { id: po.destinationLocation.id, name: po.destinationLocation.name, type: po.destinationLocation.type }
      : null,
    status: po.status,
    approvedById: po.approvedById ?? null,
    approvedByName: po.approvedBy?.name ?? null,
    approvedAt: po.approvedAt?.toISOString() ?? null,
    approvalNotes: po.approvalNotes ?? null,
    rejectedAt: po.rejectedAt?.toISOString() ?? null,
    rejectedByName: po.rejectedBy?.name ?? null,
    rejectionReason: po.rejectionReason ?? null,
    orderDate: po.orderDate?.toISOString() ?? null,
    expectedDate: po.expectedDate?.toISOString() ?? null,
    subtotal: toNum(po.subtotal),
    gstTotal: toNum(po.gstTotal),
    total: toNum(po.total),
    notes: po.notes,
    createdAt: po.createdAt.toISOString(),
    sourceRequisition: sourceRequisition
      ? { id: sourceRequisition.id, reqNumber: sourceRequisition.reqNumber }
      : null,
    lines,
    receipts,
  });
});

export const PATCH = apiHandler(async (req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  await requireUser();
  const { id } = await params;
  const body = await req.json();
  const action = body?.action as string | undefined;
  if (!action || !["approve", "order", "cancel", "addLine"].includes(action)) {
    return json({ error: "Invalid action. Use approve, order, cancel, or addLine." }, { status: 400 });
  }
  if (action === "approve") {
    const user = await requirePermission(PERM.PO_APPROVE);
    await approvePurchaseOrder(id, user.role, user.id, body?.approvalNotes);
  } else if (action === "order") {
    const user = await requirePermission(PERM.PROCUREMENT_MANAGE);
    await orderPurchaseOrder(id, user.id);
  } else if (action === "addLine") {
    const user = await requirePermission(PERM.PROCUREMENT_MANAGE);
    const { materialId, qtyOrdered, unitCost } = body;
    if (!materialId || !qtyOrdered || !unitCost) {
      return json({ error: "materialId, qtyOrdered, and unitCost are required" }, { status: 400 });
    }
    const qtyNum = Number(qtyOrdered);
    const costNum = Number(unitCost);
    if (!Number.isFinite(qtyNum) || qtyNum <= 0) {
      return json({ error: "qtyOrdered must be a positive number" }, { status: 400 });
    }
    if (!Number.isFinite(costNum) || costNum < 0) {
      return json({ error: "unitCost must be a non-negative number" }, { status: 400 });
    }
    try {
      const line = await addLineToPurchaseOrder({
        poId: id,
        materialId,
        qtyOrdered: qtyNum,
        unitCost: costNum,
        userId: user.id,
      });
      revalidatePath(`/m/procurement/${id}`);
      return json({ ok: true, lineId: line.id }, { status: 201 });
    } catch (err) {
      // Re-throw ServiceError as-is (apiHandler maps it to the correct HTTP
      // status); wrap any other failure so FK/constraint errors surface as a
      // 400 instead of an opaque 500.
      if (err instanceof ServiceError) throw err;
      throw new ServiceError(
        err instanceof Error ? err.message : "Failed to add line to purchase order",
        400,
      );
    }
  } else {
    const user = await requirePermission(PERM.PROCUREMENT_MANAGE);
    await cancelPurchaseOrder(id, user.id);
  }
  revalidatePath("/m/procurement");
  revalidatePath("/m/requisitions");
  return json({ ok: true });
});
