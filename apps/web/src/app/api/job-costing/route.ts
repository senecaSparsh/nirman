import { NextRequest } from "next/server";
import { getJobCosting } from "@nirman/services";
import { apiHandler, json, requirePermission } from "@/lib/server";
import { PERM } from "@/lib/roles";

export const GET = apiHandler(async (req: NextRequest) => {
  await requirePermission(PERM.FINANCE_VIEW);
  const { searchParams } = new URL(req.url);
  const projectId = searchParams.get("projectId");
  if (!projectId) return json({ error: "projectId is required" }, { status: 400 });
  const jc = await getJobCosting(projectId);
  return json({
    ...jc,
    directCosts: {
      ...jc.directCosts,
      materials: jc.directCosts.materials.toNumber(),
      labour: jc.directCosts.labour.toNumber(),
      subcontractor: jc.directCosts.subcontractor.toNumber(),
      equipment: jc.directCosts.equipment.toNumber(),
      total: jc.directCosts.total.toNumber(),
    },
    indirectCosts: {
      ...jc.indirectCosts,
      overhead: jc.indirectCosts.overhead.toNumber(),
      adminAllocated: jc.indirectCosts.adminAllocated.toNumber(),
      total: jc.indirectCosts.total.toNumber(),
    },
    totalCost: jc.totalCost.toNumber(),
    absorbedOverheadRate: jc.absorbedOverheadRate.toNumber(),
  });
});
