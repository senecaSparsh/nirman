import { Suspense } from "react";
import { MobileSkeletonForm } from "@/components/mobile/mobile-skeleton";
import { connection } from "next/server";
import { prisma } from "@nirman/db";
import { getCompany, getUserRole, toNum } from "@/lib/server";
import { PERM, hasPermission } from "@/lib/roles";
import { Users } from "lucide-react";
import { MobileAttendanceForm } from "@/components/mobile/mobile-attendance-form";

export default function MobileAttendancePage() {
  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        <p className="text-[0.875rem] font-bold flex-1" style={{ color: "var(--color-ink-950)" }}>
          Attendance
        </p>
        <span
          className="flex items-center gap-0.5 text-[0.5rem] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full shrink-0"
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
  const role = await getUserRole();
  const company = await getCompany();

  if (!hasPermission(role, PERM.HR_MANAGE)) {
    return (
      <div className="flex flex-col items-center text-center px-4 py-7">
        <div className="grid place-items-center size-11 rounded-full mb-2.5" style={{ backgroundColor: "var(--color-concrete)" }}>
          <Users className="size-5" style={{ color: "var(--color-ink-300)" }} />
        </div>
        <p className="text-[0.875rem] font-semibold" style={{ color: "var(--color-ink-950)" }}>No access</p>
        <p className="text-[0.625rem] mt-1" style={{ color: "var(--color-ink-500)" }}>
          You don&apos;t have permission to log attendance.
        </p>
      </div>
    );
  }

  const today = new Date();
  // Normalize to a date-only range so the query matches attendance records
  // stored at midnight UTC, regardless of the user's local timezone.
  const startOfToday = new Date(Date.UTC(today.getFullYear(), today.getMonth(), today.getDate()));
  const endOfToday = new Date(startOfToday.getTime() + 24 * 60 * 60 * 1000);

  const [projects, employees, existingAttendance] = await Promise.all([
    prisma.project.findMany({
      where: { companyId: company.id, deletedAt: null, status: { in: ["ACTIVE", "PLANNED"] } },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    prisma.employee.findMany({
      where: { companyId: company.id, deletedAt: null, active: true },
      select: { id: true, name: true, trade: true, dailyRate: true, wageType: true },
      orderBy: { name: "asc" },
    }),
    prisma.workerAttendance.findMany({
      where: {
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
        dailyRate: toNum(e.dailyRate),
        wageType: e.wageType,
      }))}
      existingAttendance={Object.fromEntries(attendanceMap)}
    />
  );
}
