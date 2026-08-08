import { Suspense } from "react";
import { connection } from "next/server";
import { prisma } from "@nirman/db";
import { dprAnalysis, workforceProductivity, projectPnl } from "@nirman/services";
import { getCompany, getUserRole, toNum } from "@/lib/server";
import { PERM, hasPermission } from "@/lib/roles";
import { PageHeader } from "@/components/page-header";
import { PageLoading } from "@/components/page-loading";
import { ComparativeReportView } from "@/components/reports/comparative-report-view";

import { NoAccess } from "@/components/no-access";
export default function ComparativeReportPage() {
  return (
    <div className="space-y-5">
      <PageHeader
        title="Comparative Analysis"
        description="Planned vs actual progress, workforce productivity, and labour costs per project."
      />
      <Suspense fallback={<PageLoading label="Loading comparative analysis…" variant="list" />}>
        <ComparativeContent />
      </Suspense>
    </div>
  );
}

async function ComparativeContent() {
  await connection();
  const role = await getUserRole();
  const company = await getCompany();

  if (!hasPermission(role, PERM.FINANCE_VIEW) && !hasPermission(role, PERM.HR_VIEW)) {
    return (
      <NoAccess what="the comparative analysis report" />
    );
  }

  const projects = await prisma.project.findMany({
    where: { companyId: company.id, deletedAt: null },
    select: { id: true, name: true, status: true },
    orderBy: { name: "asc" },
  });

  // Compute analysis for each project
  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  const projectAnalyses = await Promise.all(
    projects.map(async (p) => {
      const [dprData, workforce, pnl] = await Promise.all([
        dprAnalysis(p.id).catch(() => null),
        workforceProductivity({ companyId: company.id, projectId: p.id, from: thirtyDaysAgo, to: now }).catch(() => null),
        projectPnl(p.id).catch(() => null),
      ]);

      return {
        id: p.id,
        name: p.name,
        status: p.status,
        dprCount: dprData?.dprCount ?? 0,
        latestProgressPct: dprData?.latestProgressPct ?? 0,
        progressDelta: dprData?.progressDelta ?? 0,
        totalLaborHours: dprData?.totalLaborHours ?? 0,
        workforcePresent: workforce?.present ?? 0,
        workforceAbsent: workforce?.absent ?? 0,
        workforceLeave: workforce?.leave ?? 0,
        attendanceRate: workforce?.attendanceRate ?? 0,
        totalHours: workforce?.totalHours ?? 0,
        projectCost: pnl ? toNum(pnl.total) : 0,
        labourCost: pnl ? toNum(pnl.labour) : 0,
        revenue: pnl ? toNum(pnl.revenue) : 0,
        profit: pnl ? toNum(pnl.profit) : 0,
        margin: pnl ? toNum(pnl.margin) : 0,
        history: (dprData?.history ?? []).map((h) => ({
          date: h.date instanceof Date ? h.date.toISOString().slice(0, 10) : String(h.date).slice(0, 10),
          progressPct: h.progressPct,
          laborHours: h.laborHours,
          workSummary: h.workSummary,
        })),
      };
    }),
  );

  // Sort by progress delta descending (most progress first)
  projectAnalyses.sort((a, b) => b.progressDelta - a.progressDelta);

  return <ComparativeReportView projects={projectAnalyses} />;
}
