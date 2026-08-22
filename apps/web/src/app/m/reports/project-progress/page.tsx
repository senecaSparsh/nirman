import { Suspense } from "react";
import { MobileSkeletonList } from "@/components/mobile/mobile-skeleton";
import { connection } from "next/server";
import { notFound } from "next/navigation";
import { prisma } from "@nirman/db";
import { projectPnl } from "@nirman/services";
import { Building2, TrendingUp, TrendingDown, Wallet, Gauge } from "lucide-react";
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
 * /m/reports/project-progress — mobile project progress report.
 * Per-project P&L, budget, cost, revenue, profit, margin, and latest DPR
 * progress % for the current company.
 */
export default function MobileProjectProgressPage() {
  return (
    <Suspense fallback={<MobileSkeletonList rows={6} />}>
      <MobileProjectProgressContent />
    </Suspense>
  );
}

async function MobileProjectProgressContent() {
  await connection();
  const role = await getUserRole();
  if (
    !hasPermission(role, PERM.FINANCE_VIEW) &&
    !hasPermission(role, PERM.INVENTORY_VIEW) &&
    !hasPermission(role, PERM.SALES_VIEW)
  )
    notFound();
  const company = await getCompany();

  const projects = await prisma.project.findMany({
    where: { companyId: company.id, deletedAt: null },
    select: {
      id: true,
      name: true,
      type: true,
      status: true,
      totalBudget: true,
      totalProjectCost: true,
      costPerSqft: true,
      totalSellableArea: true,
      phases: { select: { id: true, name: true, status: true } },
      _count: { select: { builtUnits: true } },
    },
    orderBy: { name: "asc" },
  });

  // Latest DPR progress % per project
  const latestDprs = await prisma.dailyProgressReport.findMany({
    where: { companyId: company.id },
    orderBy: { date: "desc" },
    distinct: ["projectId"],
    select: { projectId: true, progressPct: true, date: true },
  });
  const progressByProject = new Map(
    latestDprs.map((d) => [d.projectId, { progressPct: toNum(d.progressPct), date: d.date.toISOString() }]),
  );

  // P&L per project
  const rows = await Promise.all(
    projects.map(async (p) => {
      const pnl = await projectPnl(p.id);
      const prog = progressByProject.get(p.id);
      return {
        id: p.id,
        name: p.name,
        type: p.type,
        status: p.status,
        budget: toNum(p.totalBudget),
        totalCost: toNum(pnl.total),
        revenue: toNum(pnl.revenue),
        profit: toNum(pnl.profit),
        margin: toNum(pnl.margin),
        progressPct: prog?.progressPct ?? 0,
        unitCount: p._count.builtUnits,
        phaseCount: p.phases.length,
      };
    }),
  );

  const totalCost = rows.reduce((s, r) => s + r.totalCost, 0);
  const totalRevenue = rows.reduce((s, r) => s + r.revenue, 0);
  const totalProfit = rows.reduce((s, r) => s + r.profit, 0);

  if (rows.length === 0) {
    return (
      <MobileEmptyState
        icon={Building2}
        title="No projects found"
        hint="Projects for this company will appear here once created"
      />
    );
  }

  const csvColumns: MobileColumnSpec[] = [
    { key: "name", label: "Project" },
    { key: "type", label: "Type" },
    { key: "status", label: "Status" },
    { key: "budget", label: "Budget", format: "currency" },
    { key: "totalCost", label: "Total Cost", format: "currency" },
    { key: "revenue", label: "Revenue", format: "currency" },
    { key: "profit", label: "Profit", format: "currency" },
    { key: "margin", label: "Margin %", format: "percent" },
    { key: "progressPct", label: "Progress %", format: "percent" },
  ];

  return (
    <div>
      <MobileReportHeader
        title="Project Progress"
        subtitle="Per-project P&L, budget, and DPR progress"
        icon={Gauge}
        period="All Projects"
      />

      <MobileReportSummary
        items={[
          { label: "Total Cost", value: formatCurrency(totalCost) },
          { label: "Total Revenue", value: formatCurrency(totalRevenue), tone: "go" },
          { label: "Total Profit", value: formatCurrency(totalProfit), tone: totalProfit >= 0 ? "go" : "stop" },
          { label: "Projects", value: String(rows.length) },
        ]}
      />

      <div className="mb-4">
        <MobileExportShareBar
          title="Project Progress Report"
          rows={rows as unknown as Record<string, unknown>[]}
          columns={csvColumns}
          summary={`Revenue: ${formatCurrency(totalRevenue)} · Profit: ${formatCurrency(totalProfit)} · ${rows.length} projects`}
        />
      </div>

      {/* Profit by project — bar chart */}
      <MobileSectionTitle>Profit by Project</MobileSectionTitle>
      <div className="mb-4">
        <MobileBarChart
          data={rows.map((r) => ({
            label: r.name,
            value: r.profit,
            tone: r.profit >= 0 ? ("go" as const) : ("stop" as const),
          }))}
          formatValue={(v) => formatCurrency(v)}
        />
      </div>

      {/* Per-project */}
      <MobileSectionTitle>Projects</MobileSectionTitle>
      <div className="flex flex-col gap-2">
        {rows.map((r) => (
          <MobileRow
            key={r.id}
            icon={Building2}
            title={r.name}
            subtitle={`${r.progressPct.toFixed(1)}% complete · ${r.unitCount} units · ${r.phaseCount} phases`}
            meta={formatCurrency(r.profit)}
            metaSub={`Margin ${r.margin.toFixed(1)}% · Cost ${formatCurrency(r.totalCost)} · Rev ${formatCurrency(r.revenue)}`}
            tone={r.profit >= 0 ? "success" : "danger"}
          />
        ))}
      </div>
    </div>
  );
}
