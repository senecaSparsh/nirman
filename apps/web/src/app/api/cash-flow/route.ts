import { NextRequest } from "next/server";
import { getCashFlowForecast, ServiceError } from "@nirman/services";
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
    const cf = await getCashFlowForecast(projectId, company.id);
    return json({
      inflows: {
        scheduledPayments: cf.inflows.scheduledPayments.map((p) => ({
          ...p,
          amount: p.amount.toNumber(),
        })),
        totalInflow: cf.inflows.totalInflow.toNumber(),
      },
      outflows: {
        ...cf.outflows,
        commitments: cf.outflows.commitments.toNumber(),
        pendingRaBills: cf.outflows.pendingRaBills.toNumber(),
        payrollDue: cf.outflows.payrollDue.toNumber(),
        totalOutflow: cf.outflows.totalOutflow.toNumber(),
      },
      netCashFlow: cf.netCashFlow.toNumber(),
    });
  } catch (err) {
    if (err instanceof ServiceError) return json({ error: err.message }, { status: err.status });
    throw err;
  }
});
