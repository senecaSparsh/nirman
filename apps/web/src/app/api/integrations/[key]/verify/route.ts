import { NextRequest } from "next/server";
import { verifyIntegration } from "@nirman/services";
import { apiHandler, getCompany, json, requirePermission } from "@/lib/server";
import { PERM } from "@/lib/roles";

/**
 * POST /api/integrations/[key]/verify
 * Test the connection for a specific integration.
 */
export const POST = apiHandler(async (req: NextRequest) => {
  const user = await requirePermission(PERM.COMPANY_MANAGE);
  const company = await getCompany();
  const key = req.url.split("/").slice(-2, -1)[0] ?? ""; // extract [key] from URL

  const result = await verifyIntegration({
    companyId: company.id,
    key,
    userId: user.id,
  });

  return json(result);
});
