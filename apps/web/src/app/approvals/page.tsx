import { Suspense } from "react";
import { connection } from "next/server";
import { prisma } from "@nirman/db";
import { getCompany, getCurrentUser, getUserPermissions, getUserScope, toNum } from "@/lib/server";
import { PERM } from "@/lib/roles";
import { PageHeader } from "@/components/page-header";
import { PageLoading } from "@/components/page-loading";
import { ApprovalsView } from "@/components/approvals/approvals-view";
import type { ApprovalPORow, ApprovalReqRow } from "@/lib/types";

import { NoAccess } from "@/components/no-access";
export default function ApprovalsPage() {
  return (
    <div className="space-y-5">
      <PageHeader
        title="Approvals"
        description="Purchase orders and material indents awaiting your approval."
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
      <NoAccess what="the approval queue" />
    );
  }
  const company = await getCompany();

  // Hierarchical RBAC: scope the approval queue. A PROJECT-scoped approver
  // (Sub-Sub-Admin with approve permission) only sees POs/requisitions for
  // their projects. A DEPARTMENT-scoped approver (Sub-Admin) sees everything
  // (POs/requisitions are project-level, not department-level, so a Sub-Admin
  // acting as a regional head sees all projects in their purview — department
  // scope bounds consumption reports, not procurement approvals).
  const scope = await getUserScope();
  const poProjectFilter =
    scope.scopeType === "PROJECT" && scope.projectIds.length > 0
      ? { projectId: { in: scope.projectIds } }
      : {};
  const reqProjectFilter =
    scope.scopeType === "PROJECT" && scope.projectIds.length > 0
      ? { projectId: { in: scope.projectIds } }
      : {};

  const [purchaseOrders, requisitions] = await Promise.all([
    canApprovePo
      ? prisma.purchaseOrder.findMany({
          where: { companyId: company.id, status: "DRAFT", ...poProjectFilter },
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
          where: { project: { companyId: company.id }, status: "SUBMITTED", ...reqProjectFilter },
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
