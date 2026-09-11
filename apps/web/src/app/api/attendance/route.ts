import { NextRequest } from "next/server";
import { prisma } from "@nirman/db";
import type { Prisma } from "@nirman/db";
import { recordAttendance, bulkRecordAttendance, combineTimeWithDate, computeAttendanceTier } from "@nirman/services";
import { apiHandler, getCompany, json, attendanceSchema, bulkAttendanceSchema, requirePermission, toNum, scopeWhere, assertScopeAllows } from "@/lib/server";
import { PERM } from "@/lib/roles";
import { parseCursorParams, cursorToWhere, buildCursorResponse } from "@/lib/cursor-pagination";

export const GET = apiHandler(async (req: NextRequest) => {
  await requirePermission(PERM.HR_VIEW);
  const company = await getCompany();
  const url = new URL(req.url);
  const date = url.searchParams.get("date");
  const startDate = url.searchParams.get("startDate");
  const endDate = url.searchParams.get("endDate");
  const projectId = url.searchParams.get("projectId");
  const employeeId = url.searchParams.get("employeeId");

  // Cursor pagination — backward compatible. If `cursor` param is present,
  // return { items, nextCursor, hasMore }. Otherwise return flat array.
  const { take, cursor, skip } = parseCursorParams(req);
  const usePagination = url.searchParams.has("cursor") || url.searchParams.has("take");

  const where: Record<string, unknown> = { companyId: company.id, ...await scopeWhere("WorkerAttendance", {}) };
  if (date) {
    // Use UTC date range to match @db.Date storage (stored as UTC midnight)
    const dayStart = new Date(date + "T00:00:00.000Z");
    const dayEnd = new Date(date + "T23:59:59.999Z");
    if (isNaN(dayStart.getTime()) || isNaN(dayEnd.getTime())) {
      return json({ error: "Invalid date format" }, { status: 400 });
    }
    where.date = { gte: dayStart, lte: dayEnd };
  } else if (startDate && endDate) {
    const s = new Date(startDate);
    const e = new Date(endDate);
    if (isNaN(s.getTime()) || isNaN(e.getTime())) {
      return json({ error: "Invalid date range format" }, { status: 400 });
    }
    where.date = { gte: s, lte: e };
  }
  if (projectId) where.projectId = projectId;
  if (employeeId) where.employeeId = employeeId;
  // Apply cursor filter (uses "date" field for ordering)
  const cursorFilter = cursorToWhere(cursor, "date");
  if (cursorFilter) Object.assign(where, cursorFilter);

  const records = await prisma.workerAttendance.findMany({
    where: where as Prisma.WorkerAttendanceWhereInput,
    orderBy: { date: "desc" },
    take: usePagination ? take + 1 : 500,
    skip: usePagination ? skip : undefined,
    include: {
      employee: { select: { id: true, name: true, trade: true } },
      project: { select: { id: true, name: true } },
    },
  });

  // ── Traffic-light tier computation ──────────────────────────
  // For each attendance record, check if a DPR exists for the same
  // project+date and whether it's approved. Then compute the tier:
  //   RED    = absent / not at location
  //   YELLOW = present but DPR not approved yet
  //   GREEN  = present + DPR approved (or paid leave)
  const projectDateKeys = new Set(
    records
      .filter((r) => r.projectId)
      .map((r) => `${r.projectId}|${r.date.toISOString().slice(0, 10)}`),
  );
  const dprApprovalMap = new Map<string, boolean>();
  if (projectDateKeys.size > 0) {
    // Build a targeted OR clause from the actual project+date pairs we need,
    // instead of fetching ALL company DPRs and filtering in JS.
    // This uses the existing @@index([projectId, date]) for fast lookups.
    const projectDatePairs = Array.from(projectDateKeys).map((key) => {
      const [projId, dateStr] = key.split("|");
      const dayStart = new Date(dateStr + "T00:00:00.000Z");
      const dayEnd = new Date(dateStr + "T23:59:59.999Z");
      return { projectId: projId, date: { gte: dayStart, lte: dayEnd } };
    });
    const dprs = await prisma.dailyProgressReport.findMany({
      where: {
        companyId: company.id,
        OR: projectDatePairs,
        ...await scopeWhere("DailyProgressReport"),
      },
      select: { projectId: true, date: true, approvalStatus: true },
    });
    for (const dpr of dprs) {
      const key = `${dpr.projectId}|${dpr.date.toISOString().slice(0, 10)}`;
      dprApprovalMap.set(key, dpr.approvalStatus === "APPROVED");
    }
  }

  const mapped = records.map((r) => {
      const dprKey = r.projectId ? `${r.projectId}|${r.date.toISOString().slice(0, 10)}` : null;
      const dprApproved = dprKey ? (dprApprovalMap.get(dprKey) ?? false) : false;
      const hasGpsCheckIn = r.checkInLat != null && r.checkInLng != null;
      const tier = computeAttendanceTier({
        status: r.status,
        hasGpsCheckIn,
        dprApproved,
        geoFenceOk: r.geoFenceOk,
      });
      return {
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
        tier,
        dprApproved,
        notes: r.notes,
        checkInLat: r.checkInLat,
        checkInLng: r.checkInLng,
        checkOutLat: r.checkOutLat,
        checkOutLng: r.checkOutLng,
        checkInLocation: r.checkInLocation,
        checkOutLocation: r.checkOutLocation,
        geoFenceOk: r.geoFenceOk,
        geoFenceDistance: r.geoFenceDistance,
      };
    });

  if (usePagination) {
    const { items, nextCursor, hasMore } = buildCursorResponse(mapped, take, (r) => ({
      createdAt: r.date instanceof Date ? r.date.toISOString() : r.date,
      id: r.id,
    }));
    return json({ items, nextCursor, hasMore });
  }
  return json(mapped);
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
    const parsedDate = new Date(parsed.data.date);
    if (isNaN(parsedDate.getTime())) {
      return json({ error: "Invalid date format" }, { status: 400 });
    }
    try {
      await assertScopeAllows({
        projectId: parsed.data.projectId ?? null,
        departmentId: null,
      });
    } catch (err) {
      return json(
        { error: err instanceof Error ? err.message : "Scope violation" },
        { status: 403 },
      );
    }
    const results = await bulkRecordAttendance({
      companyId: company.id,
      date: parsedDate,
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
  if (isNaN(attendanceDate.getTime())) {
    return json({ error: "Invalid date format" }, { status: 400 });
  }
  try {
    await assertScopeAllows({
      projectId: parsed.data.projectId ?? null,
      departmentId: null,
    });
  } catch (err) {
    return json(
      { error: err instanceof Error ? err.message : "Scope violation" },
      { status: 403 },
    );
  }
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
    checkInLat: parsed.data.checkInLat ?? undefined,
    checkInLng: parsed.data.checkInLng ?? undefined,
    checkOutLat: parsed.data.checkOutLat ?? undefined,
    checkOutLng: parsed.data.checkOutLng ?? undefined,
    checkInLocation: parsed.data.checkInLocation ?? undefined,
    checkOutLocation: parsed.data.checkOutLocation ?? undefined,
    geoFenceOk: parsed.data.geoFenceOk ?? undefined,
    geoFenceDistance: parsed.data.geoFenceDistance ?? undefined,
  });
  return json({ ok: true, id: attendance.id }, { status: 201 });
});
