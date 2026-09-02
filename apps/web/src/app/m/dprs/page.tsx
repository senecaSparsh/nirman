import { Suspense } from "react";
import { MobileSkeletonList } from "@/components/mobile/mobile-skeleton";
import { connection } from "next/server";
import { prisma } from "@nirman/db";
import { getCompany, toNum, getUserRole } from "@/lib/server";
import { hasPermission, PERM } from "@/lib/roles";
import { MobileDprsList } from "./MobileDprsList";
import { MobileDprsFab } from "./MobileDprsFab";
import type { MobileColumnSpec } from "@/components/mobile/v2/export-share-bar";

export default function MobileDprsPage() {
  return (
    <Suspense fallback={<MobileSkeletonList rows={6} />}>
      <MobileDprsContent />
    </Suspense>
  );
}

async function MobileDprsContent() {
  await connection();
  const company = await getCompany();
  const role = await getUserRole();
  const canSubmit = hasPermission(role, PERM.DPR_SUBMIT);
  const canApproveSubAdmin = hasPermission(role, PERM.DPR_APPROVE_SUB_ADMIN);

  const BATCH_SIZE = 40;
  const dprs = await prisma.dailyProgressReport.findMany({
    where: { project: { companyId: company.id } },
    orderBy: [{ date: "desc" }, { id: "desc" }],
    take: BATCH_SIZE + 1,
    include: {
      project: { select: { id: true, name: true } },
      submittedBy: { select: { name: true } },
    },
  });

  const hasMore = dprs.length > BATCH_SIZE;
  const batch = hasMore ? dprs.slice(0, BATCH_SIZE) : dprs;
  const submittedCount = batch.filter((d) => d.approvalStatus === "SUBMITTED").length;
  const lastItem = batch[batch.length - 1];
  const nextCursor = hasMore && lastItem
    ? `${lastItem.date.toISOString()}|${lastItem.id}`
    : null;

  const serialized = batch.map((d) => ({
    id: d.id,
    date: d.date.toISOString(),
    projectName: d.project.name,
    projectId: d.project.id,
    submittedByName: d.submittedBy?.name ?? null,
    approvalStatus: d.approvalStatus,
    progressPct: toNum(d.progressPct),
    workType: d.workType ?? null,
  }));

  const csvColumns: MobileColumnSpec[] = [
    { key: "date", label: "Date", format: "date" },
    { key: "projectName", label: "Project" },
    { key: "submittedByName", label: "Supervisor" },
    { key: "approvalStatus", label: "Status" },
    { key: "progressPct", label: "Progress %" },
    { key: "workType", label: "Work Type" },
  ];

  // ── Fetch DPR form reference data (only when the user can submit) ──
  // This mirrors the queries in /m/site/dpr/page.tsx so the FAB modal
  // can present the full MobileDprForm inline.
  let dprFormData: Awaited<ReturnType<typeof fetchDprFormData>> | null = null;
  if (canSubmit) {
    dprFormData = await fetchDprFormData(company.id);
  }

  return (
    <div>
      <MobileDprsList
        items={serialized}
        canSubmit={canSubmit}
        canApproveSubAdmin={canApproveSubAdmin}
        submittedCount={submittedCount}
        loadMoreUrl="/api/mobile/list/dprs"
        nextCursor={nextCursor}
        exportTitle="Daily Progress Reports"
        exportRows={serialized as unknown as Record<string, unknown>[]}
        exportColumns={csvColumns}
        exportSummary={`${serialized.length} DPRs`}
      />
      {canSubmit && dprFormData && (
        <MobileDprsFab
          projects={dprFormData.projects}
          employees={dprFormData.employees}
          crews={dprFormData.crews}
          materials={dprFormData.materials}
          existingDprsByProject={dprFormData.existingDprsByProject}
          yesterdayDprsByProject={dprFormData.yesterdayDprsByProject}
        />
      )}
    </div>
  );
}

/**
 * Fetches the reference data needed by MobileDprForm:
 * today's + yesterday's DPRs (with material/labor lines), projects,
 * employees, crews, and materials with stock.
 */
