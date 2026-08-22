import { Suspense } from "react";
import { MobileSkeletonList } from "@/components/mobile/mobile-skeleton";
import { connection } from "next/server";
import { notFound } from "next/navigation";
import { prisma } from "@nirman/db";
import { dprAnalysis, workforceProductivity, projectPnl } from "@nirman/services";
import { BarChart3, Building2, TrendingUp, Clock, Users } from "lucide-react";
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
 * /m/reports/comparative — mobile comparative analysis report.
 * Shows planned vs actual progress, workforce productivity, and labor costs per project.
 */
export default function MobileComparativePage() {
  return (
    <Suspense fallback={<MobileSkeletonList rows={6} />}>
      <MobileComparativeContent />
    </Suspense>
  );
}

async function MobileComparativeContent() {
  await connection();
  const role = await getUserRole();
  if (!hasPermission(role, PERM.FINANCE_VIEW) && !hasPermission(role, PERM.HR_VIEW)) notFound();
  const company = await getCompany();

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
      };
    }),
  );

  // Sort by progress delta descending (most progress first)
  projectAnalyses.sort((a, b) => b.progressDelta - a.progressDelta);

  const avgProgress =
    projectAnalyses.length > 0
      ? projectAnalyses.reduce((s, p) => s + p.latestProgressPct, 0) / projectAnalyses.length
      : 0;
  const totalLaborHours = projectAnalyses.reduce((s, p) => s + p.totalLaborHours, 0);
  const avgAttendance =
    projectAnalyses.length > 0
      ? projectAnalyses.reduce((s, p) => s + p.attendanceRate, 0) / projectAnalyses.length
      : 0;
  const totalProfit = projectAnalyses.reduce((s, p) => s + p.profit, 0);

  if (projects.length === 0) {
    return (
      <MobileEmptyState
        icon={Building2}
        title="No projects found"
        hint="Projects will appear here once created"
      />
    );
  }

  const csvColumns: MobileColumnSpec[] = [
    { key: "name", label: "Project" },
    { key: "status", label: "Status" },
    { key: "latestProgressPct", label: "Progress %", format: "percent" },
    { key: "progressDelta", label: "Progress Delta", format: "percent" },
    { key: "attendanceRate", label: "Attendance Rate", format: "percent" },
    { key: "projectCost", label: "Project Cost", format: "currency" },
    { key: "labourCost", label: "Labour Cost", format: "currency" },
    { key: "revenue", label: "Revenue", format: "currency" },
    { key: "profit", label: "Profit", format: "currency" },
    { key: "margin", label: "Margin %", format: "percent" },
  ];

  return (
    <div>
      <MobileReportHeader
        title="Comparative Analysis"
        subtitle="Progress, workforce productivity, and P&L across projects"
        icon={BarChart3}
        period="All Projects"
      />

      <MobileReportSummary
        items={[
          { label: "Projects", value: String(projectAnalyses.length) },
          { label: "Avg Progress", value: `${avgProgress.toFixed(1)}%`, tone: "go" },
          { label: "Labor Hours", value: String(Math.round(totalLaborHours)), tone: "signal" },
          { label: "Avg Attendance", value: `${avgAttendance.toFixed(1)}%` },
          { label: "Total Profit", value: formatCurrency(totalProfit), tone: totalProfit >= 0 ? "go" : "stop" },
        ]}
      />

      <div className="mb-4">
        <MobileExportShareBar
          title="Comparative Analysis Report"
          rows={projectAnalyses as unknown as Record<string, unknown>[]}
          columns={csvColumns}
          summary={`Projects: ${projectAnalyses.length} · Avg Progress: ${avgProgress.toFixed(1)}% · Total Profit: ${formatCurrency(totalProfit)}`}
        />
      </div>

      {/* Profit by project — bar chart */}
      <MobileSectionTitle>Profit by Project</MobileSectionTitle>
      <div className="mb-4">
        <MobileBarChart
          data={projectAnalyses.map((p) => ({
            label: p.name,
            value: p.profit,
            tone: (p.profit >= 0 ? "go" : "stop") as "go" | "stop",
          }))}
          formatValue={(v) => formatCurrency(v)}
        />
      </div>

      {/* Per-project rows */}
      <MobileSectionTitle>Projects</MobileSectionTitle>
      <div className="flex flex-col gap-2">
        {projectAnalyses.map((p) => (
          <MobileRow
            key={p.id}
            icon={Building2}
            title={p.name}
            subtitle={`${p.status} · Progress ${p.latestProgressPct.toFixed(1)}% · Attendance ${p.attendanceRate.toFixed(0)}%`}
            meta={p.profit !== 0 ? formatCurrency(p.profit) : formatCurrency(p.projectCost)}
            metaSub={p.margin !== 0 ? `Margin ${p.margin.toFixed(1)}%` : `Cost ${formatCurrency(p.projectCost)}`}
            tone={p.profit > 0 ? "success" : p.profit < 0 ? "warning" : "default"}
          />
        ))}
      </div>
    </div>
  );
}
