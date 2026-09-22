import { NextRequest } from "next/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@nirman/db";
import { recordAttendance } from "@nirman/services";
import { apiHandler, getCompany, json, requireUser, getActingRole, assertScopeAllows } from "@/lib/server";
import { hasPermission, PERM } from "@/lib/roles";

/**
 * POST /api/attendance/self-check-in
 *
 * Mobile self-service attendance check-in with GPS capture.
 * The employee's phone captures GPS coordinates and sends them
 * with the check-in time. The system validates the GPS against
 * the employee's reporting location geo-fence (if configured).
 *
 * This endpoint uses requireUser() (not requirePermission) because
 * it's self-service — any logged-in user can check in their own
 * attendance. The employee is resolved via user.userId → Employee.
 */
export const POST = apiHandler(async (req: NextRequest) => {
  const user = await requireUser();
  const company = await getCompany();

  const schema = z.object({
    employeeId: z.string().min(1, "Employee is required"),
    date: z.string().min(1, "Date is required"),
    checkInLat: z.number().min(-90).max(90),
    checkInLng: z.number().min(-180).max(180),
    checkInLocation: z.string().max(300).optional().nullable(),
    projectId: z.string().optional().nullable(),
  });

  const parsed = schema.safeParse(await req.json());
  if (!parsed.success) {
    return json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  }

  const attendanceDate = new Date(parsed.data.date);
  if (isNaN(attendanceDate.getTime())) {
    return json({ error: "Invalid date format" }, { status: 400 });
  }

  // Verify the employee belongs to this company and is linked to this user
  const employee = await prisma.employee.findFirst({
    where: {
      id: parsed.data.employeeId,
      companyId: company.id,
      deletedAt: null,
      active: true,
    },
    include: {
      reportingLocation: {
        select: { id: true, name: true, lat: true, lng: true, geoRadius: true },
      },
    },
  });

  if (!employee) {
    return json({ error: "Employee not found" }, { status: 404 });
  }

  // Verify the user is linked to this employee (or is a manager/admin)
  const isSelf = employee.userId === user.id;
  const isManager = hasPermission(await getActingRole(), PERM.HR_MANAGE);
  if (!isSelf && !isManager) {
    return json({ error: "You can only check in your own attendance" }, { status: 403 });
  }

  // Geo-fence validation — pick the most specific fence for where the
  // worker claims to be:
  //   1. The project site they checked into (a fenced StockLocation on that
  //      project) — an office-assigned worker on site today passes on the
  //      site fence, not the office fence.
  //   2. Their assigned reporting location.
  //   3. The company's verified HQ geofence.
  let geoFenceOk: boolean | undefined;
  let geoFenceDistance: number | undefined;
  const projectSiteFence = parsed.data.projectId
    ? await prisma.stockLocation.findFirst({
        where: {
          projectId: parsed.data.projectId,
          companyId: company.id,
          deletedAt: null,
          lat: { not: null },
          lng: { not: null },
        },
        select: { lat: true, lng: true, geoRadius: true, name: true },
      })
    : null;
  const fence = projectSiteFence && projectSiteFence.lat != null && projectSiteFence.lng != null
    ? { lat: projectSiteFence.lat, lng: projectSiteFence.lng, radius: projectSiteFence.geoRadius ?? 500, name: projectSiteFence.name }
    : employee.reportingLocation?.lat != null && employee.reportingLocation?.lng != null
      ? { lat: employee.reportingLocation.lat, lng: employee.reportingLocation.lng, radius: employee.reportingLocation.geoRadius ?? 500, name: employee.reportingLocation.name }
      : !employee.reportingLocationId && company.lat != null && company.lng != null
        ? { lat: company.lat, lng: company.lng, radius: company.geoRadius ?? 500, name: `${company.name} — Head Office` }
        : null;
  if (fence) {
    const distance = haversineDistance(
      parsed.data.checkInLat,
      parsed.data.checkInLng,
      fence.lat,
      fence.lng,
    );
    geoFenceDistance = Math.round(distance);
    geoFenceOk = distance <= fence.radius;
  }

    // A project-scoped user can only record attendance on their assigned projects.
  await assertScopeAllows({ projectId: parsed.data.projectId });
const attendance = await recordAttendance({
    companyId: company.id,
    employeeId: parsed.data.employeeId,
    date: attendanceDate,
    projectId: parsed.data.projectId ?? undefined,
    checkIn: new Date(),
    status: "PRESENT",
    checkInLat: parsed.data.checkInLat,
    checkInLng: parsed.data.checkInLng,
    checkInLocation: parsed.data.checkInLocation ?? undefined,
    geoFenceOk,
    geoFenceDistance,
    // Off-site check-in → PENDING review. The day still records as PRESENT
    // (legitimate off-site duty happens — supplier run, client meeting) but
    // lands in HR's review queue; a reject flips it to ABSENT.
    offSiteReview: geoFenceOk === false ? "PENDING" : null,
    recordedById: user.id,
    userId: user.id,
  });

  revalidatePath("/hr/attendance");
  revalidatePath("/m/site/attendance");
  return json({
    ok: true,
    id: attendance.id,
    geoFenceOk,
    geoFenceDistance,
    reportingLocation: fence?.name ?? null,
    offSiteReview: geoFenceOk === false ? "PENDING" : null,
  }, { status: 201 });
});

/** Haversine distance between two lat/lng points in metres. */
function haversineDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000; // Earth radius in metres
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
