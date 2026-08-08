import { NextRequest } from "next/server";
import { getBoqTree } from "@nirman/services";
import { apiHandler, getCompany, json, requirePermission, toNum } from "@/lib/server";
import { PERM } from "@/lib/roles";

function serializeNode(node: any): any {
  return {
    id: node.id,
    parentId: node.parentId,
    serialNo: node.serialNo,
    description: node.description,
    type: node.type,
    unit: node.unit,
    estimatedQty: node.estimatedQty != null ? toNum(node.estimatedQty) : null,
    rate: node.rate != null ? toNum(node.rate) : null,
    estimatedAmount: node.estimatedAmount != null ? toNum(node.estimatedAmount) : null,
    materialId: node.materialId,
    material: node.material ?? null,
    notes: node.notes,
    sortOrder: node.sortOrder,
    children: (node.children ?? []).map(serializeNode),
    _count: node._count,
  };
}

export const GET = apiHandler(async (req: NextRequest) => {
  await requirePermission(PERM.ASSETS_VIEW);
  await getCompany();
  const { searchParams } = new URL(req.url);
  const projectId = searchParams.get("projectId");
  if (!projectId) return json({ error: "projectId is required" }, { status: 400 });
  const { tree, totalEstimatedAmount } = await getBoqTree(projectId);
  return json({
    tree: tree.map(serializeNode),
    totalEstimatedAmount: toNum(totalEstimatedAmount),
  });
});
