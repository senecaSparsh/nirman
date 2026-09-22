import { apiHandler, getCompany, json, requirePermission, scopeWhere } from "@/lib/server";
import { prisma } from "@nirman/db";
import { PERM } from "@/lib/roles";

/**
 * GET /api/attendance/offsite — the off-site check-in review queue.
 *
 * A check-in outside the geofence records PRESENT but flags
 * offSiteReview=PENDING — legitimate off-site duty (supplier run,
 * client meeting, material pickup) still counts as a workday, but HR
 * sees where the worker actually was before accepting it.
 *
 * hr.manage; scoped callers only see check-ins for employees in their
 * scope (dept/project-scoped HR reviews their own people).
 */
export const GET = apiHandler(async () => {
  await requirePermission(PERM.HR_MANAGE);
  const company = await getCompany();
  const rows = await prisma.workerAttendance.findMany({
    where: {
      companyId: company.id,
      offSiteReview: { in: ["PENDING", "APPROVED", "REJECTED"] },
      employee: { deletedAt: null, ...await scopeWhere("Employee") },
    },
    orderBy: { date: "desc" },
    take: 200,
    select: {
      id: true,
      date: true,
      status: true,
      checkIn: true,
      checkOut: true,
      checkInLat: true,
      checkInLng: true,
      checkInLocation: true,
      geoFenceDistance: true,
      offSiteReview: true,
      offSiteReviewNote: true,
      offSiteReviewedAt: true,
      employee: { select: { id: true, name: true, designation: true } },
      project: { select: { id: true, name: true } },
      offSiteReviewedBy: { select: { name: true } },
    },
  });
  // PENDING first, then newest — the queue is the actionable surface.
  rows.sort((a, b) =>
    (a.offSiteReview === "PENDING" ? 0 : 1) - (b.offSiteReview === "PENDING" ? 0 : 1) ||
    b.date.getTime() - a.date.getTime(),
  );
  return json({
    reviews: rows.slice(0, 100).map((r) => ({
      id: r.id,
      date: r.date.toISOString().slice(0, 10),
      status: r.status,
      checkIn: r.checkIn?.toISOString() ?? null,
      checkOut: r.checkOut?.toISOString() ?? null,
      lat: r.checkInLat,
      lng: r.checkInLng,
      location: r.checkInLocation,
      fenceDistanceM: r.geoFenceDistance != null ? Math.round(r.geoFenceDistance) : null,
      review: r.offSiteReview,
      reviewNote: r.offSiteReviewNote,
      reviewedAt: r.offSiteReviewedAt?.toISOString() ?? null,
      reviewedBy: r.offSiteReviewedBy?.name ?? null,
      employeeId: r.employee.id,
      employeeName: r.employee.name,
      designation: r.employee.designation,
      projectName: r.project?.name ?? null,
    })),
  });
});
