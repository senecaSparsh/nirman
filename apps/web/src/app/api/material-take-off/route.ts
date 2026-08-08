import { NextRequest } from "next/server";
import { generateMaterialTakeOff } from "@nirman/services";
import { apiHandler, json, requirePermission, toNum } from "@/lib/server";
import { PERM } from "@/lib/roles";

export const GET = apiHandler(async (req: NextRequest) => {
  await requirePermission(PERM.ASSETS_VIEW);
  const { searchParams } = new URL(req.url);
  const projectId = searchParams.get("projectId");
  if (!projectId) return json({ error: "projectId is required" }, { status: 400 });
  const mto = await generateMaterialTakeOff(projectId);
  return json(mto.map((m) => ({
    ...m,
    boqQty: toNum(m.boqQty),
    consumedQty: toNum(m.consumedQty),
    remainingQty: toNum(m.remainingQty),
    currentStock: toNum(m.currentStock),
    openRequisitionQty: toNum(m.openRequisitionQty),
    procurementGap: toNum(m.procurementGap),
  })));
});
