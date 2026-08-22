import { NextRequest } from "next/server";
import { prisma } from "@nirman/db";
import type { PurchaseOrderStatus } from "@nirman/db";
import { createPurchaseOrder } from "@nirman/services";
import { PERM } from "@/lib/roles";
import { apiHandler, getCompany, getCompanyGroupIds, json, purchaseOrderSchema, requirePermission, toNum } from "@/lib/server";

export const GET = apiHandler(async (req: NextRequest) => {
  await requirePermission(PERM.PROCUREMENT_VIEW);
  const company = await getCompany();
  const { searchParams } = new URL(req.url);
  const statusParam = searchParams.get("status");
  const statusFilter = statusParam ? { status: { in: statusParam.split(",") as PurchaseOrderStatus[] } } : {};

  // Show POs from the entire company GROUP (current + parent + children).
  // This is necessary because quotation-approved POs may be created in a
  // different company than the user's current company (e.g. destination is
  // the parent's central warehouse → PO is in the parent's books).
  const groupCompanyIds = await getCompanyGroupIds(company);

  const pos = await prisma.purchaseOrder.findMany({
    where: { companyId: { in: groupCompanyIds }, ...statusFilter },
    orderBy: { createdAt: "desc" },
    take: 200,
    include: {
      supplier: { select: { id: true, name: true } },
      project: { select: { id: true, name: true } },
      destinationLocation: { select: { id: true, name: true, type: true, companyId: true, company: { select: { id: true, name: true } } } },
      lines: { select: { qtyOrdered: true, qtyReceived: true } },
      charges: { select: { id: true, heading: true, amount: true, notes: true } },
    },
  });
  return json(
    pos.map((po) => {
      const totalOrdered = po.lines.reduce((s, l) => s + toNum(l.qtyOrdered), 0);
      const totalReceived = po.lines.reduce((s, l) => s + toNum(l.qtyReceived), 0);
      return {
        id: po.id,
        poNumber: po.poNumber,
        supplierId: po.supplierId,
        supplierName: po.supplier.name,
        procurementScope: po.procurementScope,
        projectId: po.projectId,
        projectName: po.project?.name ?? null,
        destinationLocationId: po.destinationLocationId,
        destinationLocationName: po.destinationLocation.name,
        destinationLocationType: po.destinationLocation.type,
        destinationLocationCompanyName: po.destinationLocation.company?.name ?? null,
        isCrossCompany: po.destinationLocation.companyId !== company.id,
        status: po.status,
        orderDate: po.orderDate.toISOString(),
        expectedDate: po.expectedDate?.toISOString() ?? null,
        subtotal: toNum(po.subtotal),
        gstTotal: toNum(po.gstTotal),
        freightTotal: toNum(po.freightTotal),
        loadingTotal: toNum(po.loadingTotal),
        packingTotal: toNum(po.packingTotal),
        insuranceTotal: toNum(po.insuranceTotal),
        discountTotal: toNum(po.discountTotal),
        miscChargesTotal: toNum(po.miscChargesTotal),
        total: toNum(po.total),
        notes: po.notes,
        charges: po.charges.map((c) => ({ id: c.id, heading: c.heading, amount: toNum(c.amount), notes: c.notes })),
        totalOrdered,
        totalReceived,
        receivedPct: totalOrdered > 0 ? Math.round((totalReceived / totalOrdered) * 100) : 0,
        createdAt: po.createdAt.toISOString(),
      };
    }),
  );
});

export const POST = apiHandler(async (req: NextRequest) => {
  const user = await requirePermission(PERM.PROCUREMENT_MANAGE);
  const company = await getCompany();
  const body = await req.json();
  const parsed = purchaseOrderSchema.safeParse(body);
  if (!parsed.success) {
    return json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  }
  // Reject requisitionId — requisition-to-PO conversion must go through
  // PATCH /api/requisitions/[id] with action:"convert" (enforces quote gate)
  if (body?.requisitionId) {
    return json({ error: "Use PATCH /api/requisitions/[id] with action:\"convert\" to convert a requisition to a PO" }, { status: 400 });
  }
  const { expectedDate, projectId, charges, ...rest } = parsed.data;
  try {
    const po = await createPurchaseOrder({
      ...rest,
      companyId: company.id,
      projectId: projectId ?? undefined,
      expectedDate: expectedDate ? new Date(expectedDate) : undefined,
      notes: rest.notes ?? undefined,
      createdById: user.id,
      charges: charges && charges.length > 0
        ? charges.map((c) => ({ heading: c.heading, amount: c.amount, notes: c.notes ?? undefined }))
        : undefined,
    });
    return json(po, { status: 201 });
  } catch (err: unknown) {
    return json({ error: (err instanceof Error ? err.message : "Failed to create purchase order") }, { status: 400 });
  }
});
