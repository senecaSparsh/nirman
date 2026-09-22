import { prisma } from "@nirman/db";
import { getAttendanceWithTiers } from "@nirman/services";
import { CalendarCheck, MapPin } from "lucide-react";
import { MobileListPage } from "@/components/mobile/v2/list-page";
import {
  MobileSectionTitle,
  MobileEmptyState,
  MobileCta} from "@/components/mobile/v2/primitives";
import { PERM, roleTier } from "@/lib/roles";
import { MobileAttendanceList } from "./MobileAttendanceList";
import { OffsiteReviewStrip } from "./OffsiteReviewStrip";
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
export default function MobileAttendancePage({
  searchParams}: {
  searchParams: Promise<{ projectId?: string }>;
}) {
  return (
    <MobileListPage perm={PERM.HR_VIEW} what="attendance" permission="hr.view">
      {async ({ company, ownRole, perms }) => {
        const { projectId } = await searchParams;
        const canManageAttendance = perms.includes(PERM.HR_MANAGE);
        const isFieldStaff = roleTier(ownRole) >= 4;
        // Fetch attendance with traffic-light tiers via the service rollup
        // (joins attendance → DPR approval status per project+date)
        const today = new Date();
        const from = new Date(today);
        from.setDate(from.getDate() - 30); // last 30 days

        const [tieredRecords, projects, pendingOffsite] = await Promise.all([
          getAttendanceWithTiers({ companyId: company.id, from, to: today }),
          prisma.project.findMany({
            where: { companyId: company.id, deletedAt: null },
            select: { id: true, name: true },
            orderBy: { name: "asc" }}),
          // Off-site check-ins awaiting HR review — provisional PRESENT
          // until someone with hr.manage accepts or rejects them.
          canManageAttendance
            ? prisma.workerAttendance.findMany({
                where: {
                  companyId: company.id,
                  offSiteReview: "PENDING",
                  employee: { deletedAt: null },
                },
                orderBy: { date: "desc" },
                take: 25,
                select: {
                  id: true, date: true, checkIn: true,
                  checkInLat: true, checkInLng: true, checkInLocation: true,
                  geoFenceDistance: true,
                  employee: { select: { id: true, name: true, designation: true } },
                  project: { select: { name: true } },
                }})
            : Promise.resolve([]),
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
          checkOut: r.checkOut?.toTimeString().slice(0, 5) ?? null}));

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

            {isFieldStaff && !canManageAttendance && (
              <div className="mb-4">
                <MobileCta href="/m/home" icon={MapPin} variant="primary">
                  Self check-in
                </MobileCta>
              </div>
            )}

            {pendingOffsite.length > 0 && (
              <OffsiteReviewStrip
                rows={pendingOffsite.map((r) => ({
                  id: r.id,
                  employeeName: r.employee.name,
                  designation: r.employee.designation,
                  projectName: r.project?.name ?? null,
                  date: r.date.toISOString().slice(0, 10),
                  checkIn: r.checkIn?.toISOString() ?? null,
                  lat: r.checkInLat,
                  lng: r.checkInLng,
                  location: r.checkInLocation,
                  fenceDistanceM: r.geoFenceDistance != null ? Math.round(r.geoFenceDistance) : null,
                }))}
              />
            )}

            <MobileAttendanceList
              initialProject={projectId ?? null}
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
