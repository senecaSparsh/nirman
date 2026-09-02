import { Suspense } from "react";
import { connection } from "next/server";
import { prisma } from "@nirman/db";
import { getExpenseBudgetVariance } from "@nirman/services";
import { getCompany, getUserRole, toNum } from "@/lib/server";
import { PERM, hasPermission } from "@/lib/roles";
import { formatCurrency } from "@/lib/utils";
import { PageHeader } from "@/components/page-header";
import { PageLoading } from "@/components/page-loading";
import { NoAccess } from "@/components/no-access";
import { ExpenseBudgetsView } from "@/components/expenses/expense-budgets-view";
import type { ProjectOption } from "@/lib/types";

export const metadata = { title: "Expense Budgets · Nirman" };

export default function ExpenseBudgetsPage() {
  return (
    <div className="space-y-6">
      <Suspense fallback={<PageLoading label="Loading budgets…" variant="list" />}>
        <BudgetsContent />
      </Suspense>
    </div>
  );
}

async function BudgetsContent() {
  await connection();
  const role = await getUserRole();
  const company = await getCompany();

  if (!hasPermission(role, PERM.FINANCE_VIEW)) {
    return <NoAccess what="expense budgets" />;
  }

  const perms = {
    canManage: hasPermission(role, PERM.FINANCE_MANAGE),
  };

  const [budgets, projects, categories, variance] = await Promise.all([
    prisma.expenseBudget.findMany({
      where: { companyId: company.id },
      orderBy: { periodStart: "desc" },
      include: {
        project: { select: { id: true, name: true } },
        categoryMaster: { select: { id: true, name: true } },
      },
    }),
    prisma.project.findMany({
      take: 200,
      where: { companyId: company.id, deletedAt: null },
      orderBy: { name: "asc" },
      select: { id: true, name: true, type: true, status: true },
    }),
    prisma.expenseCategory.findMany({
      where: { companyId: company.id, isActive: true },
      orderBy: { name: "asc" },
    }),
    getExpenseBudgetVariance(company.id),
  ]);

  const varianceMap = new Map(variance.map((v) => [v.budgetId, v]));

  const rows = budgets.map((b) => {
    const v = varianceMap.get(b.id);
    return {
      id: b.id,
      category: b.category,
      categoryName: b.categoryMaster?.name ?? null,
      amount: toNum(b.amount),
      periodStart: b.periodStart.toISOString(),
      periodEnd: b.periodEnd.toISOString(),
      projectId: b.projectId,
      projectName: b.project?.name ?? null,
      notes: b.notes,
      actualAmount: v?.actualAmount ?? 0,
      variance: v?.variance ?? toNum(b.amount),
      utilizationPct: v?.utilizationPct ?? 0,
    };
  });

  const projectOptions: ProjectOption[] = projects.map((p) => ({
    id: p.id, name: p.name, type: p.type, status: p.status,
  }));

  const totalBudget = rows.reduce((s, b) => s + b.amount, 0);
  const totalActual = rows.reduce((s, b) => s + b.actualAmount, 0);
  const overBudget = rows.filter((r) => r.variance < 0).length;

  return (
    <>
      <PageHeader
        title="Expense Budgets"
        description="Set budgets per category and period, then track budget-vs-actuals variance. Actuals are summed from approved expenses."
        stats={[
          { label: "Total Budget", value: formatCurrency(totalBudget), hint: "Sum of all active budget allocations." },
          { label: "Actual Spend", value: formatCurrency(totalActual), tone: totalActual > totalBudget ? "danger" : "muted", hint: "Sum of approved expenses against all budgets." },
          { label: "Remaining", value: formatCurrency(totalBudget - totalActual), tone: totalBudget - totalActual < 0 ? "danger" : "success", hint: "Budget minus actual spend." },
          { label: "Over Budget", value: overBudget, tone: overBudget > 0 ? "danger" : "muted", hint: "Number of budgets where actuals exceed the allocation." },
        ]}
      />
      <ExpenseBudgetsView
        budgets={rows}
        projects={projectOptions}
        categories={categories}
        permissions={perms}
      />
    </>
  );
}
