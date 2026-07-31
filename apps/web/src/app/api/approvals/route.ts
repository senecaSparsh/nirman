import { NextRequest } from "next/server";
import { prisma } from "@nirman/db";
import { apiHandler, getCompany, getUserPermissions, json, requireUser, toNum } from "@/lib/server";
import { PERM } from "@/lib/roles";

/**
 * GET /api/approvals — the procurement approval queue.
 * Returns purchase orders awaiting approval (status DRAFT) and
 * requisitions awaiting approval (status SUBMITTED). Only users
 * with po.approve OR requisition.approve may call this.
 */
export const GET = apiHandler(async (_req: NextRequest) => {
  const user = await requireUser();
  const perms = await getUserPermissions();
  const canApprovePo = perms.includes(PERM.PO_APPROVE);
  const canApproveReq = perms.includes(PERM.REQUISITION_APPROVE);
  if (!canApprovePo && !canApproveReq) {
    return json({ error: "Forbidden — your role does not have permission for this action" }, { status: 403 });
  }
  const company = await getCompany();

  const [purchaseOrders, requisitions] = await Promise.all([
    prisma.purchaseOrder.findMany({
      where: { companyId: company.id, status: "DRAFT" },
      orderBy: { createdAt: "desc" },
      include: {
        supplier: { select: { id: true, name: true } },
        project: { select: { id: true, name: true } },
        lines: { select: { qtyOrdered: true, unitCost: true, materialId: true } },
        createdBy: { select: { id: true, name: true } },
      },
    }),
    prisma.materialRequisition.findMany({
      where: { project: { companyId: company.id }, status: "SUBMITTED" },
      orderBy: { createdAt: "desc" },
      include: {
        project: { select: { id: true, name: true } },
        phase: { select: { id: true, name: true } },
        lines: { select: { qtyRequested: true, materialId: true } },
        requestedBy: { select: { id: true, name: true } },
      },
    }),
  ]);

  return json({
    purchaseOrders: purchaseOrders.map((po) => ({
      id: po.id,
      poNumber: po.poNumber,
      supplierName: po.supplier.name,
      projectName: po.project?.name ?? null,
      procurementScope: po.procurementScope,
      status: po.status,
      total: toNum(po.total),
      subtotal: toNum(po.subtotal),
      gstTotal: toNum(po.gstTotal),
      lineCount: po.lines.length,
      createdByName: po.createdBy?.name ?? null,
      createdAt: po.createdAt.toISOString(),
      expectedDate: po.expectedDate?.toISOString() ?? null,
      canApprove: canApprovePo,
    })),
    requisitions: requisitions.map((r) => ({
      id: r.id,
      reqNumber: r.reqNumber,
      projectName: r.project.name,
      phaseName: r.phase?.name ?? null,
      status: r.status,
      lineCount: r.lines.length,
      totalQty: r.lines.reduce((s, l) => s + toNum(l.qtyRequested), 0),
      requestedByName: r.requestedBy?.name ?? null,
      neededByDate: r.neededByDate?.toISOString() ?? null,
      createdAt: r.createdAt.toISOString(),
      canApprove: canApproveReq,
    })),
    requestedBy: { id: user.id, name: user.name },
  });
});
