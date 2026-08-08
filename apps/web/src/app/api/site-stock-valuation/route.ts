import { NextRequest } from "next/server";
import { getSiteStockValuation } from "@nirman/services";
import { apiHandler, json, requirePermission } from "@/lib/server";
import { PERM } from "@/lib/roles";

export const GET = apiHandler(async (req: NextRequest) => {
  await requirePermission(PERM.INVENTORY_VIEW);
  const { searchParams } = new URL(req.url);
  const projectId = searchParams.get("projectId");
  if (!projectId) return json({ error: "projectId is required" }, { status: 400 });
  const valuations = await getSiteStockValuation(projectId);
  return json(valuations.map((v) => ({
    ...v,
    totalValue: v.totalValue.toNumber(),
    items: v.items.map((i) => ({
      ...i,
      qty: i.qty.toNumber(),
      mac: i.mac.toNumber(),
      value: i.value.toNumber(),
    })),
  })));
});
