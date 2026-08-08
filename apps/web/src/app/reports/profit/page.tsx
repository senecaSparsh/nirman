import { Suspense } from "react";
import { connection } from "next/server";
import { prisma } from "@nirman/db";
import { getCompany, toNum, getUserRole } from "@/lib/server";
import { formatCurrency } from "@/lib/utils";
import { PERM, hasPermission } from "@/lib/roles";
import { PageHeader } from "@/components/page-header";
import { PageLoading } from "@/components/page-loading";
import { ProfitReport } from "@/components/reports/profit-report";

import { NoAccess } from "@/components/no-access";
export default function ProfitReportPage() {
  return (
    <div className="space-y-5">
      <Suspense fallback={<PageLoading label="Loading P&L report…" variant="cards" />}>
        <ProfitReportContent />
      </Suspense>
    </div>
  );
}

async function ProfitReportContent() {
  await connection();
  const role = await getUserRole();
  const company = await getCompany();

  if (!hasPermission(role, PERM.FINANCE_VIEW)) {
    return (
      <NoAccess what="the profit & loss report" />
    );
  }

  // Last 12 months
  const now = new Date();
  const from = new Date(now.getFullYear(), now.getMonth() - 11, 1);

  // Pull all journal entries in the window with their lines
  const entries = await prisma.journalEntry.findMany({
    where: {
      companyId: company.id,
      status: "POSTED",
      entryDate: { gte: from },
    },
    include: { lines: true },
    orderBy: { entryDate: "asc" },
  });

  const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

  // Account codes (from ACCT const in gl-posting.ts)
  const SALES_REVENUE = "4000";
  const COGS = "5000";
  const OPERATING_EXPENSE = "6000";
  const SALARIES_EXPENSE = "6100";

  // Initialize monthly buckets
  const monthlyMap = new Map<string, { label: string; revenue: number; cogs: number; operating: number; salaries: number }>();
  for (let i = 11; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const key = `${d.getFullYear()}-${d.getMonth()}`;
    monthlyMap.set(key, { label: `${MONTHS[d.getMonth()]} ${String(d.getFullYear()).slice(2)}`, revenue: 0, cogs: 0, operating: 0, salaries: 0 });
  }

  for (const entry of entries) {
    const d = new Date(entry.entryDate);
    const key = `${d.getFullYear()}-${d.getMonth()}`;
    const row = monthlyMap.get(key);
    if (!row) continue;
    for (const line of entry.lines) {
      const debit = toNum(line.debit);
      const credit = toNum(line.credit);
      // Revenue is credited; expenses are debited
      if (line.accountCode === SALES_REVENUE) row.revenue += credit;
      else if (line.accountCode === COGS) row.cogs += debit;
      else if (line.accountCode === OPERATING_EXPENSE) row.operating += debit;
      else if (line.accountCode === SALARIES_EXPENSE) row.salaries += debit;
    }
  }

  const monthly = Array.from(monthlyMap.values()).map((m) => ({
    ...m,
    grossProfit: m.revenue - m.cogs,
    netProfit: m.revenue - m.cogs - m.operating - m.salaries,
  }));

  const totalRevenue = monthly.reduce((s, m) => s + m.revenue, 0);
  const totalCogs = monthly.reduce((s, m) => s + m.cogs, 0);
  const totalOperating = monthly.reduce((s, m) => s + m.operating, 0);
  const totalSalaries = monthly.reduce((s, m) => s + m.salaries, 0);
  const grossProfit = totalRevenue - totalCogs;
  const netProfit = grossProfit - totalOperating - totalSalaries;
  const margin = totalRevenue > 0 ? (netProfit / totalRevenue) * 100 : 0;

  return (
    <>
      <PageHeader
        title="Profit & Loss"
        description="Company-wide income statement — revenue, COGS, and operating expenses over the last 12 months."
        stats={[
          { label: "Revenue (12mo)", value: formatCurrency(totalRevenue) },
          { label: "Gross Profit", value: formatCurrency(grossProfit) },
          { label: "Net Profit", value: formatCurrency(netProfit) },
          { label: "Margin", value: `${margin.toFixed(1)}%` },
        ]}
      />
      <ProfitReport
        monthly={monthly}
        totalRevenue={totalRevenue}
        totalCogs={totalCogs}
        totalOperating={totalOperating}
        totalSalaries={totalSalaries}
        grossProfit={grossProfit}
        netProfit={netProfit}
      />
    </>
  );
}
