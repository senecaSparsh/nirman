import { NextRequest } from "next/server";
import { getProjectProfitCenter } from "@nirman/services";
import { apiHandler, json, requirePermission } from "@/lib/server";
import { PERM } from "@/lib/roles";

export const GET = apiHandler(async (req: NextRequest) => {
  await requirePermission(PERM.FINANCE_VIEW);
  const { searchParams } = new URL(req.url);
  const projectId = searchParams.get("projectId");
  if (!projectId) return json({ error: "projectId is required" }, { status: 400 });
  const pc = await getProjectProfitCenter(projectId);
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
});
