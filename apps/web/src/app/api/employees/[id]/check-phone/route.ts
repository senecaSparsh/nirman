import { NextRequest } from "next/server";
import { checkPhoneAvailability } from "@nirman/services";
import { apiHandler, getCompany, json, requirePermission } from "@/lib/server";
import { PERM } from "@/lib/roles";

/**
 * GET /api/employees/[id]/check-phone?phone=xxx — check if a phone number
 * is available for assignment to this employee.
 *
 * Returns:
 *   { available: boolean, recycled?: boolean, companyPhoneId?: string,
 *     reason?: string, assignedToName?: string, existingUser?: { id, name, email } }
 *
 * Requires HR_VIEW.
 */
export const GET = apiHandler(async (req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  await requirePermission(PERM.HR_VIEW);
  const company = await getCompany();
  const { id: _id } = await params;

  const url = new URL(req.url);
  const phone = url.searchParams.get("phone");
  if (!phone?.trim()) {
    return json({ error: "phone query parameter is required" }, { status: 400 });
  }

  const result = await checkPhoneAvailability(phone, company.id);
  return json(result);
});
