import { NextRequest } from "next/server";
import { getBudgetVariance } from "@nirman/services";
import { apiHandler, json, requirePermission } from "@/lib/server";
import { PERM } from "@/lib/roles";

export const GET = apiHandler(async (req: NextRequest) => {
  await requirePermission(PERM.FINANCE_VIEW);
  const { searchParams } = new URL(req.url);
  const projectId = searchParams.get("projectId");
  if (!projectId) return json({ error: "projectId is required" }, { status: 400 });
  const bv = await getBudgetVariance(projectId);
  return json({
    ...bv,
    items: bv.items.map((i) => ({
      ...i,
      budgetedAmount: i.budgetedAmount.toNumber(),
      actualAmount: i.actualAmount.toNumber(),
      variance: i.variance.toNumber(),
      variancePct: i.variancePct.toNumber(),
    })),
    totalBudget: bv.totalBudget.toNumber(),
    totalActual: bv.totalActual.toNumber(),
    totalVariance: bv.totalVariance.toNumber(),
    totalVariancePct: bv.totalVariancePct.toNumber(),
    boqBudget: bv.boqBudget.toNumber(),
    nonBoqBudget: bv.nonBoqBudget.toNumber(),
  });
});
