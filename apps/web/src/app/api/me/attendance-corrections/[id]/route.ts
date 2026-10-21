import { NextRequest } from "next/server";
import { prisma } from "@nirman/db";
import { apiHandler, getCompany, getCurrentUser, json } from "@/lib/server";

/**
 * PATCH /api/me/attendance-corrections/[id] — withdraw your own pending ask.
 * Only REQUESTED rows; decided requests are audit history.
 */
export const PATCH = apiHandler(async (_req: NextRequest, ctx: { params: Promise<{ id: string }> }) => {
  const user = await getCurrentUser();
  if (!user) return json({ error: "Unauthorized" }, { status: 401 });
  const company = await getCompany();
  const { id } = await ctx.params;

  const employee = await prisma.employee.findFirst({
    where: { companyId: company.id, deletedAt: null, userId: user.id },
    select: { id: true },
  });
  if (!employee) return json({ error: "No employee record is linked to your account" }, { status: 404 });

  const request = await prisma.attendanceCorrectionRequest.findFirst({
    where: { id, employeeId: employee.id, companyId: company.id },
    select: { id: true, status: true },
  });
  if (!request) return json({ error: "Correction request not found" }, { status: 404 });
  if (request.status !== "REQUESTED") {
    return json({ error: "HR has already decided this request — it can no longer be withdrawn" }, { status: 400 });
  }

  await prisma.attendanceCorrectionRequest.update({
    where: { id: request.id },
    data: { status: "CANCELLED", reviewNote: "Withdrawn by the requester" },
  });
  return json({ ok: true, status: "CANCELLED" });
});
