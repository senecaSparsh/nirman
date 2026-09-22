import { NextRequest } from "next/server";
import { prisma } from "@nirman/db";
import { getProjectCommitments } from "@nirman/services";
import { apiHandler, getCompany, json, requirePermission } from "@/lib/server";
import { PERM } from "@/lib/roles";

export const GET = apiHandler(async (req: NextRequest) => {
  await requirePermission(PERM.PROJECT_CONTROL_VIEW);
  const company = await getCompany();
  const { searchParams } = new URL(req.url);
  const projectId = searchParams.get("projectId");
  if (!projectId) return json({ error: "projectId is required" }, { status: 400 });
  // The service takes a bare projectId — verify it belongs to this company
  // before returning open-indent + committed-PO totals (cross-tenant leak).
  const project = await prisma.project.findFirst({
    where: { id: projectId, companyId: company.id, deletedAt: null },
    select: { id: true },
  });
  if (!project) return json({ error: "Project not found" }, { status: 404 });
  const commitments = await getProjectCommitments(projectId);
  return json({
    ...commitments,
    openRequisitions: {
      ...commitments.openRequisitions,
      totalEstimated: commitments.openRequisitions.totalEstimated.toNumber(),
    },
    openPurchaseOrders: {
      ...commitments.openPurchaseOrders,
      totalCommitted: commitments.openPurchaseOrders.totalCommitted.toNumber(),
    },
    totalCommitted: commitments.totalCommitted.toNumber(),
  });
});
