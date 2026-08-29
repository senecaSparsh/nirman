import { Suspense } from "react";
import { MobileSkeletonList } from "@/components/mobile/mobile-skeleton";
import { connection } from "next/server";
import { prisma } from "@nirman/db";
import { getAttendanceWithTiers } from "@nirman/services";
import { CalendarCheck } from "lucide-react";
import { getCompany } from "@/lib/server";
import {
  MobileSectionTitle,
  MobileEmptyState,
  MobileCta,
} from "@/components/mobile/v2/primitives";
import { MobileAttendanceList } from "./MobileAttendanceList";
import type { MobileColumnSpec } from "@/components/mobile/v2/export-share-bar";

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

  // Fetch attendance with traffic-light tiers via the service rollup
  // (joins attendance → DPR approval status per project+date)
  const today = new Date();
  const from = new Date(today);
  from.setDate(from.getDate() - 30); // last 30 days

  const [tieredRecords, projects] = await Promise.all([
    getAttendanceWithTiers({ companyId: company.id, from, to: today }),
    prisma.project.findMany({
      where: { companyId: company.id, deletedAt: null },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
  ]);

  // Serialize for the client component (search + filter chips + date/project filters + badges)
  const serialized = tieredRecords.map((r) => ({
    id: r.id,
    employeeName: r.employeeName,
    projectName: r.projectName,
    projectId: r.projectId,
    date: r.date.toISOString(),
    status: r.status,
    tier: r.tier,
    dprApproved: r.dprApproved,
    checkIn: r.checkIn?.toTimeString().slice(0, 5) ?? null,
    checkOut: r.checkOut?.toTimeString().slice(0, 5) ?? null,
  }));

  const projectOptions = projects.map((p) => ({ id: p.id, name: p.name }));

  const csvColumns: MobileColumnSpec[] = [
    { key: "employeeName", label: "Employee" },
    { key: "projectName", label: "Project / Location" },
    { key: "date", label: "Date", format: "date" },
    { key: "status", label: "Status" },
    { key: "tier", label: "Tier" },
  ];

  return (
    <div>
      <div className="mb-4">
        <MobileCta href="/m/site/attendance" icon={CalendarCheck} variant="primary">
          Check in now
        </MobileCta>
      </div>

      <MobileAttendanceList
        items={serialized}
        projects={projectOptions}
        exportTitle="Attendance"
        exportRows={serialized as unknown as Record<string, unknown>[]}
        exportColumns={csvColumns}
        exportSummary={`${serialized.length} attendance records`}
      />

      {tieredRecords.length === 0 && (
        <>
          <MobileSectionTitle>Recent</MobileSectionTitle>
          <MobileEmptyState icon={CalendarCheck} title="No attendance records" />
        </>
      )}
    </div>
  );
}
