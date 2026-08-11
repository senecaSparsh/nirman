import { NextRequest } from "next/server";
import { dprFinanceReconciliation } from "@nirman/services";
import { apiHandler, getCompany, json, requirePermission } from "@/lib/server";
import { PERM } from "@/lib/roles";

export const GET = apiHandler(async (req: NextRequest) => {
  await requirePermission(PERM.FINANCE_VIEW);
  const company = await getCompany();
  const { searchParams } = new URL(req.url);
  const startDate = searchParams.get("startDate");
  const endDate = searchParams.get("endDate");

  const reconciliation = await dprFinanceReconciliation(
    company.id,
    startDate ? new Date(startDate) : undefined,
    endDate ? new Date(endDate) : undefined,
  );

  return json(reconciliation);
});
