import { Suspense } from "react";
import { MobileSkeletonForm } from "@/components/mobile/mobile-skeleton";
import { connection } from "next/server";
import { prisma } from "@nirman/db";
import { getCompany, toNum, scopeWhere, getScopedFormOptions, getUserPermissions } from "@/lib/server";
import { PERM } from "@/lib/roles";
import { Users } from "lucide-react";
import { MobileAttendanceForm } from "@/components/mobile/mobile-attendance-form";
import { MobileNoAccess } from "@/components/mobile/v2/primitives";

export default function MobileAttendancePage() {
  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        <p className="text-m-section font-bold flex-1" style={{ color: "var(--color-ink-950)" }}>
          Attendance
        </p>
        <span
          className="flex items-center gap-0.5 text-m-caption font-bold uppercase tracking-wide px-2 py-0.5 rounded-full shrink-0"
          style={{ color: "var(--color-steel)", backgroundColor: "color-mix(in srgb, var(--color-steel) 12%, transparent)" }}
        >
          <Users className="size-2.5" />
          Site
        </span>
      </div>
      <Suspense fallback={<MobileSkeletonForm />}>
        <MobileAttendanceContent />
      </Suspense>
    </div>
  );
}

async function MobileAttendanceContent() {
  await connection();
  const __effPerms = await getUserPermissions();
  const company = await getCompany();

  if (!__effPerms.includes(PERM.HR_MANAGE) && !__effPerms.includes(PERM.ATTENDANCE_LOG)) {
    return <MobileNoAccess what="log attendance" permission="attendance.log" />;
  }

  const today = new Date();
  // Normalize to a date-only range so the query matches attendance records
  // stored at midnight UTC, regardless of the user's local timezone.
  const startOfToday = new Date(Date.UTC(today.getFullYear(), today.getMonth(), today.getDate()));
  const endOfToday = new Date(startOfToday.getTime() + 24 * 60 * 60 * 1000);

  const scopedOpts = await getScopedFormOptions();
  // Comp visibility matches getEmployeeAccessScope.canSeePayroll.
  const canSeeComp = __effPerms.includes(PERM.PAYROLL_MANAGE) || __effPerms.includes(PERM.HR_MANAGE);
  const [projects, employees, existingAttendance] = await Promise.all([
    Promise.resolve(scopedOpts.projects),
    prisma.employee.findMany({
      where: { companyId: company.id, deletedAt: null, active: true, ...await scopeWhere("Employee") },
      select: { id: true, name: true, trade: true, dailyRate: true, wageType: true },
      orderBy: { name: "asc" },
    }),
    prisma.workerAttendance.findMany({
      where: {...await scopeWhere("WorkerAttendance"), 
        companyId: company.id,
        date: { gte: startOfToday, lt: endOfToday },
      },
      select: {
        employeeId: true,
        status: true,
        checkIn: true,
        checkOut: true,
        hoursWorked: true,
        notes: true,
      },
    }),
  ]);

  // Build a map of existing attendance
  const attendanceMap = new Map<string, { status: string; checkIn: string | null; checkOut: string | null; hoursWorked: number | null; notes: string | null }>();
  for (const a of existingAttendance) {
    attendanceMap.set(a.employeeId, {
      status: a.status,
      checkIn: a.checkIn?.toTimeString().slice(0, 5) ?? null,
      checkOut: a.checkOut?.toTimeString().slice(0, 5) ?? null,
      hoursWorked: a.hoursWorked ? toNum(a.hoursWorked) : null,
      notes: a.notes,
    });
  }

  return (
    <MobileAttendanceForm
      projects={projects.map((p) => ({ id: p.id, name: p.name }))}
      employees={employees.map((e) => ({
        id: e.id,
        name: e.name,
        trade: e.trade,
        // Wage amounts are comp data — attendance markers without
        // payroll.manage|hr.manage see the worker list without rates.
        dailyRate: canSeeComp ? toNum(e.dailyRate) : null,
        wageType: e.wageType,
      }))}
      existingAttendance={Object.fromEntries(attendanceMap)}
    />
  );
}
