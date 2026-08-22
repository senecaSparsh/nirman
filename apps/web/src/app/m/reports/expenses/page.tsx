import { Suspense } from "react";
import { MobileSkeletonList } from "@/components/mobile/mobile-skeleton";
import { connection } from "next/server";
import { notFound } from "next/navigation";
import { prisma } from "@nirman/db";
import { Wallet, Building2, TrendingUp, Tags } from "lucide-react";
import { getCompany, toNum, getUserRole } from "@/lib/server";
import { PERM, hasPermission } from "@/lib/roles";
import { formatCurrency } from "@/lib/utils";
import {
  MobileSectionTitle,
  MobileRow,
  MobileEmptyState,
} from "@/components/mobile/v2/primitives";
import { MobileReportHeader, MobileReportSummary, MobileBarChart } from "@/components/mobile/v2/report-ui";
import { MobileExportShareBar } from "@/components/mobile/v2/export-share-bar";
import type { MobileColumnSpec } from "@/components/mobile/v2/export-share-bar";

/**
 * /m/reports/expenses — mobile expenses report.
 * Shows operating expenses and project costs for the current FY.
 */
export default function MobileExpensesPage() {
  return (
    <Suspense fallback={<MobileSkeletonList rows={6} />}>
      <MobileExpensesContent />
    </Suspense>
  );
}

async function MobileExpensesContent() {
  await connection();
  const role = await getUserRole();
  if (!hasPermission(role, PERM.FINANCE_VIEW)) notFound();
  const company = await getCompany();

  // Default to current financial year (Apr 1 → Mar 31)
  const now = new Date();
  const fyStart = new Date(now.getFullYear() - (now.getMonth() < 3 ? 1 : 0), 3, 1);
  const fromDate = fyStart;
  const toDate = now;
  toDate.setHours(23, 59, 59, 999);

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

  if (expenses.length === 0 && projectCosts.length === 0) {
    return (
      <MobileEmptyState
        icon={Wallet}
        title="No expenses this FY"
        hint="Operating expenses and project costs will appear here"
      />
    );
  }

  const fyLabel = `FY ${fromDate.getFullYear()}-${String(fromDate.getFullYear() + 1).slice(2)}`;

  const monthlyCsvColumns: MobileColumnSpec[] = [
    { key: "label", label: "Month" },
    { key: "operating", label: "Operating", format: "currency" },
    { key: "project", label: "Project", format: "currency" },
  ];

  const categoryCsvColumns: MobileColumnSpec[] = [
    { key: "category", label: "Category" },
    { key: "amount", label: "Amount", format: "currency" },
    { key: "count", label: "Count" },
  ];

  return (
    <div>
      <MobileReportHeader
        title="Expenses"
        subtitle="Operating expenses and project costs"
        icon={Wallet}
        period={fyLabel}
      />

      <MobileReportSummary
        items={[
          { label: "Operating", value: formatCurrency(totalOperating) },
          { label: "Project", value: formatCurrency(totalProject), tone: "signal" },
          { label: "Total", value: formatCurrency(total), tone: total > 0 ? "signal" : "default" },
          { label: "Categories", value: String(categoryRows.length) },
        ]}
      />

      <div className="mb-4">
        <MobileExportShareBar
          title="Expenses Report"
          rows={monthly as unknown as Record<string, unknown>[]}
          columns={monthlyCsvColumns}
          summary={`Operating: ${formatCurrency(totalOperating)} · Project: ${formatCurrency(totalProject)} · Total: ${formatCurrency(total)}`}
        />
      </div>

      {/* Monthly operating vs project — bar chart */}
      <MobileSectionTitle>Monthly Operating vs Project</MobileSectionTitle>
      <div className="mb-4">
        <MobileBarChart
          data={monthly.map((m) => ({
            label: m.label,
            value: m.operating + m.project,
            tone: (m.project > m.operating ? "signal" : "default") as "signal" | "default",
          }))}
          formatValue={(v) => formatCurrency(v)}
        />
      </div>

      {/* Monthly breakdown */}
      <MobileSectionTitle>Monthly Breakdown</MobileSectionTitle>
      <div className="flex flex-col gap-2 mb-4">
        {monthly.map((m) => (
          <MobileRow
            key={m.label}
            icon={Wallet}
            title={m.label}
            subtitle={`Op ${formatCurrency(m.operating)} · Proj ${formatCurrency(m.project)}`}
            meta={formatCurrency(m.operating + m.project)}
            tone="default"
          />
        ))}
      </div>

      {/* By Category */}
      {categoryRows.length > 0 && (
        <>
          <MobileSectionTitle>By Category</MobileSectionTitle>
          <div className="mb-4">
            <MobileExportShareBar
              title="Expenses By Category"
              rows={categoryRows as unknown as Record<string, unknown>[]}
              columns={categoryCsvColumns}
              summary={`${categoryRows.length} categories · ${formatCurrency(categoryRows.reduce((s, c) => s + c.amount, 0))}`}
            />
          </div>
          <div className="flex flex-col gap-2 mb-4">
            {categoryRows.map((c) => (
              <MobileRow
                key={c.category}
                icon={Tags}
                title={c.category}
                subtitle={`${c.count} entr${c.count > 1 ? "ies" : "y"}`}
                meta={formatCurrency(c.amount)}
                tone="default"
              />
            ))}
          </div>
        </>
      )}

      {/* By Project */}
      {projectRows.length > 0 && (
        <>
          <MobileSectionTitle>By Project</MobileSectionTitle>
          <div className="flex flex-col gap-2">
            {projectRows.map((p) => (
              <MobileRow
                key={p.project}
                icon={Building2}
                title={p.project}
                subtitle="Project costs"
                meta={formatCurrency(p.amount)}
                tone="default"
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
