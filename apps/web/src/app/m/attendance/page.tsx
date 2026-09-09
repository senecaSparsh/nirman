import { prisma } from "@nirman/db";
import { getAttendanceWithTiers } from "@nirman/services";
import { CalendarCheck } from "lucide-react";
import { MobileListPage } from "@/components/mobile/v2/list-page";
import {
  MobileSectionTitle,
  MobileEmptyState,
  MobileCta,
} from "@/components/mobile/v2/primitives";
import { PERM, hasPermission } from "@/lib/roles";
import { MobileAttendanceList } from "./MobileAttendanceList";
import type { MobileColumnSpec } from "@/components/mobile/v2/export-share-bar";

/**
 * /m/attendance — mobile attendance list. Replaces desktop `/hr/attendance`
 * leaks. Links to the existing mobile attendance form for today's check-in.
 *
 * The "Check in now" CTA links to /m/site/attendance which requires HR_MANAGE
 * (manager logging attendance on behalf of workers). Field workers use the
 * self-check-in widget on /m/home instead. So the CTA is only shown to users
 * with HR_MANAGE permission — everyone else just sees their attendance history.
 */
export default function MobileAttendancePage() {
  return (
    <MobileListPage perm={PERM.HR_VIEW} what="attendance" permission="hr.view">
      {async ({ company, role }) => {
        const canManageAttendance = hasPermission(role, PERM.HR_MANAGE);
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
          employeeId: r.employeeId,
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
            {canManageAttendance && (
              <div className="mb-4">
                <MobileCta href="/m/site/attendance" icon={CalendarCheck} variant="primary">
                  Check in now
                </MobileCta>
              </div>
            )}

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
      }}
    </MobileListPage>
  );
}
