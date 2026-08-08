import { NextRequest } from "next/server";
import { prisma } from "@nirman/db";
import { deleteAttendance, logAction } from "@nirman/services";
import { apiHandler, getCompany, json, attendanceSchema, requirePermission } from "@/lib/server";
import { PERM } from "@/lib/roles";

export const PATCH = apiHandler(async (req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  const user = await requirePermission(PERM.HR_MANAGE);
  const company = await getCompany();
  const { id } = await params;
  const body = await req.json();
  const parsed = attendanceSchema.partial().safeParse(body);
  if (!parsed.success) {
    return json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  }
  const updated = await prisma.$transaction(async (tx) => {
    const existing = await tx.workerAttendance.findFirst({
      where: { id, companyId: company.id },
    });
    if (!existing) throw new Error("Attendance record not found in this company");
    const att = await tx.workerAttendance.update({
      where: { id },
      data: {
        ...(parsed.data.projectId !== undefined ? { projectId: parsed.data.projectId || null } : {}),
        ...(parsed.data.checkIn !== undefined ? { checkIn: parsed.data.checkIn ? new Date(parsed.data.checkIn) : null } : {}),
        ...(parsed.data.checkOut !== undefined ? { checkOut: parsed.data.checkOut ? new Date(parsed.data.checkOut) : null } : {}),
        ...(parsed.data.hoursWorked !== undefined ? { hoursWorked: parsed.data.hoursWorked ?? null } : {}),
        ...(parsed.data.status !== undefined ? { status: parsed.data.status } : {}),
        ...(parsed.data.notes !== undefined ? { notes: parsed.data.notes ?? null } : {}),
      },
    });
    await logAction(tx, {
      userId: user.id,
      action: "ATTENDANCE_UPDATE",
      entityType: "WorkerAttendance",
      entityId: id,
      before: { status: existing.status, date: existing.date.toISOString() },
      after: { status: att.status, date: att.date.toISOString() },
    });
    return att;
  });
  return json({ ok: true, id: updated.id });
});

export const DELETE = apiHandler(async (_req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  const user = await requirePermission(PERM.HR_MANAGE);
  const { id } = await params;
  try {
    await deleteAttendance(id, user.id);
    return json({ ok: true });
  } catch (err: unknown) {
    return json({ error: (err instanceof Error ? err.message : "Failed to delete attendance record") }, { status: 400 });
  }
});
