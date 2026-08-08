import { NextRequest } from "next/server";
import { getApprovalRouting } from "@nirman/services";
import { apiHandler, getCompany, json, requirePermission } from "@/lib/server";
import { PERM } from "@/lib/roles";

export const GET = apiHandler(async (req: NextRequest) => {
  await requirePermission(PERM.PROCUREMENT_VIEW);
  const company = await getCompany();
  const { searchParams } = new URL(req.url);
  const amount = searchParams.get("amount");
  if (!amount) return json({ error: "amount is required" }, { status: 400 });
  const routing = await getApprovalRouting(amount, company.id);
  return json({
    ...routing,
    threshold: routing.threshold.toNumber(),
  });
});
