import { NextRequest } from "next/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@nirman/db";
import { recordAttendance } from "@nirman/services";
import { apiHandler, getCompany, json, requireUser } from "@/lib/server";
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
    checkInLat: z.number(),
    checkInLng: z.number(),
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
  const isManager = hasPermission(user.role, PERM.HR_MANAGE);
  if (!isSelf && !isManager) {
    return json({ error: "You can only check in your own attendance" }, { status: 403 });
  }

  // Geo-fence validation
  let geoFenceOk: boolean | undefined;
  let geoFenceDistance: number | undefined;
  if (employee.reportingLocation?.lat && employee.reportingLocation?.lng) {
    const distance = haversineDistance(
      parsed.data.checkInLat,
      parsed.data.checkInLng,
      employee.reportingLocation.lat,
      employee.reportingLocation.lng,
    );
    const allowedRadius = employee.reportingLocation.geoRadius ?? 500;
    geoFenceDistance = Math.round(distance);
    geoFenceOk = distance <= allowedRadius;
  }

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
    reportingLocation: employee.reportingLocation?.name ?? null,
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
