import { NextRequest } from "next/server";
import { getWbsTree } from "@nirman/services";
import { apiHandler, json, requirePermission, toNum } from "@/lib/server";
import { PERM } from "@/lib/roles";

interface WbsTreeNode {
  id: string;
  parentId: string | null;
  code: string;
  name: string;
  type: string;
  description: string | null;
  plannedStart: Date | null;
  plannedEnd: Date | null;
  actualStart: Date | null;
  actualEnd: Date | null;
  progressPct: unknown;
  isCritical: boolean;
  totalFloat: unknown;
  sortOrder: number;
  boqItem: {
    estimatedAmount: unknown;
    estimatedQty: unknown;
    rate: unknown;
    [key: string]: unknown;
  } | null;
  children: WbsTreeNode[];
  _count: unknown;
}

function serializeNode(node: WbsTreeNode): Record<string, unknown> {
  return {
    id: node.id,
    parentId: node.parentId,
    code: node.code,
    name: node.name,
    type: node.type,
    description: node.description,
    plannedStart: node.plannedStart?.toISOString() ?? null,
    plannedEnd: node.plannedEnd?.toISOString() ?? null,
    actualStart: node.actualStart?.toISOString() ?? null,
    actualEnd: node.actualEnd?.toISOString() ?? null,
    progressPct: toNum(node.progressPct),
    isCritical: node.isCritical,
    totalFloat: node.totalFloat,
    sortOrder: node.sortOrder,
    boqItem: node.boqItem
      ? {
          ...node.boqItem,
          estimatedAmount: node.boqItem.estimatedAmount != null ? toNum(node.boqItem.estimatedAmount) : null,
          estimatedQty: node.boqItem.estimatedQty != null ? toNum(node.boqItem.estimatedQty) : null,
          rate: node.boqItem.rate != null ? toNum(node.boqItem.rate) : null,
        }
      : null,
    children: (node.children ?? []).map(serializeNode),
    _count: node._count,
  };
}

export const GET = apiHandler(async (req: NextRequest) => {
  await requirePermission(PERM.WBS_VIEW);
  const { searchParams } = new URL(req.url);
  const projectId = searchParams.get("projectId");
  if (!projectId) return json({ error: "projectId is required" }, { status: 400 });
  const tree = await getWbsTree(projectId);
  return json(tree.map(serializeNode));
});
