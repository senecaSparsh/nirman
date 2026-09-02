import { Suspense } from "react";
import { connection } from "next/server";
import { prisma } from "@nirman/db";
import { getCompany, getUserRole, toNum } from "@/lib/server";
import { PERM, hasPermission } from "@/lib/roles";
import { formatCurrency } from "@/lib/utils";
import { PageHeader } from "@/components/page-header";
import { PageLoading } from "@/components/page-loading";
import { NoAccess } from "@/components/no-access";
import { RecurringExpensesView } from "@/components/expenses/recurring-expenses-view";
import type { ProjectOption } from "@/lib/types";

export const metadata = { title: "Recurring Expenses · Nirman" };

export default function RecurringExpensesPage() {
  return (
    <div className="space-y-6">
      <Suspense fallback={<PageLoading label="Loading recurring expenses…" variant="list" />}>
        <RecurringContent />
      </Suspense>
    </div>
  );
}

async function RecurringContent() {
  await connection();
  const role = await getUserRole();
  const company = await getCompany();

  if (!hasPermission(role, PERM.FINANCE_VIEW)) {
    return <NoAccess what="recurring expenses" />;
  }

  const perms = {
    canManage: hasPermission(role, PERM.FINANCE_MANAGE),
  };

  const [items, projects, suppliers, categories] = await Promise.all([
    prisma.recurringExpense.findMany({
      where: { companyId: company.id },
      orderBy: { nextRunDate: "asc" },
      include: {
        project: { select: { id: true, name: true } },
        categoryMaster: { select: { id: true, name: true } },
        supplier: { select: { id: true, name: true } },
      },
    }),
    prisma.project.findMany({
      take: 200,
      where: { companyId: company.id, deletedAt: null },
      orderBy: { name: "asc" },
      select: { id: true, name: true, type: true, status: true },
    }),
    prisma.supplier.findMany({
      take: 200,
      where: { deletedAt: null, companyId: company.id },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    prisma.expenseCategory.findMany({
      where: { companyId: company.id, isActive: true },
      orderBy: { name: "asc" },
    }),
  ]);

  const rows = items.map((r) => ({
    id: r.id,
    category: r.category,
    categoryName: r.categoryMaster?.name ?? null,
    amount: toNum(r.amount),
    frequency: r.frequency,
    startDate: r.startDate.toISOString(),
    endDate: r.endDate?.toISOString() ?? null,
    nextRunDate: r.nextRunDate.toISOString(),
    lastRunDate: r.lastRunDate?.toISOString() ?? null,
    isActive: r.isActive,
    projectId: r.projectId,
    projectName: r.project?.name ?? null,
    payeeName: r.payeeName,
    supplierId: r.supplierId,
    supplierName: r.supplier?.name ?? null,
    paymentMode: r.paymentMode,
    notes: r.notes,
  }));

  const projectOptions: ProjectOption[] = projects.map((p) => ({
    id: p.id, name: p.name, type: p.type, status: p.status,
  }));

  const totalMonthly = rows.filter((r) => r.isActive).reduce((s, r) => {
    const monthly = r.frequency === "WEEKLY" ? r.amount * 4.33
      : r.frequency === "MONTHLY" ? r.amount
      : r.frequency === "QUARTERLY" ? r.amount / 3
      : r.amount / 12;
    return s + monthly;
  }, 0);

  const dueCount = rows.filter((r) => r.isActive && new Date(r.nextRunDate) <= new Date()).length;

  return (
    <>
      <PageHeader
        title="Recurring Expenses"
        description="Templates for periodic expenses like rent, salaries, and AMC. The scheduler auto-generates DRAFT expense rows on each due date."
        stats={[
          { label: "Monthly Run-rate", value: formatCurrency(totalMonthly), hint: "Estimated monthly cost from all active recurring templates." },
          { label: "Due Now", value: dueCount, tone: dueCount > 0 ? "warning" : "muted", hint: "Templates whose next run date has passed — generate drafts now." },
          { label: "Active", value: rows.filter((r) => r.isActive).length, hint: "Active recurring templates." },
          { label: "Total", value: rows.length, hint: "All recurring templates (active + paused)." },
        ]}
      />
      <RecurringExpensesView
        items={rows}
        projects={projectOptions}
        suppliers={suppliers}
        categories={categories}
        permissions={perms}
      />
    </>
  );
}
