import { NextRequest } from "next/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma, type AttendanceStatus } from "@nirman/db";
import { apiHandler, getCompany, json, requireUser } from "@/lib/server";
import { hasPermission, PERM } from "@/lib/roles";

/**
 * POST /api/attendance/self-check-out
 *
 * Mobile self-service attendance check-out with GPS capture.
 * Updates the existing attendance record for today with check-out
 * time and GPS coordinates. Computes hoursWorked from check-in/out.
 */
export const POST = apiHandler(async (req: NextRequest) => {
  const user = await requireUser();
  const company = await getCompany();

  const schema = z.object({
    employeeId: z.string().min(1, "Employee is required"),
    date: z.string().min(1, "Date is required"),
    checkOutLat: z.number(),
    checkOutLng: z.number(),
    checkOutLocation: z.string().max(300).optional().nullable(),
  });

  const parsed = schema.safeParse(await req.json());
  if (!parsed.success) {
    return json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  }

  const attendanceDate = new Date(parsed.data.date);
  if (isNaN(attendanceDate.getTime())) {
    return json({ error: "Invalid date format" }, { status: 400 });
  }

  const dateOnly = new Date(attendanceDate);
  dateOnly.setUTCHours(0, 0, 0, 0);

  // Verify the employee belongs to this company
  const employee = await prisma.employee.findFirst({
    where: {
      id: parsed.data.employeeId,
      companyId: company.id,
      deletedAt: null,
      active: true,
    },
    select: { id: true, userId: true },
  });

  if (!employee) {
    return json({ error: "Employee not found" }, { status: 404 });
  }

  // Verify the user is linked to this employee (or is a manager/admin)
  const isSelf = employee.userId === user.id;
  const isManager = hasPermission(user.role, PERM.HR_MANAGE);
  if (!isSelf && !isManager) {
    return json({ error: "You can only check out your own attendance" }, { status: 403 });
  }

  // Find today's attendance record
  const existing = await prisma.workerAttendance.findUnique({
    where: { employeeId_date: { employeeId: parsed.data.employeeId, date: dateOnly } },
  });

  if (!existing) {
    return json({ error: "No check-in found for today. Check in first." }, { status: 404 });
  }

  const checkOutTime = new Date();
  const hoursWorked = existing.checkIn
    ? Math.round(((checkOutTime.getTime() - existing.checkIn.getTime()) / (1000 * 60 * 60)) * 100) / 100
    : null;

  // Determine final status based on hours worked
  // < 85% of standard hours (8h) → HALF_DAY
  // 85-100% → LATE
  // ≥ 100% → PRESENT
  let finalStatus = existing.status;
  if (hoursWorked !== null && existing.status === "PRESENT") {
    const pct = hoursWorked / 8;
    if (pct < 0.85) {
      finalStatus = "HALF_DAY";
    } else if (pct < 1.0) {
      finalStatus = "LATE";
    }
  }

  const updated = await prisma.workerAttendance.update({
    where: { id: existing.id },
    data: {
      checkOut: checkOutTime,
      checkOutLat: parsed.data.checkOutLat,
      checkOutLng: parsed.data.checkOutLng,
      checkOutLocation: parsed.data.checkOutLocation ?? null,
      hoursWorked: hoursWorked,
      status: finalStatus as AttendanceStatus,
    },
  });

  revalidatePath("/hr/attendance");
  revalidatePath("/m/site/attendance");
  return json({
    ok: true,
    id: updated.id,
    hoursWorked,
    status: finalStatus,
  });
});
