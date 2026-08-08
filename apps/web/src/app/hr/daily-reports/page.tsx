import { Suspense } from "react";
import { connection } from "next/server";
import { prisma } from "@nirman/db";
import { getCompany, getUserRole } from "@/lib/server";
import { PERM, hasPermission } from "@/lib/roles";
import { PageLoading } from "@/components/page-loading";
import { DailyReportsView } from "@/components/hr/daily-reports-view";

import { NoAccess } from "@/components/no-access";
export default function DailyReportsPage() {
  return (
    <Suspense fallback={<PageLoading label="Loading daily reports…" variant="list" />}>
      <DailyReportsContent />
    </Suspense>
  );
}

async function DailyReportsContent() {
  await connection();
  const role = await getUserRole();
  const company = await getCompany();

  if (!hasPermission(role, PERM.DPR_VIEW)) {
    return (
      <NoAccess what="daily reports" />
    );
  }

  const perms = {
    canSubmit: hasPermission(role, PERM.DPR_SUBMIT),
  };

  const [reports, projects] = await Promise.all([
    prisma.dailyReport.findMany({
      where: { companyId: company.id },
      orderBy: { date: "desc" },
      take: 200,
      include: {
        project: { select: { id: true, name: true } },
        submittedBy: { select: { id: true, name: true } },
      },
    }),
    prisma.project.findMany({
      where: { companyId: company.id, deletedAt: null, status: { in: ["PLANNED", "ACTIVE"] } },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
  ]);

  const reportRows = reports.map((r) => ({
    id: r.id,
    projectId: r.projectId,
    projectName: r.project?.name ?? null,
    date: r.date.toISOString(),
    attendanceSummary: r.attendanceSummary,
    workDone: r.workDone,
    materialUsed: r.materialUsed,
    equipment: r.equipment,
    delay: r.delay,
    remarks: r.remarks,
    submittedByName: r.submittedBy?.name ?? null,
    createdAt: r.createdAt.toISOString(),
  }));

  return (
    <DailyReportsView
      reports={reportRows}
      projects={projects.map((p) => ({ id: p.id, name: p.name }))}
      permissions={perms}
    />
  );
}
