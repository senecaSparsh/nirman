import { NextRequest } from "next/server";
import { prisma } from "@nirman/db";
import {
  approvePurchaseOrder,
  cancelPurchaseOrder,
  orderPurchaseOrder,
} from "@nirman/services";
import { PERM } from "@/lib/roles";
import { apiHandler, getCompany, json, requirePermission, toNum } from "@/lib/server";

export const GET = apiHandler(async (_req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  await requirePermission(PERM.PROCUREMENT_VIEW);
  const company = await getCompany();
  const { id } = await params;
  const po = await prisma.purchaseOrder.findFirst({
    where: { id, companyId: company.id },
    include: {
      supplier: true,
      project: { select: { id: true, name: true } },
      destinationLocation: { select: { id: true, name: true, type: true } },
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
    notes: gr.notes,
    lineCount: gr.lines.length,
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
  const { id } = await params;
  const body = await req.json();
  const action = body?.action as string | undefined;
  if (!action || !["approve", "order", "cancel"].includes(action)) {
    return json({ error: "Invalid action. Use approve, order, or cancel." }, { status: 400 });
  }
  if (action === "approve") {
    const user = await requirePermission(PERM.PO_APPROVE);
    await approvePurchaseOrder(id, user.id, body?.approvalNotes);
  } else if (action === "order") {
    const user = await requirePermission(PERM.PROCUREMENT_MANAGE);
    await orderPurchaseOrder(id, user.id);
  } else {
    const user = await requirePermission(PERM.PROCUREMENT_MANAGE);
    await cancelPurchaseOrder(id, user.id);
  }
  return json({ ok: true });
});
