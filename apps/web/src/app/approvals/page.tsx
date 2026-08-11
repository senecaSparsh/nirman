import { Suspense } from "react";
import { connection } from "next/server";
import { prisma } from "@nirman/db";
import { getCompany, getCurrentUser, getUserPermissions, getUserScope, toNum } from "@/lib/server";
import { PERM } from "@/lib/roles";
import { PageHeader } from "@/components/page-header";
import { PageLoading } from "@/components/page-loading";
import { ApprovalsView } from "@/components/approvals/approvals-view";
import type { ApprovalPORow, ApprovalReqRow, ApprovalReqLineDetail } from "@/lib/types";

import { NoAccess } from "@/components/no-access";

/** Compute urgency from a target date (expectedDate for POs, neededByDate for requisitions). */
function computeUrgency(dateStr: string | null): string {
  if (!dateStr) return "normal";
  const date = new Date(dateStr);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const target = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const diffDays = Math.floor((target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
  if (diffDays < 0) return "overdue";
  if (diffDays === 0) return "due_today";
  if (diffDays <= 7) return "due_this_week";
  return "normal";
}

/** Sort items by urgency: overdue → due_today → due_this_week → normal. */
const URGENCY_ORDER: Record<string, number> = {
  overdue: 0,
  due_today: 1,
  due_this_week: 2,
  normal: 3,
};

export default function ApprovalsPage() {
  return (
    <div className="space-y-6">
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
            project: { select: { id: true, name: true, totalBudget: true, totalProjectCost: true } },
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
            project: { select: { id: true, name: true, totalBudget: true, totalProjectCost: true } },
            phase: { select: { id: true, name: true } },
            lines: {
              select: {
                qtyRequested: true,
                currentStock: true,
                lastRate: true,
                lastRateDate: true,
                material: { select: { id: true, name: true, code: true, unit: true } },
              },
            },
            requestedBy: { select: { id: true, name: true } },
          },
        })
      : [],
  ]);

  // ── Build a project budget lookup so we can compute budget context per item ──
  const projectIds = new Set<string>();
  for (const po of purchaseOrders) {
    if (po.projectId) projectIds.add(po.projectId);
  }
  for (const r of requisitions) {
    if (r.projectId) projectIds.add(r.projectId);
  }

  // Budget context is already fetched via the include on project above,
  // but we build a lookup for convenience.
  const projectBudgetMap = new Map<string, { budget: number | null; spent: number | null }>();
  for (const po of purchaseOrders) {
    if (po.projectId && po.project && !projectBudgetMap.has(po.projectId)) {
      projectBudgetMap.set(po.projectId, {
        budget: po.project.totalBudget ? toNum(po.project.totalBudget) : null,
        spent: po.project.totalProjectCost ? toNum(po.project.totalProjectCost) : null,
      });
    }
  }
  for (const r of requisitions) {
    if (r.projectId && r.project && !projectBudgetMap.has(r.projectId)) {
      projectBudgetMap.set(r.projectId, {
        budget: r.project.totalBudget ? toNum(r.project.totalBudget) : null,
        spent: r.project.totalProjectCost ? toNum(r.project.totalProjectCost) : null,
      });
    }
  }

  /** Compute budget context for a project + pending amount. */
  function budgetContext(projectId: string | null, pendingAmount: number) {
    if (!projectId) return {
      projectBudget: null, projectSpent: null, budgetRemaining: null,
      budgetUtilizationPct: null, wouldExceedBudget: false,
    };
    const ctx = projectBudgetMap.get(projectId);
    if (!ctx || ctx.budget === null) return {
      projectBudget: null, projectSpent: ctx?.spent ?? null, budgetRemaining: null,
      budgetUtilizationPct: null, wouldExceedBudget: false,
    };
    const spent = ctx.spent ?? 0;
    const remaining = ctx.budget - spent;
    const utilizationPct = ctx.budget > 0 ? (spent / ctx.budget) * 100 : 0;
    const wouldExceed = (spent + pendingAmount) > ctx.budget;
    return {
      projectBudget: ctx.budget,
      projectSpent: spent,
      budgetRemaining: remaining,
      budgetUtilizationPct: Math.round(utilizationPct * 10) / 10,
      wouldExceedBudget: wouldExceed,
    };
  }

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
    urgency: computeUrgency(po.expectedDate?.toISOString() ?? null),
    ...budgetContext(po.projectId, toNum(po.total)),
  }));

  const reqRows: ApprovalReqRow[] = requisitions.map((r) => {
    const lineDetails: ApprovalReqLineDetail[] = r.lines.map((l) => ({
      materialId: l.material.id,
      materialName: l.material.name,
      materialCode: l.material.code,
      unit: l.material.unit,
      qtyRequested: toNum(l.qtyRequested),
      currentStock: l.currentStock ? toNum(l.currentStock) : null,
      lastRate: l.lastRate ? toNum(l.lastRate) : null,
      lastRateDate: l.lastRateDate?.toISOString() ?? null,
    }));

    // Estimate pending cost from last rates (best available estimate)
    const estimatedCost = r.lines.reduce((sum, l) => {
      const rate = l.lastRate ? toNum(l.lastRate) : 0;
      return sum + toNum(l.qtyRequested) * rate;
    }, 0);

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
      urgency: computeUrgency(r.neededByDate?.toISOString() ?? null),
      lineDetails,
      ...budgetContext(r.projectId, estimatedCost),
    };
  });

  // Sort by urgency: overdue → due_today → due_this_week → normal
  const urgencyRank = (u: string) => URGENCY_ORDER[u] ?? 99;
  poRows.sort((a, b) => urgencyRank(a.urgency) - urgencyRank(b.urgency));
  reqRows.sort((a, b) => urgencyRank(a.urgency) - urgencyRank(b.urgency));

  const totalCount = poRows.length + reqRows.length;
  const overdueCount = [...poRows, ...reqRows].filter((r) => r.urgency === "overdue").length;

  return (
    <>
      <PageHeader
        title="Approvals"
        description="Purchase orders and material indents awaiting your approval."
        stats={[
          { label: "Pending", value: totalCount, tone: totalCount > 0 ? "warning" : "muted", hint: "Total items awaiting your approval — purchase orders plus material indents." },
          { label: "Overdue", value: overdueCount, tone: overdueCount > 0 ? "danger" : "muted", hint: "Items past their expected or needed-by date." },
          { label: "POs", value: poRows.length, hint: "Draft purchase orders pending your approval before they can be ordered." },
          { label: "Indents", value: reqRows.length, hint: "Submitted material indents pending your approval before conversion to a PO." },
        ]}
      />
      <ApprovalsView purchaseOrders={poRows} requisitions={reqRows} />
    </>
  );
}
