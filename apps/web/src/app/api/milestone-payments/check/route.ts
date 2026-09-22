import { NextRequest } from "next/server";
import { prisma } from "@nirman/db";
import { checkMilestonePayments } from "@nirman/services";
import { apiHandler, getCompany, json, requirePermission } from "@/lib/server";
import { PERM } from "@/lib/roles";

export const POST = apiHandler(async (req: NextRequest) => {
  await requirePermission(PERM.SALES_VIEW);
  const company = await getCompany();
  const { searchParams } = new URL(req.url);
  const projectId = searchParams.get("projectId");
  if (!projectId) return json({ error: "projectId is required" }, { status: 400 });
  // The sweep marks CLP schedule items DUE on the project's sales — a state
  // mutation (and customer-facing trigger) that must not run on another
  // tenant's project.
  const project = await prisma.project.findFirst({
    where: { id: projectId, companyId: company.id, deletedAt: null },
    select: { id: true },
  });
  if (!project) return json({ error: "Project not found" }, { status: 404 });
  const result = await checkMilestonePayments(projectId);
  return json(result);
});
