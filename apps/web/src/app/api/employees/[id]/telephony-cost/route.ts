import { NextRequest } from "next/server";
import { getEmployeeTelephonyCost, HrError } from "@nirman/services";
import { apiHandler, getCompany, json, requirePermission } from "@/lib/server";
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
