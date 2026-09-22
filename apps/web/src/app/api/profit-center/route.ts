import { NextRequest } from "next/server";
import { getProjectProfitCenter, ServiceError } from "@nirman/services";
import { apiHandler, assertScopeAllows, getCompany, json, requirePermission } from "@/lib/server";
import { PERM } from "@/lib/roles";

export const GET = apiHandler(async (req: NextRequest) => {
  await requirePermission(PERM.FINANCE_VIEW);
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
    const pc = await getProjectProfitCenter(projectId, company.id);
    return json({
      ...pc,
      totalRevenue: pc.totalRevenue.toNumber(),
      costRecovery: pc.costRecovery.toNumber(),
      totalInflow: pc.totalInflow.toNumber(),
      landCost: pc.landCost.toNumber(),
      materialCost: pc.materialCost.toNumber(),
      labourCost: pc.labourCost.toNumber(),
      equipmentCost: pc.equipmentCost.toNumber(),
      subcontractorCost: pc.subcontractorCost.toNumber(),
      overheadCost: pc.overheadCost.toNumber(),
      totalCost: pc.totalCost.toNumber(),
      grossProfit: pc.grossProfit.toNumber(),
      marginPct: pc.marginPct.toNumber(),
      totalSellableArea: pc.totalSellableArea.toNumber(),
      costPerSqft: pc.costPerSqft.toNumber(),
      revenuePerSqft: pc.revenuePerSqft.toNumber(),
    });
  } catch (err) {
    if (err instanceof ServiceError) return json({ error: err.message }, { status: err.status });
    throw err;
  }
});
