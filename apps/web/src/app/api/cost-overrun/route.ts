import { NextRequest } from "next/server";
import { getCostOverrunForecast } from "@nirman/services";
import { apiHandler, json, requirePermission, toNum } from "@/lib/server";
import { PERM } from "@/lib/roles";

export const GET = apiHandler(async (req: NextRequest) => {
  await requirePermission(PERM.ASSETS_VIEW);
  const { searchParams } = new URL(req.url);
  const projectId = searchParams.get("projectId");
  if (!projectId) return json({ error: "projectId is required" }, { status: 400 });
  const forecast = await getCostOverrunForecast(projectId);
  return json(forecast.map((f) => ({
    ...f,
    budgetedQty: toNum(f.budgetedQty),
    budgetedAmount: toNum(f.budgetedAmount),
    actualQty: toNum(f.actualQty),
    actualCost: toNum(f.actualCost),
    committedQty: toNum(f.committedQty),
    committedCost: toNum(f.committedCost),
    pendingReqQty: toNum(f.pendingReqQty),
    projectedQty: toNum(f.projectedQty),
    projectedCost: toNum(f.projectedCost),
    overrun: toNum(f.overrun),
    overrunPct: toNum(f.overrunPct),
  })));
});
