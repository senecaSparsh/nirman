import { NextRequest } from "next/server";
import { getCashFlowForecast } from "@nirman/services";
import { apiHandler, json, requirePermission } from "@/lib/server";
import { PERM } from "@/lib/roles";

export const GET = apiHandler(async (req: NextRequest) => {
  await requirePermission(PERM.FINANCE_VIEW);
  const { searchParams } = new URL(req.url);
  const projectId = searchParams.get("projectId");
  if (!projectId) return json({ error: "projectId is required" }, { status: 400 });
  const cf = await getCashFlowForecast(projectId);
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
});
