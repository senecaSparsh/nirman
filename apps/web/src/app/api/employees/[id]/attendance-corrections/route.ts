import { NextRequest } from "next/server";
import { prisma } from "@nirman/db";
import { apiHandler, getCompany, json, requirePermission, scopeWhere } from "@/lib/server";
import { PERM } from "@/lib/roles";

/**
 * GET /api/employees/[id]/attendance-corrections — the employee's punch-fix
 * asks. hr.view-scoped; the dossier renders pending rows as decide buttons.
 */
export const GET = apiHandler(async (_req: NextRequest, ctx: { params: Promise<{ id: string }> }) => {
  await requirePermission(PERM.HR_VIEW);
  const company = await getCompany();
  const { id } = await ctx.params;
  const employee = await prisma.employee.findFirst({
    where: { id, companyId: company.id, deletedAt: null, ...await scopeWhere("Employee") },
    select: { id: true },
  });
  if (!employee) return json({ error: "Employee not found" }, { status: 404 });

  const requests = await prisma.attendanceCorrectionRequest.findMany({
    where: { employeeId: id, companyId: company.id },
    orderBy: { createdAt: "desc" },
    take: 20,
    include: { reviewedBy: { select: { name: true } } },
  });
  return json({
    requests: requests.map((r) => ({
      id: r.id,
      date: r.date.toISOString().slice(0, 10),
      status: r.status,
      requestedStatus: r.requestedStatus,
      checkIn: r.requestedCheckIn?.toISOString() ?? null,
      checkOut: r.requestedCheckOut?.toISOString() ?? null,
      reason: r.reason,
      reviewNote: r.reviewNote,
      reviewedBy: r.reviewedBy?.name ?? null,
      createdAt: r.createdAt.toISOString(),
    })),
  });
});
