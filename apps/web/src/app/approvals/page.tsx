import { Suspense } from "react";
import { prisma } from "@nirman/db";
import { getCompany, getUserPermissions, toNum, scopeWhere } from "@/lib/server";
import { PERM } from "@/lib/roles";
import { PageHeader } from "@/components/page-header";
import { PageLoading } from "@/components/page-loading";
import { NoAccess } from "@/components/no-access";
import { ApprovalsView } from "@/components/approvals/approvals-view";
import type { ApprovalPORow, ApprovalReqRow } from "@/lib/types";

export const metadata = { title: "Approvals · Nirman" };

export default function ApprovalsPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Approvals"
        description="Purchase orders and indents waiting for your sign-off — approve, reject, or batch-approve with budget context."
      />
      <Suspense fallback={<PageLoading label="Loading approval queue…" />}>
        <ApprovalsContent />
      </Suspense>
    </div>
  );
}

async function ApprovalsContent() {
  const perms = await getUserPermissions();
  const canApprovePo = perms.includes(PERM.PO_APPROVE);
  const canApproveReq = perms.includes(PERM.REQUISITION_APPROVE);

  if (!canApprovePo && !canApproveReq) {
    return <NoAccess what="the approval queue" />;
  }

  const company = await getCompany();

  const [purchaseOrders, requisitions] = await Promise.all([
    canApprovePo
      ? prisma.purchaseOrder.findMany({
          where: { companyId: company.id, status: "DRAFT", createdById: { not: undefined } },
          orderBy: { createdAt: "desc" },
          take: 100,
          include: {
            supplier: { select: { id: true, name: true } },
            project: { select: { id: true, name: true, totalBudget: true } },
            lines: { select: { qtyOrdered: true, unitCost: true, materialId: true } },
            createdBy: { select: { id: true, name: true } },
          },
        })
      : [],
    canApproveReq
      ? prisma.materialRequisition.findMany({
          where: {...await scopeWhere("MaterialRequisition"),  project: { companyId: company.id }, status: "SUBMITTED" },
          orderBy: { createdAt: "desc" },
          take: 100,
          include: {
            project: { select: { id: true, name: true, totalBudget: true } },
            phase: { select: { id: true, name: true } },
            lines: {
              include: {
                material: { select: { id: true, name: true, code: true, unit: true } },
              },
            },
            requestedBy: { select: { id: true, name: true } },
          },
        })
      : [],
  ]);

  // Filter out self-created items (can't approve your own)
  const user = await import("@/lib/server").then((m) => m.requireUser());
  const filteredPOs = purchaseOrders.filter((po) => po.createdById !== user.id);
  const filteredReqs = requisitions.filter((r) => r.requestedById !== user.id);

  // ── Budget context ──
  const projectCostCache = new Map<string, number>();
  async function getProjectSpent(projectId: string | null): Promise<number | null> {
    if (!projectId) return null;
    if (projectCostCache.has(projectId)) return projectCostCache.get(projectId)!;
    try {
      const proj = await prisma.project.findUnique({
        where: { id: projectId },
        select: { totalProjectCost: true },
      });
      const spent = proj?.totalProjectCost ? toNum(proj.totalProjectCost) : null;
      if (spent != null) projectCostCache.set(projectId, spent);
      return spent;
    } catch {
      return null;
    }
  }

  function computeBudgetContext(
    budget: unknown,
    spent: number | null,
    poTotal: number,
  ) {
    const projectBudget = budget != null ? toNum(budget as { toString(): string }) : null;
    if (projectBudget === null) {
      return { projectBudget: null, projectSpent: spent, budgetRemaining: null, budgetUtilizationPct: null, wouldExceedBudget: false };
    }
    const spentInclPo = (spent ?? 0) + poTotal;
    const remaining = projectBudget - spentInclPo;
    const utilizationPct = projectBudget > 0 ? (spentInclPo / projectBudget) * 100 : 0;
    return {
      projectBudget,
      projectSpent: spent,
      budgetRemaining: remaining,
      budgetUtilizationPct: utilizationPct,
      wouldExceedBudget: remaining < 0,
    };
  }

  function computeUrgency(neededBy: Date | null, createdAt: Date): string {
    const now = new Date();
    if (neededBy) {
      const diffMs = neededBy.getTime() - now.getTime();
      const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
      if (diffDays < 0) return "overdue";
      if (diffDays === 0) return "due_today";
      if (diffDays <= 7) return "due_this_week";
    }
    const ageDays = Math.ceil((now.getTime() - createdAt.getTime()) / (1000 * 60 * 60 * 24));
    return ageDays >= 3 ? "due_this_week" : "normal";
  }

  const URGENCY_ORDER: Record<string, number> = { overdue: 0, due_today: 1, due_this_week: 2, normal: 3 };

  const poRows: ApprovalPORow[] = await Promise.all(
    filteredPOs.map(async (po) => {
      const spent = await getProjectSpent(po.project?.id ?? null);
      const ctx = computeBudgetContext(po.project?.totalBudget, spent, toNum(po.total));
      return {
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
        ...ctx,
        urgency: computeUrgency(po.expectedDate, po.createdAt),
      };
    }),
  );

  const reqRows: ApprovalReqRow[] = await Promise.all(
    filteredReqs.map(async (r) => {
      const spent = await getProjectSpent(r.project?.id ?? null);
      const estimatedTotal = r.lines.reduce((s, l) => {
        const rate = l.lastRate ? toNum(l.lastRate) : 0;
        return s + toNum(l.qtyRequested) * rate;
      }, 0);
      const ctx = computeBudgetContext(r.project?.totalBudget ?? null, spent, estimatedTotal);
      return {
        id: r.id,
        reqNumber: r.reqNumber,
        projectName: r.project?.name ?? null,
        phaseName: r.phase?.name ?? null,
        status: r.status,
        lineCount: r.lines.length,
        totalQty: r.lines.reduce((s, l) => s + toNum(l.qtyRequested), 0),
        requestedByName: r.requestedBy?.name ?? null,
        neededByDate: r.neededByDate?.toISOString() ?? null,
        createdAt: r.createdAt.toISOString(),
        canApprove: canApproveReq,
        ...ctx,
        urgency: computeUrgency(r.neededByDate, r.createdAt),
        lineDetails: r.lines.map((l) => ({
          materialId: l.materialId,
          materialName: l.material.name,
          materialCode: l.material.code,
          unit: l.material.unit,
          qtyRequested: toNum(l.qtyRequested),
          currentStock: l.currentStock != null ? toNum(l.currentStock) : null,
          lastRate: l.lastRate != null ? toNum(l.lastRate) : null,
          lastRateDate: l.lastRateDate?.toISOString() ?? null,
        })),
      };
    }),
  );

  poRows.sort((a, b) => (URGENCY_ORDER[a.urgency] ?? 9) - (URGENCY_ORDER[b.urgency] ?? 9));
  reqRows.sort((a, b) => (URGENCY_ORDER[a.urgency] ?? 9) - (URGENCY_ORDER[b.urgency] ?? 9));

  return <ApprovalsView purchaseOrders={poRows} requisitions={reqRows} />;
}
