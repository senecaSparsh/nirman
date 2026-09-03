import { Suspense } from "react";
import { connection } from "next/server";
import Link from "next/link";
import { prisma } from "@nirman/db";
import { getCompany, getCurrentUser, getUserPermissions, getUserScope, toNum } from "@/lib/server";
import { PERM } from "@/lib/roles";
import { PageHeader } from "@/components/page-header";
import { PageLoading } from "@/components/page-loading";
import { ApprovalsView } from "@/components/approvals/approvals-view";
import { ExpenseApprovalList } from "@/components/approvals/expense-approval-list";
import { ClaimApprovalList, type ApprovalClaimRow } from "@/components/approvals/claim-approval-list";
import { EmptyState } from "@/components/empty-state";
import { Inbox } from "lucide-react";
import type { ApprovalPORow, ApprovalReqRow, ApprovalReqLineDetail, ApprovalExpenseRow } from "@/lib/types";

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
  const canApproveGatePass = perms.includes(PERM.GATE_PASS_APPROVE);
  const canApproveExpense = perms.includes(PERM.EXPENSE_APPROVE);
  if (!canApprovePo && !canApproveReq && !canApproveGatePass && !canApproveExpense) {
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

  const [purchaseOrders, requisitions, gatePasses, pendingExpenses, pendingClaims, expenseCategories] = await Promise.all([
    canApprovePo
      ? prisma.purchaseOrder.findMany({
          take: 500,
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
          take: 500,
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
    canApproveGatePass
      ? prisma.gatePass.findMany({
          take: 500,
          where: { companyId: company.id, status: "PENDING" },
          orderBy: { createdAt: "desc" },
          include: {
            lines: { select: { qty: true } },
            location: { select: { name: true } },
            createdBy: { select: { name: true } },
          },
        })
      : [],
    canApproveExpense
      ? prisma.expense.findMany({
          take: 200,
          where: { companyId: company.id, status: "PENDING" },
          orderBy: { submittedAt: "desc" },
          include: {
            project: { select: { id: true, name: true } },
            categoryMaster: { select: { id: true, name: true } },
            supplier: { select: { id: true, name: true } },
            submittedBy: { select: { id: true, name: true } },
          },
        })
      : [],
    canApproveExpense
      ? prisma.expenseClaim.findMany({
          take: 200,
          where: { companyId: company.id, status: "SUBMITTED" },
          orderBy: { submittedAt: "desc" },
          include: {
            claimant: { select: { id: true, name: true } },
            project: { select: { id: true, name: true } },
            lines: { select: { id: true, amount: true } },
          },
        })
      : [],
    canApproveExpense
      ? prisma.expenseCategory.findMany({
          where: { companyId: company.id },
          select: { id: true, name: true, glAccountCode: true, description: true, isActive: true },
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

  const expenseRows: ApprovalExpenseRow[] = pendingExpenses.map((e) => ({
    id: e.id,
    category: e.category,
    categoryName: e.categoryMaster?.name ?? null,
    amount: toNum(e.amount),
    subtotal: toNum(e.subtotal),
    cgst: toNum(e.cgst),
    sgst: toNum(e.sgst),
    igst: toNum(e.igst),
    tdsAmount: toNum(e.tdsAmount),
    projectName: e.project?.name ?? null,
    payeeName: e.payeeName,
    supplierName: e.supplier?.name ?? null,
    paymentMode: e.paymentMode,
    receiptUrl: e.receiptUrl,
    submittedByName: e.submittedBy?.name ?? null,
    submittedAt: e.submittedAt?.toISOString() ?? null,
    date: e.date.toISOString(),
    notes: e.notes,
    canApprove: canApproveExpense && e.submittedById !== user.id,
  }));

  const claimRows: ApprovalClaimRow[] = pendingClaims.map((c) => ({
    id: c.id,
    claimantName: c.claimant.name,
    projectName: c.project?.name ?? null,
    totalAmount: toNum(c.totalAmount),
    lineCount: c.lines.length,
    description: c.description,
    submittedAt: c.submittedAt?.toISOString() ?? null,
    canApprove: canApproveExpense && c.claimantId !== user.id,
  }));

  const totalCount = poRows.length + reqRows.length + gatePasses.length + expenseRows.length + claimRows.length;
  const overdueCount = [...poRows, ...reqRows].filter((r) => r.urgency === "overdue").length;

  return (
    <>
      <PageHeader
        title="Approvals"
        description="Purchase orders, material indents, expenses, and gate passes awaiting your approval."
        stats={[
          { label: "Pending", value: totalCount, tone: totalCount > 0 ? "warning" : "muted", hint: "Total items awaiting your approval — purchase orders, indents, expenses, and gate passes." },
          { label: "Overdue", value: overdueCount, tone: overdueCount > 0 ? "danger" : "muted", hint: "Items past their expected or needed-by date." },
          { label: "POs", value: poRows.length, hint: "Draft purchase orders pending your approval before they can be ordered." },
          { label: "Indents", value: reqRows.length, hint: "Submitted material indents pending your approval before conversion to a PO." },
          ...(canApproveExpense ? [
            { label: "Expenses", value: expenseRows.length, hint: "Submitted expenses pending your approval. GL posts on approval." },
            { label: "Claims", value: claimRows.length, hint: "Submitted expense claims pending your approval. Each line becomes an expense on approval." },
          ] : []),
          ...(canApproveGatePass ? [{ label: "Gate Passes", value: gatePasses.length, hint: "Gate passes pending approval before items can leave the gate." }] : []),
        ]}
      />
      {(poRows.length > 0 || reqRows.length > 0) && (
        <ApprovalsView purchaseOrders={poRows} requisitions={reqRows} />
      )}
      {canApproveExpense && expenseRows.length > 0 && (
        <ExpenseApprovalList expenses={expenseRows} />
      )}
      {canApproveExpense && claimRows.length > 0 && (
        <ClaimApprovalList claims={claimRows} categories={expenseCategories} />
      )}
      {totalCount === 0 && (
        <EmptyState
          icon={<Inbox className="h-5 w-5" />}
          title="Nothing to approve"
          description="Items awaiting your sign-off will appear here."
        />
      )}
      {canApproveGatePass && gatePasses.length > 0 && (
        <div className="rounded-xl border border-border bg-card p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-subhead font-semibold">Gate Passes Pending Approval</h3>
            <Link href="/gate-passes" className="text-caption text-brand hover:underline">View all →</Link>
          </div>
          <div className="space-y-2">
            {gatePasses.slice(0, 5).map((gp) => (
              <Link key={gp.id} href={`/gate-passes?gp=${gp.id}`} className="flex items-center justify-between rounded-lg border border-border/40 p-2.5 hover:bg-muted/20">
                <div>
                  <div className="font-mono text-caption font-medium">{gp.gatePassNumber}</div>
                  <div className="text-meta text-muted-foreground">
                    {gp.lines.length} items · {gp.location.name}
                    {gp.destination && ` → ${gp.destination}`}
                  </div>
                </div>
                <div className="text-meta text-muted-foreground">
                  {gp.createdBy?.name ?? "—"}
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}
    </>
  );
}
