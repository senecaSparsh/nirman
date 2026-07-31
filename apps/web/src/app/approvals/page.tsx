import { Suspense } from "react";
import { connection } from "next/server";
import { prisma } from "@nirman/db";
import { getCompany, getCurrentUser, getUserPermissions, toNum } from "@/lib/server";
import { PERM } from "@/lib/roles";
import { PageHeader } from "@/components/page-header";
import { PageLoading } from "@/components/page-loading";
import { ApprovalsView } from "@/components/approvals/approvals-view";
import type { ApprovalPORow, ApprovalReqRow } from "@/lib/types";

export default function ApprovalsPage() {
  return (
    <div className="space-y-5">
      <PageHeader
        title="Approvals"
        description="Purchase orders and material requisitions awaiting your approval."
      />
      <Suspense fallback={<PageLoading label="Loading approval queue…" />}>
        <ApprovalsContent />
      </Suspense>
    </div>
  );
}

async function ApprovalsContent() {
  await connection();
  const user = await getCurrentUser();
  if (!user) {
    return (
      <div className="rounded-xl border border-border bg-card p-6 text-meta text-muted-foreground">
        Sign in to view the approval queue.
      </div>
    );
  }
  const perms = await getUserPermissions();
  const canApprovePo = perms.includes(PERM.PO_APPROVE);
  const canApproveReq = perms.includes(PERM.REQUISITION_APPROVE);
  if (!canApprovePo && !canApproveReq) {
    return (
      <div className="rounded-xl border border-border bg-card p-6 text-meta text-muted-foreground">
        You do not have permission to view the approval queue.
      </div>
    );
  }
  const company = await getCompany();

  const [purchaseOrders, requisitions] = await Promise.all([
    canApprovePo
      ? prisma.purchaseOrder.findMany({
          where: { companyId: company.id, status: "DRAFT" },
          orderBy: { createdAt: "desc" },
          include: {
            supplier: { select: { id: true, name: true } },
            project: { select: { id: true, name: true } },
            lines: { select: { qtyOrdered: true, unitCost: true } },
            createdBy: { select: { id: true, name: true } },
          },
        })
      : [],
    canApproveReq
      ? prisma.materialRequisition.findMany({
          where: { project: { companyId: company.id }, status: "SUBMITTED" },
          orderBy: { createdAt: "desc" },
          include: {
            project: { select: { id: true, name: true } },
            phase: { select: { id: true, name: true } },
            lines: { select: { qtyRequested: true } },
            requestedBy: { select: { id: true, name: true } },
          },
        })
      : [],
  ]);

  const poRows: ApprovalPORow[] = purchaseOrders.map((po) => ({
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
  }));

  const reqRows: ApprovalReqRow[] = requisitions.map((r) => ({
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
  }));

  return <ApprovalsView purchaseOrders={poRows} requisitions={reqRows} />;
}
