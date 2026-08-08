import { NextRequest } from "next/server";
import { getProjectMaterialReconciliation } from "@nirman/services";
import { apiHandler, json, requirePermission } from "@/lib/server";
import { PERM } from "@/lib/roles";

export const GET = apiHandler(async (req: NextRequest) => {
  await requirePermission(PERM.ASSETS_VIEW);
  const { searchParams } = new URL(req.url);
  const projectId = searchParams.get("projectId");
  if (!projectId) return json({ error: "projectId is required" }, { status: 400 });
  const tolerance = searchParams.get("tolerance");
  const recon = await getProjectMaterialReconciliation(
    projectId,
    tolerance ? parseFloat(tolerance) : 5,
  );
  return json({
    ...recon,
    items: recon.items.map((i) => ({
      ...i,
      requiredQty: i.requiredQty.toNumber(),
      issuedQty: i.issuedQty.toNumber(),
      consumedQty: i.consumedQty.toNumber(),
      currentStock: i.currentStock.toNumber(),
      issueVariance: i.issueVariance.toNumber(),
      consumptionVariance: i.consumptionVariance.toNumber(),
      stockVariance: i.stockVariance.toNumber(),
      wastagePct: i.wastagePct.toNumber(),
      tolerancePct: i.tolerancePct.toNumber(),
    })),
    totalRequired: recon.totalRequired.toNumber(),
    totalIssued: recon.totalIssued.toNumber(),
    totalConsumed: recon.totalConsumed.toNumber(),
    totalWastage: recon.totalWastage.toNumber(),
  });
});
