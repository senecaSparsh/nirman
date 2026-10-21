import { NextRequest } from "next/server";
import { prisma } from "@nirman/db";
import { apiHandler, getCompany, getCurrentUser, json } from "@/lib/server";

/**
 * PATCH /api/me/advances/[id] — withdraw your own pending ask. Only REQUESTED
 * rows: once HR decided, the row belongs to the ledger, not the asker.
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

  // One conditional claim — a decide landing between the read and the
  // write used to let a withdraw overwrite an ACTIVE advance (with its JE
  // already posted) back to CANCELLED. updateMany returns 0 in that race.
  const claimed = await prisma.employeeAdvance.updateMany({
    where: { id, employeeId: employee.id, companyId: company.id, status: "REQUESTED" },
    data: { status: "CANCELLED", notes: "Withdrawn by the requester" },
  });
  if (claimed.count === 0) {
    return json({ error: "Request not found or already decided" }, { status: 404 });
  }
  return json({ ok: true, status: "CANCELLED" });
});
