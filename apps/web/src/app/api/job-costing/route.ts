import { NextRequest } from "next/server";
import { getJobCosting, ServiceError } from "@nirman/services";
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
    const jc = await getJobCosting(projectId, company.id);
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
  } catch (err) {
    if (err instanceof ServiceError) return json({ error: err.message }, { status: err.status });
    throw err;
  }
});
