import { NextRequest } from "next/server";
import { prisma } from "@nirman/db";
import { getEvmMetrics } from "@nirman/services";
import { apiHandler, getCompany, json, requirePermission, scopeWhere, toNum } from "@/lib/server";
import { PERM } from "@/lib/roles";

export const GET = apiHandler(async (req: NextRequest) => {
  await requirePermission(PERM.PROJECT_CONTROL_VIEW);
  const company = await getCompany();
  const { searchParams } = new URL(req.url);
  const projectId = searchParams.get("projectId");
  if (!projectId) return json({ error: "projectId is required" }, { status: 400 });
  // EVM exposes the project's full financials — seal tenancy + scope.
  const project = await prisma.project.findFirst({
    // AND-composed: scopeWhere("Project") emits {id:{in:[...]}} which would
    // otherwise overwrite the literal id and check the WRONG project.
    where: { companyId: company.id, deletedAt: null, AND: [{ id: projectId }, await scopeWhere("Project")] },
    select: { id: true },
  });
  if (!project) return json({ error: "Project not found" }, { status: 404 });
  const m = await getEvmMetrics(projectId);
  return json({
    pv: toNum(m.pv),
    ev: toNum(m.ev),
    ac: toNum(m.ac),
    cv: toNum(m.cv),
    sv: toNum(m.sv),
    cpi: toNum(m.cpi),
    spi: toNum(m.spi),
    eac: toNum(m.eac),
    vac: toNum(m.vac),
    pctComplete: toNum(m.pctComplete),
  });
});
