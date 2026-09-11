import { Suspense } from "react";
import { connection } from "next/server";
import { prisma } from "@nirman/db";
import { listWorkTypes } from "@nirman/services";
import { getCompany, getCurrentUser, toNum, getUserRole, getUserScope, scopeWhere, getScopedFormOptions } from "@/lib/server";
import { PERM, hasPermission } from "@/lib/roles";
import { PageLoading } from "@/components/page-loading";
import { PageHeader } from "@/components/page-header";
import { DprsView } from "@/components/hr/dprs-view";

import { NoAccess } from "@/components/no-access";
export default function DprsPage() {
  return (
    <Suspense fallback={<PageLoading label="Loading DPRs…" variant="list" />}>
      <DprsContent />
    </Suspense>
  );
}

async function DprsContent() {
  await connection();
  const role = await getUserRole();
  const company = await getCompany();

  if (!hasPermission(role, PERM.DPR_VIEW)) {
    return (
      <NoAccess what="DPRs" />
    );
  }

  const perms = {
    canSubmit: hasPermission(role, PERM.DPR_SUBMIT),
    canSubAdminApprove: hasPermission(role, PERM.DPR_APPROVE_SUB_ADMIN),
    canAdminApprove: hasPermission(role, PERM.DPR_APPROVE_ADMIN),
  };

  const currentUser = await getCurrentUser();

  // Hierarchical RBAC: a PROJECT-scoped user (Sub-Sub-Admin) only sees DPRs +
  // project options for their assigned sites.
  const scope = await getUserScope();
  const projectFilter =
    scope.scopeType === "PROJECT" && scope.projectIds.length > 0
      ? { projectId: { in: scope.projectIds } }
      : {};
  const _projectOptionFilter =
    scope.scopeType === "PROJECT" && scope.projectIds.length > 0
      ? { id: { in: scope.projectIds } }
      : {};

  const scopedOpts = await getScopedFormOptions();

  const [dprs, projects, materials, employees, workTypes] = await Promise.all([
    prisma.dailyProgressReport.findMany({
      where: {...await scopeWhere("DailyProgressReport"),  companyId: company.id, ...projectFilter },
      orderBy: { date: "desc" },
      take: 100,
      include: {
        project: { select: { id: true, name: true, totalProjectCost: true, costPerSqft: true, totalBudget: true, totalSellableArea: true } },
        submittedBy: { select: { id: true, name: true } },
        subAdminApprovedBy: { select: { name: true } },
        adminApprovedBy: { select: { name: true } },
        _count: { select: { materialLines: true, laborLines: true } },
      },
    }),
    Promise.resolve(scopedOpts.projects),
    prisma.material.findMany({
      where: { companyId: company.id, deletedAt: null },
      select: { id: true, name: true, unit: true, standardCost: true },
      orderBy: { name: "asc" },
      take: 200,
    }),
    prisma.employee.findMany({
      take: 200,
      where: { companyId: company.id, deletedAt: null, active: true, ...await scopeWhere("Employee") },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    listWorkTypes(company.id),
  ]);

  const dprRows = dprs.map((d) => ({
    id: d.id,
    date: d.date.toISOString(),
    projectId: d.projectId,
    projectName: d.project.name,
    weather: d.weather,
    workSummary: d.workSummary,
    workType: d.workType,
    progressPct: toNum(d.progressPct),
    blockers: d.blockers,
    tomorrowPlan: d.tomorrowPlan,
    submittedById: d.submittedById,
    submittedByName: d.submittedBy?.name ?? null,
    approvalStatus: d.approvalStatus,
    subAdminApprovedByName: d.subAdminApprovedBy?.name ?? null,
    adminApprovedByName: d.adminApprovedBy?.name ?? null,
    materialLineCount: d._count.materialLines,
    laborLineCount: d._count.laborLines,
    totalProjectCost: d.project?.totalProjectCost ? toNum(d.project.totalProjectCost) : null,
    costPerSqft: d.project?.costPerSqft ? toNum(d.project.costPerSqft) : null,
    projectBudget: d.project?.totalBudget ? toNum(d.project.totalBudget) : null,
    totalSellableArea: d.project?.totalSellableArea ? toNum(d.project.totalSellableArea) : null,
  }));

  return (
    <>
      <PageHeader
        title="Daily Progress Reports"
        description="Site progress reports with multi-tier approval. Over-consumption is auto-flagged against standard benchmarks."
        stats={[
          { label: "DPRs", value: dprRows.length },
          { label: "Pending approval", value: dprRows.filter(d => d.approvalStatus === "SUBMITTED").length },
        ]}
      />
      <DprsView
        dprs={dprRows}
        projects={projects.map((p) => ({ id: p.id, name: p.name }))}
        materials={materials.map((m) => ({ id: m.id, name: m.name, unit: m.unit, standardCost: toNum(m.standardCost) }))}
        employees={employees.map((e) => ({ id: e.id, name: e.name }))}
        workTypes={workTypes}
        permissions={perms}
        currentUserId={currentUser?.id ?? ""}
      />
    </>
  );
}
