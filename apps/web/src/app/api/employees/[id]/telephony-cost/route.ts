import { NextRequest } from "next/server";
import { prisma } from "@nirman/db";
import { getEmployeeTelephonyCost, HrError } from "@nirman/services";
import { apiHandler, getCompany, json, requirePermission, scopeWhere } from "@/lib/server";
import { PERM } from "@/lib/roles";

/**
 * GET /api/employees/[id]/telephony-cost — aggregate call/SMS usage and
 * estimated cost for the employee's assigned company phone number.
 *
 * Returns: {
 *   companyPhoneId, phoneNumber, monthlyCost,
 *   totalCalls, totalCallSeconds, totalSms,
 *   estimatedCallCost, estimatedSmsCost, totalEstimatedCost
 * }
 *
 * Requires TELEPHONY_VIEW (or HR_VIEW — the employee profile needs this).
 */
export const GET = apiHandler(async (_req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  await requirePermission(PERM.HR_VIEW);
  const company = await getCompany();
  const { id } = await params;

  // Scope + H1 wall — telephony cost is still employee data; a scoped
  // viewer must not reach an out-of-scope employee's call ledger.
  const visible = await prisma.employee.findFirst({
    where: { id, companyId: company.id, deletedAt: null, ...await scopeWhere("Employee") },
    select: { id: true },
  });
  if (!visible) return json({ error: "Employee not found" }, { status: 404 });

  try {
    const result = await getEmployeeTelephonyCost(id, company.id);
    return json(result);
  } catch (err: unknown) {
    if (err instanceof HrError) {
      return json({ error: err.message }, { status: err.status });
    }
    throw err;
  }
});
