import { NextRequest } from "next/server";
import { getBoqTree } from "@nirman/services";
import { apiHandler, getCompany, json, requirePermission, toNum } from "@/lib/server";
import { PERM } from "@/lib/roles";

type BoqTreeNode = {
  id: string;
  parentId: string | null;
  serialNo: string;
  description: string;
  type: string;
  unit: string | null;
  estimatedQty: unknown;
  rate: unknown;
  estimatedAmount: unknown;
  materialId: string | null;
  material: { id: string; code: string; name: string; unit: string | null } | null;
  rateAnalysis: { id: string; totalRate: unknown } | null;
  notes: string | null;
  sortOrder: number;
  children: BoqTreeNode[];
  _count: { mbEntries: number; wbsNodes: number };
};

function serializeNode(node: BoqTreeNode): Record<string, unknown> {
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
    rateAnalysis: node.rateAnalysis ? { id: node.rateAnalysis.id, totalRate: toNum(node.rateAnalysis.totalRate) } : null,
    notes: node.notes,
    sortOrder: node.sortOrder,
    children: (node.children ?? []).map(serializeNode),
    _count: node._count,
  };
}

export const GET = apiHandler(async (req: NextRequest) => {
  await requirePermission(PERM.BOQ_VIEW);
  await getCompany();
  const { searchParams } = new URL(req.url);
  const projectId = searchParams.get("projectId");
  if (!projectId) return json({ error: "projectId is required" }, { status: 400 });
  const { tree, totalEstimatedAmount } = await getBoqTree(projectId);
  return json({
    tree: (tree as BoqTreeNode[]).map(serializeNode),
    totalEstimatedAmount: toNum(totalEstimatedAmount),
  });
});
