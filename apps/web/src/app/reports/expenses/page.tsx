import { Suspense } from "react";
import { connection } from "next/server";
import { prisma } from "@nirman/db";
import { getCompany, toNum, getUserRole } from "@/lib/server";
import { formatCurrency } from "@/lib/utils";
import { PERM, hasPermission } from "@/lib/roles";
import { PageHeader } from "@/components/page-header";
import { PageLoading } from "@/components/page-loading";
import { ExpensesReport } from "@/components/reports/expenses-report";

import { NoAccess } from "@/components/no-access";
export default function ExpensesReportPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  return (
    <div className="space-y-6">
      <Suspense fallback={<PageLoading label="Loading expenses report…" variant="cards" />}>
        <ExpensesReportContent searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function ExpensesReportContent({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  await connection();
  const { from: fromParam, to: toParam } = await searchParams;
  const role = await getUserRole();
  const company = await getCompany();

  if (!hasPermission(role, PERM.FINANCE_VIEW)) {
    return (
      <NoAccess what="the expenses report" />
    );
  }

  // Default to current financial year (Apr 1 → Mar 31) if no range given
  const now = new Date();
  const fyStart = new Date(now.getFullYear() - (now.getMonth() < 3 ? 1 : 0), 3, 1);
  const fromDate = fromParam ? new Date(fromParam) : fyStart;
  const toDate = toParam ? new Date(toParam) : now;
  toDate.setHours(23, 59, 59, 999);
  const from = fromDate.toISOString().slice(0, 10);
  const to = toDate.toISOString().slice(0, 10);

  const dateFilter = { date: { gte: fromDate, lte: toDate } };

  const expenses = await prisma.expense.findMany({
    where: {
      companyId: company.id,
      ...dateFilter,
    },
    include: {
      project: { select: { id: true, name: true } },
    },
    orderBy: { date: "desc" },
  });

  const projectCosts = await prisma.projectCost.findMany({
    where: {
      project: { companyId: company.id },
      ...dateFilter,
    },
    include: {
      project: { select: { id: true, name: true } },
    },
    orderBy: { date: "desc" },
  });

  const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

  // Monthly aggregation — group by month within the selected range
  const monthlyMap = new Map<string, { label: string; operating: number; project: number }>();
  const cursor = new Date(fromDate.getFullYear(), fromDate.getMonth(), 1);
  const endMonth = new Date(toDate.getFullYear(), toDate.getMonth(), 1);
  while (cursor <= endMonth) {
    const key = `${cursor.getFullYear()}-${cursor.getMonth()}`;
    monthlyMap.set(key, { label: `${MONTHS[cursor.getMonth()]} ${String(cursor.getFullYear()).slice(2)}`, operating: 0, project: 0 });
    cursor.setMonth(cursor.getMonth() + 1);
  }
  for (const e of expenses) {
    const d = new Date(e.date);
    const key = `${d.getFullYear()}-${d.getMonth()}`;
    const row = monthlyMap.get(key);
    if (row) row.operating += toNum(e.amount);
  }
  for (const c of projectCosts) {
    const d = new Date(c.date);
    const key = `${d.getFullYear()}-${d.getMonth()}`;
    const row = monthlyMap.get(key);
    if (row) row.project += toNum(c.amount);
  }
  const monthly = Array.from(monthlyMap.values());

  // By category (operating expenses)
  const byCategory = new Map<string, { category: string; amount: number; count: number }>();
  for (const e of expenses) {
    const cat = e.category || "Uncategorized";
    if (!byCategory.has(cat)) byCategory.set(cat, { category: cat, amount: 0, count: 0 });
    const row = byCategory.get(cat)!;
    row.amount += toNum(e.amount);
    row.count += 1;
  }
  const categoryRows = Array.from(byCategory.values()).sort((a, b) => b.amount - a.amount);

  // By project
  const byProject = new Map<string, { project: string; amount: number }>();
  for (const c of projectCosts) {
    const name = c.project.name;
    if (!byProject.has(name)) byProject.set(name, { project: name, amount: 0 });
    byProject.get(name)!.amount += toNum(c.amount);
  }
  for (const e of expenses) {
    if (!e.project) continue;
    const name = e.project.name;
    if (!byProject.has(name)) byProject.set(name, { project: name, amount: 0 });
    byProject.get(name)!.amount += toNum(e.amount);
  }
  const projectRows = Array.from(byProject.values()).sort((a, b) => b.amount - a.amount);

  const totalOperating = monthly.reduce((s, m) => s + m.operating, 0);
  const totalProject = monthly.reduce((s, m) => s + m.project, 0);
  const total = totalOperating + totalProject;

  return (
    <>
      <PageHeader
        title="Expenses"
        description="Operating expenses and project costs over the selected period — where the money goes."
        stats={[
          { label: "Total", value: formatCurrency(total) },
          { label: "Operating", value: formatCurrency(totalOperating) },
          { label: "Project Costs", value: formatCurrency(totalProject) },
          { label: "Categories", value: categoryRows.length },
        ]}
      />
      <ExpensesReport
        from={from}
        to={to}
        monthly={monthly}
        categoryRows={categoryRows}
        projectRows={projectRows}
        totalOperating={totalOperating}
        totalProject={totalProject}
      />
    </>
  );
}