async function fetchDprFormData(companyId: string) {
  const today = new Date();
  const startOfToday = new Date(Date.UTC(today.getFullYear(), today.getMonth(), today.getDate()));
  const endOfToday = new Date(startOfToday.getTime() + 24 * 60 * 60 * 1000);
  const startOfYesterday = new Date(startOfToday.getTime() - 24 * 60 * 60 * 1000);

  const [todayDprs, yesterdayDprs, projects, employees, crews, materials] = await Promise.all([
    prisma.dailyProgressReport.findMany({
      where: { companyId, date: { gte: startOfToday, lt: endOfToday } },
      include: { materialLines: true, laborLines: true },
    }),
    prisma.dailyProgressReport.findMany({
      where: { companyId, date: { gte: startOfYesterday, lt: startOfToday } },
      include: { materialLines: true, laborLines: true },
    }),
    prisma.project.findMany({
      where: { companyId, deletedAt: null, status: { in: ["ACTIVE", "PLANNED"] } },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    prisma.employee.findMany({
      where: { companyId, deletedAt: null, active: true },
      select: { id: true, name: true, trade: true },
      orderBy: { name: "asc" },
    }),
    prisma.crew.findMany({
      where: { companyId },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    prisma.material.findMany({
      where: { deletedAt: null, stockItems: { some: { location: { companyId } } } },
      select: { id: true, name: true, unit: true, standardCost: true },
      orderBy: { name: "asc" },
      take: 100,
    }),
  ]);

  const existingDprsByProject: Record<string, {
    id: string;
    projectId: string;
    date: string;
    weather: string | null;
    workSummary: string;
    workType: string | null;
    workQty: number | null;
    workUnit: string | null;
    progressPct: number;
    blockers: string | null;
    tomorrowPlan: string | null;
    notes: string | null;
    materialLines: { materialId: string; qty: number; unitCost: number }[];
    laborLines: { employeeId: string | null; crewId: string | null; hoursWorked: number; taskDescription: string }[];
  }> = {};
  for (const d of todayDprs) {
    existingDprsByProject[d.projectId] = {
      id: d.id,
      projectId: d.projectId,
      date: d.date.toISOString().slice(0, 10),
      weather: d.weather,
      workSummary: d.workSummary,
      workType: d.workType,
      workQty: d.workQty != null ? toNum(d.workQty) : null,
      workUnit: d.workUnit,
      progressPct: toNum(d.progressPct),
      blockers: d.blockers,
      tomorrowPlan: d.tomorrowPlan,
      notes: d.notes,
      materialLines: d.materialLines.map((l) => ({
        materialId: l.materialId,
        qty: toNum(l.qty),
        unitCost: toNum(l.unitCost),
      })),
      laborLines: d.laborLines.map((l) => ({
        employeeId: l.employeeId,
        crewId: l.crewId,
        hoursWorked: toNum(l.hoursWorked),
        taskDescription: l.taskDescription,
      })),
    };
  }

  const yesterdayDprsByProject: Record<string, {
    workSummary: string;
    weather: string | null;
    materialLines: { materialId: string; qty: number; unitCost: number }[];
    laborLines: { employeeId: string | null; crewId: string | null; hoursWorked: number; taskDescription: string }[];
  }> = {};
  for (const d of yesterdayDprs) {
    yesterdayDprsByProject[d.projectId] = {
      workSummary: d.workSummary,
      weather: d.weather,
      materialLines: d.materialLines.map((l) => ({
        materialId: l.materialId,
        qty: toNum(l.qty),
        unitCost: toNum(l.unitCost),
      })),
      laborLines: d.laborLines.map((l) => ({
        employeeId: l.employeeId,
        crewId: l.crewId,
        hoursWorked: toNum(l.hoursWorked),
        taskDescription: l.taskDescription,
      })),
    };
  }

  return {
    projects: projects.map((p) => ({ id: p.id, name: p.name })),
    employees: employees.map((e) => ({ id: e.id, name: e.name, trade: e.trade })),
    crews: crews.map((c) => ({ id: c.id, name: c.name })),
    materials: materials.map((m) => ({ id: m.id, name: m.name, unit: m.unit, standardCost: toNum(m.standardCost) })),
    existingDprsByProject,
    yesterdayDprsByProject,
  };
}
