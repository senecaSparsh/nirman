import { NextRequest } from "next/server";
import { prisma } from "@nirman/db";
import { apiHandler, getCompany, json, requirePermission, toNum, scopeWhere } from "@/lib/server";
import { PERM } from "@/lib/roles";

/**
 * GET /api/employees/[id]/salary-history — list all salary history
 * records for this employee, ordered by effective date descending.
 *
 * Each record is a snapshot of the salary structure at a point in time:
 *   - components (JSON): the full CTC breakdown
 *   - totalCtc: total annual CTC at that point
 *   - effectiveFrom: when this structure took effect
 *   - changeReason: why it was changed (annual review, promotion, etc.)
 *   - changedBy: who made the change
 *   - createdAt: when the record was created
 *
 * Requires HR_VIEW (or PAYROLL_VIEW) — salary history is sensitive.
 */
export const GET = apiHandler(async (_req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  await requirePermission(PERM.HR_VIEW);
  const company = await getCompany();
  const { id } = await params;

  // Verify the employee belongs to this company
  const employee = await prisma.employee.findFirst({
    where: { id, companyId: company.id, deletedAt: null, ...await scopeWhere("Employee") },
    select: { id: true, name: true },
  });
  if (!employee) return json({ error: "Employee not found" }, { status: 404 });

  const history = await prisma.salaryHistory.findMany({
    where: { employeeId: id, companyId: company.id },
    orderBy: { effectiveFrom: "desc" },
    select: {
      id: true,
      components: true,
      totalCtc: true,
      effectiveFrom: true,
      changeReason: true,
      changedBy: true,
      createdAt: true,
    },
    take: 50,
  });

  // Load the names of who made each change
  const changedByIds = [...new Set(history.map((h) => h.changedBy))];
  const changers = await prisma.user.findMany({
    where: { id: { in: changedByIds } },
    select: { id: true, name: true },
  });
  const changerMap = new Map(changers.map((u) => [u.id, u.name]));

  return json({
    history: history.map((h) => ({
      id: h.id,
      components: h.components as unknown as Array<{
        type: string;
        amount: number;
        frequency: string;
        isDeduction: boolean;
        isPercentage?: boolean;
        percentageOfBasic?: number | null;
      }>,
      totalCtc: h.totalCtc != null ? toNum(h.totalCtc) : null,
      effectiveFrom: h.effectiveFrom.toISOString(),
      changeReason: h.changeReason,
      changedByName: changerMap.get(h.changedBy) ?? "Unknown",
      createdAt: h.createdAt.toISOString(),
    })),
  });
});
