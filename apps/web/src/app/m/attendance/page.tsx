import { Suspense } from "react";
import { MobileSkeletonList } from "@/components/mobile/mobile-skeleton";
import { connection } from "next/server";
import { prisma } from "@nirman/db";
import { CalendarCheck } from "lucide-react";
import { getCompany } from "@/lib/server";
import {
  MobileSectionTitle,
  MobileEmptyState,
  MobileCta,
} from "@/components/mobile/v2/primitives";
import { MobileAttendanceList } from "./MobileAttendanceList";

/**
 * /m/attendance — mobile attendance list. Replaces desktop `/hr/attendance`
 * leaks. Links to the existing mobile attendance form for today's check-in.
 */
export default function MobileAttendancePage() {
  return (
    <Suspense fallback={<MobileSkeletonList rows={6} />}>
      <MobileAttendanceContent />
    </Suspense>
  );
}

async function MobileAttendanceContent() {
  await connection();
  const company = await getCompany();

  const [records, projects] = await Promise.all([
    prisma.workerAttendance.findMany({
      where: { companyId: company.id },
      orderBy: { date: "desc" },
      take: 200,
      include: {
        project: { select: { name: true } },
        employee: { select: { name: true } },
      },
    }),
    prisma.project.findMany({
      where: { companyId: company.id, deletedAt: null },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
  ]);

  // Serialize for the client component (search + filter chips + date/project filters + badges)
  const serialized = records.map((r) => ({
    id: r.id,
    employeeName: r.employee?.name ?? null,
    projectName: r.project?.name ?? null,
    projectId: r.projectId ?? null,
    date: r.date.toISOString(),
    status: r.status,
  }));

  const projectOptions = projects.map((p) => ({ id: p.id, name: p.name }));

  return (
    <div>
      <div className="mb-4">
        <MobileCta href="/m/site/attendance" icon={CalendarCheck} variant="primary">
          Check in now
        </MobileCta>
      </div>

      <MobileAttendanceList items={serialized} projects={projectOptions} />

      {records.length === 0 && (
        <>
          <MobileSectionTitle>Recent</MobileSectionTitle>
          <MobileEmptyState icon={CalendarCheck} title="No attendance records" />
        </>
      )}
    </div>
  );
}
