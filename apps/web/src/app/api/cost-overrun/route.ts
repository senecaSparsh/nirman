import { NextRequest } from "next/server";
import { getCostOverrunForecast, ServiceError } from "@nirman/services";
import { apiHandler, assertScopeAllows, getCompany, json, requirePermission } from "@/lib/server";
import { PERM } from "@/lib/roles";

export const GET = apiHandler(async (req: NextRequest) => {
  await requirePermission(PERM.PROJECT_CONTROL_VIEW);
  const company = await getCompany();
  const { searchParams } = new URL(req.url);
  const projectId = searchParams.get("projectId");
  if (!projectId) return json({ error: "projectId is required" }, { status: 400 });
  try {
    await assertScopeAllows({ projectId, departmentId: null });
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : "Scope violation" }, { status: 403 });
  }
  try {
    const forecast = await getCostOverrunForecast(projectId, company.id);
    return json(forecast.map((f) => ({
      ...f,
      budgetedQty: f.budgetedQty.toNumber(),
      budgetedAmount: f.budgetedAmount.toNumber(),
      actualQty: f.actualQty.toNumber(),
      actualCost: f.actualCost.toNumber(),
      committedQty: f.committedQty.toNumber(),
      committedCost: f.committedCost.toNumber(),
      pendingReqQty: f.pendingReqQty.toNumber(),
      projectedQty: f.projectedQty.toNumber(),
      projectedCost: f.projectedCost.toNumber(),
      overrun: f.overrun.toNumber(),
      overrunPct: f.overrunPct.toNumber(),
    })));
  } catch (err) {
    if (err instanceof ServiceError) return json({ error: err.message }, { status: err.status });
    throw err;
  }
});
