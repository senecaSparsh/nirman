import { Suspense } from "react";
import { prisma, type DprApprovalStatus } from "@nirman/db";
import { getCompany, getUserPermissions, getCurrentUser, toNum, scopeWhere } from "@/lib/server";
import { PERM } from "@/lib/roles";
import { PageHeader } from "@/components/page-header";
import { PageLoading } from "@/components/page-loading";
import { NoAccess } from "@/components/no-access";
import { ApprovalsView } from "@/components/approvals/approvals-view";
import { ClaimApprovalList, type ApprovalClaimRow } from "@/components/approvals/claim-approval-list";
import type { ExpenseCategoryRow } from "@/lib/types";
import type { ApprovalPORow, ApprovalReqRow, ApprovalGatePassRow, ApprovalDprRow, ApprovalExpenseRow } from "@/lib/types";

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
  const canApproveGatePass = perms.includes(PERM.GATE_PASS_APPROVE);
  const canApproveDprSubAdmin = perms.includes(PERM.DPR_APPROVE_SUB_ADMIN);
  const canApproveDprAdmin = perms.includes(PERM.DPR_APPROVE_ADMIN);
  const canApproveExpense = perms.includes(PERM.EXPENSE_APPROVE);

  if (!canApprovePo && !canApproveReq && !canApproveGatePass && !canApproveDprSubAdmin && !canApproveDprAdmin && !canApproveExpense) {
    return <NoAccess what="the approval queue" />;
  }

  const company = await getCompany();
  const user = await getCurrentUser();
  const userId = user?.id ?? "";

  // DPRs pending sub-admin approval (SUBMITTED) or admin approval (SUB_ADMIN_APPROVED)
  const dprApprovalStatuses: DprApprovalStatus[] = [];
  if (canApproveDprSubAdmin) dprApprovalStatuses.push("SUBMITTED");
  if (canApproveDprAdmin) dprApprovalStatuses.push("SUB_ADMIN_APPROVED");

  const [purchaseOrders, requisitions, gatePasses, dprs, expenses, pendingClaims, claimCategories] = await Promise.all([
    canApprovePo
      ? prisma.purchaseOrder.findMany({
          where: { companyId: company.id, status: "DRAFT", createdById: { not: userId } },
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
          where: {...await scopeWhere("MaterialRequisition"),  project: { companyId: company.id }, status: "SUBMITTED", requestedById: { not: userId } },
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
    canApproveGatePass
      ? prisma.gatePass.findMany({
          where: { companyId: company.id, status: "PENDING", createdById: { not: userId } },
          orderBy: { createdAt: "desc" },
          take: 50,
          include: {
            lines: { select: { id: true } },
            location: { select: { name: true } },
            createdBy: { select: { name: true } },
          },
        })
      : [],
    dprApprovalStatuses.length > 0
      ? prisma.dailyProgressReport.findMany({
          where: { companyId: company.id, approvalStatus: { in: dprApprovalStatuses }, submittedById: { not: userId } },
          orderBy: { createdAt: "desc" },
          take: 50,
          include: {
            project: { select: { name: true } },
            submittedBy: { select: { name: true } },
          },
        })
      : [],
    canApproveExpense
      ? prisma.expense.findMany({
          where: { companyId: company.id, status: "PENDING", submittedById: { not: userId } },
          orderBy: { createdAt: "desc" },
          take: 50,
          include: {
            project: { select: { name: true } },
            createdBy: { select: { name: true } },
          },
        })
      : [],
    canApproveExpense
      ? prisma.expenseClaim.findMany({
          where: { companyId: company.id, status: "SUBMITTED", claimantId: { not: userId } },
          orderBy: { createdAt: "desc" },
          take: 50,
          include: {
            claimant: { select: { name: true } },
            project: { select: { name: true } },
            lines: { select: { id: true } },
          },
        })
      : [],
    canApproveExpense
      ? prisma.expenseCategory.findMany({
          where: { companyId: company.id, isActive: true },
          select: { id: true, name: true, glAccountCode: true, description: true, isActive: true },
          orderBy: { name: "asc" },
        })
      : [],
  ]);

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
        waitingOn: "Project Director / Procurement Manager",
        ...ctx,
        urgency: computeUrgency(po.expectedDate, po.createdAt),
      };
    }),
  );

  const reqRows: ApprovalReqRow[] = await Promise.all(
    requisitions.map(async (r) => {
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
        waitingOn: "Project Director / Procurement Manager",
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

  const gatePassRows: ApprovalGatePassRow[] = gatePasses.map((gp) => ({
    id: gp.id,
    gatePassNumber: gp.gatePassNumber,
    category: gp.category,
    locationName: gp.location.name,
    destination: gp.destination,
    vehicleNumber: gp.vehicleNumber,
    driverName: gp.driverName,
    createdByName: gp.createdBy?.name ?? null,
    createdAt: gp.createdAt.toISOString(),
    lineCount: gp.lines.length,
    canApprove: canApproveGatePass,
    waitingOn: "Store Keeper / Supervisor",
    urgency: computeUrgency(null, gp.createdAt),
  }));
  gatePassRows.sort((a, b) => (URGENCY_ORDER[a.urgency] ?? 9) - (URGENCY_ORDER[b.urgency] ?? 9));

  const dprRows: ApprovalDprRow[] = dprs.map((d) => ({
    id: d.id,
    projectName: d.project?.name ?? null,
    submittedByName: d.submittedBy?.name ?? null,
    createdAt: d.createdAt.toISOString(),
    date: d.date.toISOString(),
    approvalStatus: String(d.approvalStatus),
    workSummary: d.workSummary,
    progressPct: toNum(d.progressPct),
    canApproveSubAdmin: canApproveDprSubAdmin && d.approvalStatus === "SUBMITTED",
    canApproveAdmin: canApproveDprAdmin && d.approvalStatus === "SUB_ADMIN_APPROVED",
    waitingOn: d.approvalStatus === "SUBMITTED" ? "Project Manager / HR Manager (Sub-Admin)" : "Project Director / Owner (Admin)",
    urgency: computeUrgency(null, d.createdAt),
  }));
  dprRows.sort((a, b) => (URGENCY_ORDER[a.urgency] ?? 9) - (URGENCY_ORDER[b.urgency] ?? 9));

  const expenseRows: ApprovalExpenseRow[] = expenses.map((e) => ({
    id: e.id,
    category: e.category,
    categoryName: e.category,
    amount: toNum(e.amount),
    subtotal: toNum(e.amount),
    cgst: 0,
    sgst: 0,
    igst: 0,
    tdsAmount: 0,
    projectName: e.project?.name ?? null,
    payeeName: e.payeeName,
    supplierName: null,
    paymentMode: null,
    receiptUrl: null,
    submittedByName: e.createdBy?.name ?? null,
    submittedAt: e.createdAt.toISOString(),
    date: e.createdAt.toISOString(),
    notes: null,
    canApprove: canApproveExpense,
    waitingOn: "Finance Head / Accountant",
  }));

  const claimRows: ApprovalClaimRow[] = pendingClaims.map((c) => ({
    id: c.id,
    claimantName: c.claimant?.name ?? "Unknown",
    projectName: c.project?.name ?? null,
    totalAmount: toNum(c.totalAmount),
    lineCount: c.lines.length,
    description: c.description,
    submittedAt: c.submittedAt?.toISOString() ?? null,
    canApprove: c.claimantId !== userId,
  }));

  const claimCategoryRows: ExpenseCategoryRow[] = claimCategories.map((cat) => ({
    id: cat.id,
    name: cat.name,
    glAccountCode: cat.glAccountCode,
    description: cat.description,
    isActive: cat.isActive,
  }));

  return (
    <div className="space-y-6">
      <ApprovalsView
      purchaseOrders={poRows}
      requisitions={reqRows}
      gatePasses={gatePassRows}
      dprs={dprRows}
      expenses={expenseRows}
    />
    {claimRows.length > 0 && (
      <ClaimApprovalList claims={claimRows} categories={claimCategoryRows} />
    )}
    </div>
  );
}
