import { NextRequest } from "next/server";
import { prisma, Prisma } from "@nirman/db";
import { apiHandler, getCompany, json, requirePermission } from "@/lib/server";
import { PERM } from "@/lib/roles";
import { MODULES, type ModelKey, type WorkspaceGraph } from "@/lib/modules/registry";
import { childrenMap, edgeBetween, nodeById } from "@/lib/modules/validation";
import { listChildren, listRoot } from "@/lib/modules/resolver";

/** Deep-serialize a record: Prisma.Decimal -> number, Date -> ISO string. */
function serialize(value: unknown): unknown {
  if (value == null) return value;
  if (Prisma.Decimal.isDecimal(value)) return Number(value.toString());
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(serialize);
  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) out[k] = serialize(v);
    return out;
  }
  return value;
}

export const GET = apiHandler(async (req: NextRequest, ctx: { params: Promise<{ id: string }> }) => {
  await requirePermission(PERM.CANVAS_VIEW);
  const { id } = await ctx.params;
  const company = await getCompany();
  const ws = await prisma.customWorkspace.findFirst({ where: { id, deletedAt: null, companyId: company.id } });
  if (!ws) return json({ error: "Workspace not found" }, { status: 404 });

  const graph = ws.graphJson as unknown as WorkspaceGraph;
  const sp = req.nextUrl.searchParams;
  const currentId = sp.get("current") ?? "";
  // path format: "fromNode:recordId,fromNode:recordId" (URL-encoded) — the chain of selections
  const pathParam = sp.get("path") ?? "";
  const path = pathParam
    .split(",")
    .filter(Boolean)
    .map((pair) => {
      const parts = pair.split(":");
      return { fromNode: parts[0] ?? "", recordId: parts[1] ?? "" };
    });

  const currentNode = nodeById(graph, currentId);
  if (!currentNode) return json({ error: "Unknown current node." }, { status: 400 });
  const currentModel = currentNode.model as ModelKey;
  const mod = MODULES[currentModel];

  // validate path entries reference real nodes
  for (const p of path) {
    if (!nodeById(graph, p.fromNode)) return json({ error: "Invalid path." }, { status: 400 });
  }

  // fetch rows for the current level
  let rows: any[];
  if (path.length === 0) {
    rows = await listRoot(currentModel, company.id);
  } else {
    const last = path[path.length - 1];
    if (!last) return json({ error: "Broken navigation path." }, { status: 400 });
    const lastNode = nodeById(graph, last.fromNode);
    const edge = edgeBetween(graph, last.fromNode, currentId);
    if (!lastNode || !edge) return json({ error: "Broken navigation path." }, { status: 400 });
    rows = await listChildren(lastNode.model as ModelKey, last.recordId, edge.hops, currentModel);
  }

  // child drill targets for the current node
  const childEdges = childrenMap(graph).get(currentId) ?? [];
  const childNodes = childEdges.map((e) => {
    const child = nodeById(graph, e.to);
    return {
      nodeId: e.to,
      model: child?.model ?? "",
      label: e.relationLabel,
      moduleLabel: child ? MODULES[child.model as ModelKey]?.label ?? child.model : e.to,
    };
  });

  return json({
    currentModel,
    moduleLabel: mod.label,
    displayField: mod.displayField,
    secondaryField: mod.secondaryField ?? null,
    columns: mod.columns,
    rows: rows.map((r) => ({ ...(serialize(r) as Record<string, unknown>), id: r.id })),
    childNodes,
    depth: path.length,
  });
});
