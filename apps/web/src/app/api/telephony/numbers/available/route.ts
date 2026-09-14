import { NextRequest } from "next/server";
import { findAvailablePhoneNumbers } from "@nirman/services";
import { apiHandler, getCompany, json, getCurrentUser, getUserPermissions } from "@/lib/server";
import { PERM } from "@/lib/roles";

/**
 * GET /api/telephony/numbers/available — list company phone numbers that
 * are available for assignment (unassigned + ACTIVE or RECYCLED status).
 *
 * Used by the employee onboarding dialog to populate the "assign existing
 * company number" dropdown.
 *
 * Requires TELEPHONY_VIEW or HR_MANAGE (HR managers need this during
 * employee onboarding to assign a company phone).
 */
export const GET = apiHandler(async (_req: NextRequest) => {
  const user = await getCurrentUser();
  if (!user) throw new Error("Unauthorized");
  const perms = await getUserPermissions();
  // OWNER/ADMIN have "*" so they pass automatically.
  if (!perms.includes(PERM.TELEPHONY_VIEW) && !perms.includes(PERM.HR_MANAGE)) {
    throw new Error("Forbidden");
  }
  const company = await getCompany();
  const numbers = await findAvailablePhoneNumbers(company.id);
  return json(numbers);
});
