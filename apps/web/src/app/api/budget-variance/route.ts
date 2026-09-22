import { NextRequest } from "next/server";
import { getBudgetVariance, ServiceError } from "@nirman/services";
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
    const bv = await getBudgetVariance(projectId, company.id);
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
  } catch (err) {
    if (err instanceof ServiceError) return json({ error: err.message }, { status: err.status });
    throw err;
  }
});
