import { NextRequest } from "next/server";
import { prisma } from "@nirman/db";
import type { Prisma } from "@nirman/db";
import { recordAttendance, bulkRecordAttendance, combineTimeWithDate } from "@nirman/services";
import { apiHandler, getCompany, json, attendanceSchema, bulkAttendanceSchema, requirePermission, toNum } from "@/lib/server";
import { PERM } from "@/lib/roles";

export const GET = apiHandler(async (req: NextRequest) => {
  await requirePermission(PERM.HR_VIEW);
  const company = await getCompany();
  const url = new URL(req.url);
  const date = url.searchParams.get("date");
  const startDate = url.searchParams.get("startDate");
  const endDate = url.searchParams.get("endDate");
  const projectId = url.searchParams.get("projectId");
  const employeeId = url.searchParams.get("employeeId");

  const where: Record<string, unknown> = { companyId: company.id };
  if (date) {
    // Use UTC date range to match @db.Date storage (stored as UTC midnight)
    const dayStart = new Date(date + "T00:00:00.000Z");
    const dayEnd = new Date(date + "T23:59:59.999Z");
    where.date = { gte: dayStart, lte: dayEnd };
  } else if (startDate && endDate) {
    where.date = { gte: new Date(startDate), lte: new Date(endDate) };
  }
  if (projectId) where.projectId = projectId;
  if (employeeId) where.employeeId = employeeId;

  const records = await prisma.workerAttendance.findMany({
    where: where as Prisma.WorkerAttendanceWhereInput,
    orderBy: { date: "desc" },
    take: 500,
    include: {
      employee: { select: { id: true, name: true, trade: true } },
      project: { select: { id: true, name: true } },
    },
  });

  return json(
    records.map((r) => ({
      id: r.id,
      employeeId: r.employeeId,
      employeeName: r.employee.name,
      trade: r.employee.trade,
      date: r.date,
      projectId: r.projectId,
      projectName: r.project?.name ?? null,
      checkIn: r.checkIn,
      checkOut: r.checkOut,
      hoursWorked: r.hoursWorked ? toNum(r.hoursWorked) : null,
      status: r.status,
      notes: r.notes,
      checkInLat: r.checkInLat,
      checkInLng: r.checkInLng,
      checkOutLat: r.checkOutLat,
      checkOutLng: r.checkOutLng,
      checkInLocation: r.checkInLocation,
      checkOutLocation: r.checkOutLocation,
    })),
  );
});

export const POST = apiHandler(async (req: NextRequest) => {
  const user = await requirePermission(PERM.HR_MANAGE);
  const company = await getCompany();
  const body = await req.json();

  // Support both single and bulk attendance
  if (Array.isArray(body.records)) {
    const parsed = bulkAttendanceSchema.safeParse(body);
    if (!parsed.success) {
      return json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
    }
    const results = await bulkRecordAttendance({
      companyId: company.id,
      date: new Date(parsed.data.date),
      projectId: parsed.data.projectId ?? undefined,
      records: parsed.data.records.map((r) => ({
        employeeId: r.employeeId,
        status: r.status,
        checkIn: r.checkIn ?? undefined,
        checkOut: r.checkOut ?? undefined,
        hoursWorked: r.hoursWorked ?? undefined,
        notes: r.notes ?? undefined,
        checkInLat: r.checkInLat ?? undefined,
        checkInLng: r.checkInLng ?? undefined,
        checkOutLat: r.checkOutLat ?? undefined,
        checkOutLng: r.checkOutLng ?? undefined,
        checkInLocation: r.checkInLocation ?? undefined,
        checkOutLocation: r.checkOutLocation ?? undefined,
      })),
      recordedById: user.id,
      userId: user.id,
    });
    return json({ ok: true, results }, { status: 201 });
  }

  const parsed = attendanceSchema.safeParse(body);
  if (!parsed.success) {
    return json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  }
  const attendanceDate = new Date(parsed.data.date);
  const attendance = await recordAttendance({
    companyId: company.id,
    employeeId: parsed.data.employeeId,
    date: attendanceDate,
    projectId: parsed.data.projectId ?? undefined,
    checkIn: parsed.data.checkIn ? combineTimeWithDate(attendanceDate, parsed.data.checkIn) : undefined,
    checkOut: parsed.data.checkOut ? combineTimeWithDate(attendanceDate, parsed.data.checkOut) : undefined,
    hoursWorked: parsed.data.hoursWorked ?? undefined,
    status: parsed.data.status,
    notes: parsed.data.notes ?? undefined,
    recordedById: user.id,
    userId: user.id,
  });
  return json({ ok: true, id: attendance.id }, { status: 201 });
});
