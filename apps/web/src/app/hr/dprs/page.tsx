import { Suspense } from "react";
import { connection } from "next/server";
import { prisma } from "@nirman/db";
import { listWorkTypes } from "@nirman/services";
import { getCompany, toNum, getUserRole, getUserScope } from "@/lib/server";
import { PERM, hasPermission } from "@/lib/roles";
import { PageLoading } from "@/components/page-loading";
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

  // Hierarchical RBAC: a PROJECT-scoped user (Sub-Sub-Admin) only sees DPRs +
  // project options for their assigned sites.
  const scope = await getUserScope();
  const projectFilter =
    scope.scopeType === "PROJECT" && scope.projectIds.length > 0
      ? { projectId: { in: scope.projectIds } }
      : {};
  const projectOptionFilter =
    scope.scopeType === "PROJECT" && scope.projectIds.length > 0
      ? { id: { in: scope.projectIds } }
      : {};

  const [dprs, projects, materials, employees, workTypes] = await Promise.all([
    prisma.dailyProgressReport.findMany({
      where: { companyId: company.id, ...projectFilter },
      orderBy: { date: "desc" },
      take: 100,
      include: {
        project: { select: { id: true, name: true } },
        submittedBy: { select: { name: true } },
        subAdminApprovedBy: { select: { name: true } },
        adminApprovedBy: { select: { name: true } },
        _count: { select: { materialLines: true, laborLines: true } },
      },
    }),
    prisma.project.findMany({
      where: { companyId: company.id, deletedAt: null, status: { in: ["PLANNED", "ACTIVE"] }, ...projectOptionFilter },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    prisma.material.findMany({
      where: { deletedAt: null },
      select: { id: true, name: true, unit: true, standardCost: true },
      orderBy: { name: "asc" },
      take: 200,
    }),
    prisma.employee.findMany({
      where: { companyId: company.id, deletedAt: null, active: true },
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
    submittedByName: d.submittedBy?.name ?? null,
    approvalStatus: d.approvalStatus,
    subAdminApprovedByName: d.subAdminApprovedBy?.name ?? null,
    adminApprovedByName: d.adminApprovedBy?.name ?? null,
    materialLineCount: d._count.materialLines,
    laborLineCount: d._count.laborLines,
  }));

  return (
    <DprsView
      dprs={dprRows}
      projects={projects.map((p) => ({ id: p.id, name: p.name }))}
      materials={materials.map((m) => ({ id: m.id, name: m.name, unit: m.unit, standardCost: toNum(m.standardCost) }))}
      employees={employees.map((e) => ({ id: e.id, name: e.name }))}
      workTypes={workTypes}
      permissions={perms}
    />
  );
}
