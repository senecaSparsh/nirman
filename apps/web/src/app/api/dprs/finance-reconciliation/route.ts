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

  const start = startDate ? new Date(startDate) : undefined;
  const end = endDate ? new Date(endDate) : undefined;
  if (start && isNaN(start.getTime())) {
    return json({ error: "Invalid startDate format" }, { status: 400 });
  }
  if (end && isNaN(end.getTime())) {
    return json({ error: "Invalid endDate format" }, { status: 400 });
  }

  const reconciliation = await dprFinanceReconciliation(company.id, start, end);

  return json(reconciliation);
});
