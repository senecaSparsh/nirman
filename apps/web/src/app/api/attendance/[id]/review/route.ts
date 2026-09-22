import { NextRequest } from "next/server";
import { prisma } from "@nirman/db";
import { apiHandler, getCompany, json, requirePermission, scopeWhere, assertCanManageEmployee } from "@/lib/server";
import { PERM } from "@/lib/roles";
import { assertAttendancePeriodOpen, logAction } from "@nirman/services";

/**
 * PATCH /api/attendance/[id]/review — approve or reject an off-site check-in.
 *
 * Body: { decision: "APPROVED" | "REJECTED", note? }
 *
 *   APPROVED — the off-site day stands as PRESENT (legitimate duty).
 *   REJECTED — the day flips to ABSENT; payroll recomputes on the next
 *              generate (draft periods pick it up automatically).
 *
 * Guards: hr.manage + assertCanManageEmployee (scope, H1 wall, held-set).
 */
export const PATCH = apiHandler(async (req: NextRequest, ctx: { params: Promise<{ id: string }> }) => {
  const user = await requirePermission(PERM.HR_MANAGE);
  const company = await getCompany();
  const { id } = await ctx.params;

  const attendance = await prisma.workerAttendance.findFirst({
    where: { id, companyId: company.id, employee: { deletedAt: null, ...await scopeWhere("Employee") } },
    select: { id: true, employeeId: true, status: true, offSiteReview: true, date: true },
  });
  if (!attendance) return json({ error: "Attendance record not found" }, { status: 404 });
  if (!attendance.offSiteReview) {
    return json({ error: "This check-in is not flagged for off-site review" }, { status: 400 });
  }
  // Decided rows are final — a post-decision flip (APPROVED → REJECTED after
  // the period was paid) would mark a paid day ABSENT while the payslip
  // still shows PRESENT. Corrections go through the attendance matrix.
  if (attendance.offSiteReview !== "PENDING") {
    return json(
      { error: `Already ${attendance.offSiteReview.toLowerCase()} — correct the attendance record instead.` },
      { status: 409 },
    );
  }

  try {
    await assertCanManageEmployee(attendance.employeeId, company.id);
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : "Hierarchy violation" }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const decision = body.decision as string;
  if (decision !== "APPROVED" && decision !== "REJECTED") {
    return json({ error: 'decision must be "APPROVED" or "REJECTED"' }, { status: 400 });
  }

  // Rejecting flips the day to ABSENT — inside a paid period that would
  // diverge the record from the issued payslip. Block; the recovery is a
  // deduction line in the next period.
  try {
    await assertAttendancePeriodOpen(company.id, attendance.date);
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : "Period locked" }, { status: 409 });
  }

  const updated = await prisma.workerAttendance.update({
    where: { id: attendance.id },
    data: {
      offSiteReview: decision,
      offSiteReviewedById: user.id,
      offSiteReviewedAt: new Date(),
      offSiteReviewNote: body.note?.trim() || null,
      // Rejected off-site check-ins don't count as a workday.
      ...(decision === "REJECTED" ? { status: "ABSENT" } : {}),
    },
  });
  await logAction(prisma, {
    userId: user.id,
    companyId: company.id,
    action: `ATTENDANCE_OFFSITE_${decision}`,
    entityType: "WorkerAttendance",
    entityId: attendance.id,
    before: { status: attendance.status, offSiteReview: attendance.offSiteReview },
    after: { status: updated.status, offSiteReview: decision, note: body.note },
  });
  return json({ ok: true, status: updated.status, review: updated.offSiteReview });
});
