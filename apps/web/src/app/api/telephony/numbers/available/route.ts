import { NextRequest } from "next/server";
import { findAvailablePhoneNumbers } from "@nirman/services";
import { apiHandler, getCompany, json, requirePermission } from "@/lib/server";
import { PERM } from "@/lib/roles";

/**
 * GET /api/telephony/numbers/available — list company phone numbers that
 * are available for assignment (unassigned + ACTIVE or RECYCLED status).
 *
 * Used by the employee onboarding dialog to populate the "assign existing
 * company number" dropdown.
 *
 * Requires TELEPHONY_VIEW.
 */
export const GET = apiHandler(async (_req: NextRequest) => {
  await requirePermission(PERM.TELEPHONY_VIEW);
  const company = await getCompany();
  const numbers = await findAvailablePhoneNumbers(company.id);
  return json(numbers);
});
