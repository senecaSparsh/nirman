import { NextRequest } from "next/server";
import { prisma } from "@nirman/db";
import { projectTotalCost } from "@nirman/services";
import { apiHandler, getCompany, getUserPermissions, json, requireUser, toNum } from "@/lib/server";
import { PERM } from "@/lib/roles";

/**
 * GET /api/approvals — the procurement approval queue.
 * Returns purchase orders awaiting approval (status DRAFT) and
 * requisitions awaiting approval (status SUBMITTED). Only users
 * with po.approve OR requisition.approve may call this.
 *
 * Each item includes budget context (project budget, spent-to-date,
 * remaining, utilization %) so approvers can make informed decisions.
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
        project: { select: { id: true, name: true, totalBudget: true } },
        lines: { select: { qtyOrdered: true, unitCost: true, materialId: true } },
        createdBy: { select: { id: true, name: true } },
      },
    }),
    prisma.materialRequisition.findMany({
      where: { project: { companyId: company.id }, status: "SUBMITTED" },
      orderBy: { createdAt: "desc" },
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
    }),
  ]);

  // ── Compute budget context for each project ──
  // Cache project cost lookups to avoid redundant queries
  const projectCostCache = new Map<string, number>();
  async function getProjectSpent(projectId: string | null): Promise<number | null> {
    if (!projectId) return null;
    if (projectCostCache.has(projectId)) return projectCostCache.get(projectId)!;
    try {
      const cost = await projectTotalCost(projectId);
      const spent = toNum(cost.total);
      projectCostCache.set(projectId, spent);
      return spent;
    } catch {
      return null;
    }
  }

  function computeBudgetContext(
    budget: unknown,
    spent: number | null,
    poTotal: number,
  ): {
    projectBudget: number | null;
    projectSpent: number | null;
    budgetRemaining: number | null;
    budgetUtilizationPct: number | null;
    wouldExceedBudget: boolean;
  } {
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

  // ── Urgency calculation ──
  function computeUrgency(neededBy: Date | null, createdAt: Date): string {
    const now = new Date();
    if (neededBy) {
      const diffMs = neededBy.getTime() - now.getTime();
      const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
      if (diffDays < 0) return "overdue";
      if (diffDays === 0) return "due_today";
      if (diffDays <= 7) return "due_this_week";
    }
    // Items older than 3 days with no needed-by date are somewhat urgent
    const ageDays = Math.ceil((now.getTime() - createdAt.getTime()) / (1000 * 60 * 60 * 24));
    return ageDays >= 3 ? "due_this_week" : "normal";
  }

  // ── Build PO responses with budget context ──
  const poResponses = await Promise.all(
    purchaseOrders.map(async (po) => {
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

  // ── Build requisition responses with budget context + line details ──
  const reqResponses = await Promise.all(
    requisitions.map(async (r) => {
      const spent = await getProjectSpent(r.project?.id ?? null);
      // Estimate PO total from requisition lines (qty × lastRate if available)
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

  // ── Sort by urgency: overdue → due_today → due_this_week → normal ──
  const URGENCY_ORDER: Record<string, number> = { overdue: 0, due_today: 1, due_this_week: 2, normal: 3 };
  poResponses.sort((a, b) => (URGENCY_ORDER[a.urgency] ?? 9) - (URGENCY_ORDER[b.urgency] ?? 9));
  reqResponses.sort((a, b) => (URGENCY_ORDER[a.urgency] ?? 9) - (URGENCY_ORDER[b.urgency] ?? 9));

  return json({
    purchaseOrders: poResponses,
    requisitions: reqResponses,
    requestedBy: { id: user.id, name: user.name },
  });
});
