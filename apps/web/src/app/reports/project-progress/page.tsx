import { Suspense } from "react";
import { connection } from "next/server";
import { prisma } from "@nirman/db";
import { projectPnl } from "@nirman/services";
import { getCompany, toNum, getUserRole } from "@/lib/server";
import { formatCurrency } from "@/lib/utils";
import { PERM, hasPermission } from "@/lib/roles";
import { PageHeader } from "@/components/page-header";
import { PageLoading } from "@/components/page-loading";
import { ProjectProgressReport } from "@/components/reports/project-progress-report";

import { NoAccess } from "@/components/no-access";
export default function ProjectProgressPage() {
  return (
    <div className="space-y-5">
      <Suspense fallback={<PageLoading label="Loading project progress…" variant="list" />}>
        <ProjectProgressContent />
      </Suspense>
    </div>
  );
}

async function ProjectProgressContent() {
  await connection();
  const role = await getUserRole();
  const company = await getCompany();

  if (!hasPermission(role, PERM.FINANCE_VIEW) && !hasPermission(role, PERM.INVENTORY_VIEW) && !hasPermission(role, PERM.SALES_VIEW)) {
    return (
      <NoAccess what="the project progress report" />
    );
  }

  const projects = await prisma.project.findMany({
    where: { companyId: company.id, deletedAt: null },
    select: {
      id: true, name: true, type: true, status: true,
      totalBudget: true, totalProjectCost: true, costPerSqft: true, totalSellableArea: true,
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
  const progressByProject = new Map(latestDprs.map((d) => [d.projectId, { progressPct: toNum(d.progressPct), date: d.date.toISOString() }]));

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
        materials: toNum(pnl.materials),
        labour: toNum(pnl.labour),
        land: toNum(pnl.land),
        revenue: toNum(pnl.revenue),
        profit: toNum(pnl.profit),
        margin: toNum(pnl.margin),
        progressPct: prog?.progressPct ?? 0,
        lastDprDate: prog?.date ?? null,
        unitCount: p._count.builtUnits,
        phaseCount: p.phases.length,
        phases: p.phases.map((ph) => ({ name: ph.name, status: ph.status })),
      };
    }),
  );

  const totalCost = rows.reduce((s, r) => s + r.totalCost, 0);
  const totalRevenue = rows.reduce((s, r) => s + r.revenue, 0);
  const totalProfit = rows.reduce((s, r) => s + r.profit, 0);

  return (
    <>
      <PageHeader
        title="Project Progress"
        description="Per-project P&L, cost breakdown (materials / labour / land), revenue, margin, and latest DPR progress %."
        stats={[
          { label: "Projects", value: rows.length },
          { label: "Total cost", value: formatCurrency(totalCost) },
          { label: "Revenue", value: formatCurrency(totalRevenue) },
          { label: "Profit", value: formatCurrency(totalProfit) },
        ]}
      />
      <ProjectProgressReport rows={rows} totalCost={totalCost} totalRevenue={totalRevenue} totalProfit={totalProfit} />
    </>
  );
}
