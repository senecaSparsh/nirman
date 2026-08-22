import { Suspense } from "react";
import { MobileSkeletonList } from "@/components/mobile/mobile-skeleton";
import { connection } from "next/server";
import { notFound } from "next/navigation";
import { prisma } from "@nirman/db";
import { TrendingUp, TrendingDown, Wallet } from "lucide-react";
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
 * /m/reports/profit — mobile P&L report.
 * Monthly revenue, COGS, operating expenses, salaries → gross/net profit.
 */
export default function MobileProfitPage() {
  return (
    <Suspense fallback={<MobileSkeletonList rows={6} />}>
      <MobileProfitContent />
    </Suspense>
  );
}

async function MobileProfitContent() {
  await connection();
  const role = await getUserRole();
  if (!hasPermission(role, PERM.FINANCE_VIEW)) notFound();
  const company = await getCompany();

  const now = new Date();
  const from = new Date(now.getFullYear(), now.getMonth() - 11, 1);
  const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

  const entries = await prisma.journalEntry.findMany({
    where: { companyId: company.id, status: "POSTED", entryDate: { gte: from } },
    include: { lines: true },
    orderBy: { entryDate: "asc" },
  });

  const SALES_REVENUE = "4000";
  const COGS = "5000";
  const OPERATING_EXPENSE = "6000";
  const SALARIES_EXPENSE = "6100";

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

  if (totalRevenue === 0 && totalCogs === 0 && totalOperating === 0 && totalSalaries === 0) {
    return <MobileEmptyState icon={TrendingUp} title="No P&L data yet" hint="Post journal entries to see profit & loss" />;
  }

  const csvColumns: MobileColumnSpec[] = [
    { key: "label", label: "Month" },
    { key: "revenue", label: "Revenue", format: "currency" },
    { key: "cogs", label: "COGS", format: "currency" },
    { key: "grossProfit", label: "Gross Profit", format: "currency" },
    { key: "operating", label: "Operating Expenses", format: "currency" },
    { key: "salaries", label: "Salaries", format: "currency" },
    { key: "netProfit", label: "Net Profit", format: "currency" },
  ];

  return (
    <div>
      <MobileReportHeader
        title="Profit & Loss"
        subtitle="Income statement — revenue, COGS, and operating expenses"
        icon={TrendingUp}
        period="Last 12 months"
      />

      <MobileReportSummary
        items={[
          { label: "Revenue", value: formatCurrency(totalRevenue) },
          { label: "Gross Profit", value: formatCurrency(grossProfit), tone: grossProfit >= 0 ? "go" : "stop" },
          { label: "Net Profit", value: formatCurrency(netProfit), tone: netProfit >= 0 ? "go" : "stop" },
          { label: "Margin", value: `${margin.toFixed(1)}%`, tone: margin >= 0 ? "go" : "stop" },
        ]}
      />

      <div className="mb-4">
        <MobileExportShareBar
          title="Profit & Loss Report"
          rows={monthly as unknown as Record<string, unknown>[]}
          columns={csvColumns}
          summary={`Revenue: ${formatCurrency(totalRevenue)} · Net Profit: ${formatCurrency(netProfit)} · Margin: ${margin.toFixed(1)}%`}
        />
      </div>

      {/* Revenue vs Net Profit — bar chart */}
      <MobileSectionTitle>Revenue vs Net Profit</MobileSectionTitle>
      <div className="mb-4">
        <MobileBarChart
          data={monthly.map((m) => ({
            label: m.label,
            value: m.revenue,
            tone: "go" as const,
          }))}
          formatValue={(v) => formatCurrency(v)}
        />
      </div>

      {/* Cost breakdown */}
      <MobileSectionTitle>Cost Breakdown</MobileSectionTitle>
      <div className="flex flex-col gap-2 mb-4">
        <MobileRow icon={TrendingDown} title="COGS" subtitle="Cost of goods sold" meta={formatCurrency(totalCogs)} tone="danger" />
        <MobileRow icon={Wallet} title="Operating Expenses" subtitle="Admin, utilities, etc." meta={formatCurrency(totalOperating)} tone="danger" />
        <MobileRow icon={Wallet} title="Salaries" subtitle="Payroll expenses" meta={formatCurrency(totalSalaries)} tone="danger" />
      </div>

      {/* Monthly trend */}
      <MobileSectionTitle>Monthly Trend</MobileSectionTitle>
      <div className="flex flex-col gap-2">
        {monthly.map((m) => (
          <MobileRow
            key={m.label}
            title={m.label}
            subtitle={`Rev ${formatCurrency(m.revenue)} · GP ${formatCurrency(m.grossProfit)}`}
            meta={formatCurrency(m.netProfit)}
            metaSub={m.revenue > 0 ? `${((m.netProfit / m.revenue) * 100).toFixed(0)}%` : "—"}
            tone={m.netProfit >= 0 ? "success" : "danger"}
          />
        ))}
      </div>
    </div>
  );
}
