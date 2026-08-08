import { Suspense } from "react";
import { MobileSkeletonList } from "@/components/mobile/mobile-skeleton";
import { connection } from "next/server";
import { prisma } from "@nirman/db";
import { CalendarCheck } from "lucide-react";
import { getCompany } from "@/lib/server";
import {
  MobilePageHeader,
  MobileSectionTitle,
  MobileEmptyState,
  MobileCta,
  MobileRefreshButton,
} from "@/components/mobile/mobile-primitives";
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

  const records = await prisma.workerAttendance.findMany({
    where: { companyId: company.id },
    orderBy: { date: "desc" },
    take: 40,
    include: {
      project: { select: { name: true } },
      employee: { select: { name: true } },
    },
  });

  // Serialize for the client component (search + filter chips + badges)
  const serialized = records.map((r) => ({
    id: r.id,
    employeeName: r.employee?.name ?? null,
    projectName: r.project?.name ?? null,
    date: r.date.toISOString(),
    status: r.status,
  }));

  return (
    <div>
      <MobilePageHeader
        title="Attendance"
        subtitle={`${records.length} recent records`}
        right={<MobileRefreshButton />}
      />

      <div className="px-4 pb-2">
        <MobileCta href="/m/site/attendance" icon={CalendarCheck}>
          Check in now
        </MobileCta>
      </div>

      <MobileAttendanceList items={serialized} />

      {records.length === 0 && (
        <>
          <MobileSectionTitle>Recent</MobileSectionTitle>
          <MobileEmptyState icon={CalendarCheck} title="No attendance records" />
        </>
      )}
    </div>
  );
}
