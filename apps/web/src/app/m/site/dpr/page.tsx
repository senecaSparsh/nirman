import { Suspense } from "react";
import { MobileSkeletonForm } from "@/components/mobile/mobile-skeleton";
import { connection } from "next/server";
import { prisma } from "@nirman/db";
import { getCompany, getUserRole, toNum } from "@/lib/server";
import { PERM, hasPermission } from "@/lib/roles";
import { ClipboardList } from "lucide-react";
import { MobileDprForm } from "@/components/mobile/mobile-dpr-form";

export default function MobileDprPage() {
  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        <p className="text-[0.875rem] font-bold flex-1" style={{ color: "var(--color-ink-950)" }}>
          Submit Daily Progress Report
        </p>
        <span
          className="flex items-center gap-0.5 text-[0.5rem] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full shrink-0"
          style={{ color: "var(--color-steel)", backgroundColor: "color-mix(in srgb, var(--color-steel) 12%, transparent)" }}
        >
          <ClipboardList className="size-2.5" />
          Site
        </span>
      </div>
      <Suspense fallback={<MobileSkeletonForm />}>
        <MobileDprContent />
      </Suspense>
    </div>
  );
}

async function MobileDprContent() {
  await connection();
  const role = await getUserRole();
  const company = await getCompany();

  if (!hasPermission(role, PERM.DPR_SUBMIT)) {
    return (
      <div className="flex flex-col items-center text-center px-4 py-7">
        <div className="grid place-items-center size-11 rounded-full mb-2.5" style={{ backgroundColor: "var(--color-concrete)" }}>
          <ClipboardList className="size-5" style={{ color: "var(--color-ink-300)" }} />
        </div>
        <p className="text-[0.875rem] font-semibold" style={{ color: "var(--color-ink-950)" }}>No access</p>
        <p className="text-[0.625rem] mt-1" style={{ color: "var(--color-ink-500)" }}>
          You don&apos;t have permission to submit DPRs.
        </p>
      </div>
    );
  }

  const today = new Date();
  // Normalize to a date-only range so the query matches DPR rows stored
  // at midnight, regardless of the user's local timezone. `date` is a
  // @db.Date column, so a bare `new Date()` (with time) is unreliable.
  const startOfToday = new Date(Date.UTC(today.getFullYear(), today.getMonth(), today.getDate()));
  const endOfToday = new Date(startOfToday.getTime() + 24 * 60 * 60 * 1000);
  const startOfYesterday = new Date(startOfToday.getTime() - 24 * 60 * 60 * 1000);

  // Fetch ALL of today's DPRs for the company (one per project — the
  // unique key is [projectId, date]). The form looks up by selected
  // project so a supervisor with multiple projects edits the right one.
  // Also fetch yesterday's DPRs for the "Repeat yesterday" feature.
  const [todayDprs, yesterdayDprs] = await Promise.all([
    prisma.dailyProgressReport.findMany({
      where: {
        companyId: company.id,
        date: { gte: startOfToday, lt: endOfToday },
      },
      include: {
        materialLines: true,
        laborLines: true,
      },
    }),
    prisma.dailyProgressReport.findMany({
      where: {
        companyId: company.id,
        date: { gte: startOfYesterday, lt: startOfToday },
      },
      include: {
        materialLines: true,
        laborLines: true,
      },
    }),
  ]);

  const existingDprsByProject: Record<string, {
    id: string;
    projectId: string;
    date: string;
    weather: string | null;
    workSummary: string;
    workType: string | null;
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

  // Build yesterday's DPRs map for "Repeat yesterday" feature
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

  const [projects, employees, crews, materials] = await Promise.all([
    prisma.project.findMany({
      where: { companyId: company.id, deletedAt: null, status: { in: ["ACTIVE", "PLANNED"] } },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    prisma.employee.findMany({
      where: { companyId: company.id, deletedAt: null, active: true },
      select: { id: true, name: true, trade: true },
      orderBy: { name: "asc" },
    }),
    prisma.crew.findMany({
      where: { companyId: company.id },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    prisma.material.findMany({
      where: { deletedAt: null, stockItems: { some: { location: { companyId: company.id } } } },
      select: { id: true, name: true, unit: true, standardCost: true },
      orderBy: { name: "asc" },
      take: 100,
    }),
  ]);

  return (
    <MobileDprForm
      projects={projects.map((p) => ({ id: p.id, name: p.name }))}
      employees={employees.map((e) => ({ id: e.id, name: e.name, trade: e.trade }))}
      crews={crews.map((c) => ({ id: c.id, name: c.name }))}
      materials={materials.map((m) => ({ id: m.id, name: m.name, unit: m.unit, standardCost: toNum(m.standardCost) }))}
      existingDprsByProject={existingDprsByProject}
      yesterdayDprsByProject={yesterdayDprsByProject}
    />
  );
}
