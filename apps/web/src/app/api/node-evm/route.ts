import { NextRequest } from "next/server";
import { prisma } from "@nirman/db";
import { getNodeEvm } from "@nirman/services";
import { apiHandler, getCompany, json, requirePermission, scopeWhere, toNum } from "@/lib/server";
import { PERM } from "@/lib/roles";

export const GET = apiHandler(async (req: NextRequest) => {
  await requirePermission(PERM.PROJECT_CONTROL_VIEW);
  const company = await getCompany();
  const { searchParams } = new URL(req.url);
  const projectId = searchParams.get("projectId");
  if (!projectId) return json({ error: "projectId is required" }, { status: 400 });
  const project = await prisma.project.findFirst({
    where: { companyId: company.id, deletedAt: null, AND: [{ id: projectId }, await scopeWhere("Project")] },
    select: { id: true },
  });
  if (!project) return json({ error: "Project not found" }, { status: 404 });
  const evm = await getNodeEvm(projectId);
  return json(evm.map((e) => ({
    ...e,
    pv: toNum(e.pv),
    ev: toNum(e.ev),
    progressPct: toNum(e.progressPct),
    variance: toNum(e.variance),
  })));
});
