import { Suspense } from "react";
import { MobileSkeletonForm } from "@/components/mobile/mobile-skeleton";
import { connection } from "next/server";
import { prisma } from "@nirman/db";
import { getCompany, getUserRole, toNum } from "@/lib/server";
import { PERM, hasPermission } from "@/lib/roles";
import { MobileAttendanceForm } from "@/components/mobile/mobile-attendance-form";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { MobileRefreshButton } from "@/components/mobile/mobile-primitives";

export default function MobileAttendancePage() {
  return (
    <div>
      <div className="flex items-center gap-2 border-b border-border bg-background px-4 py-3">
        <Link href="/m/site" className="text-muted-foreground hover:text-foreground">
          <ChevronLeft className="h-5 w-5" />
        </Link>
        <h1 className="text-h3 font-semibold text-foreground">Attendance</h1>
        <div className="ml-auto">
          <MobileRefreshButton />
        </div>
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
      <div className="p-4 text-meta text-muted-foreground">
        You don&apos;t have permission to log attendance.
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
