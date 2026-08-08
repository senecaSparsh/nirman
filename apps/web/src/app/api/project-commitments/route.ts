import { NextRequest } from "next/server";
import { getProjectCommitments } from "@nirman/services";
import { apiHandler, json, requirePermission } from "@/lib/server";
import { PERM } from "@/lib/roles";

export const GET = apiHandler(async (req: NextRequest) => {
  await requirePermission(PERM.ASSETS_VIEW);
  const { searchParams } = new URL(req.url);
  const projectId = searchParams.get("projectId");
  if (!projectId) return json({ error: "projectId is required" }, { status: 400 });
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
