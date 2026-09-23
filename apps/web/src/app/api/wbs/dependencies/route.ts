import { NextRequest } from "next/server";
import { prisma } from "@nirman/db";
import { addWbsDependency, ServiceError } from "@nirman/services";
import { apiHandler, assertScopeAllows, getCompany, json, requirePermission, scopeWhere } from "@/lib/server";
import { PERM } from "@/lib/roles";
import { z } from "zod";

const schema = z.object({
  predecessorId: z.string().min(1),
  successorId: z.string().min(1),
  type: z.enum(["FS", "SS", "FF", "SF"]).default("FS"),
  lagDays: z.coerce.number().default(0),
});

/**
 * GET /api/wbs/dependencies?nodeId=… — fetch all dependencies
 * (both as predecessor and successor) for a given WBS node.
 */
export const GET = apiHandler(async (req: NextRequest) => {
  await requirePermission(PERM.WBS_VIEW);
  const company = await getCompany();
  const { searchParams } = new URL(req.url);
  const nodeId = searchParams.get("nodeId");
  if (!nodeId) return json({ error: "nodeId is required" }, { status: 400 });

  // The node must belong to the caller's company + scope, otherwise the
  // dependency graph (node codes/names) leaks across tenants.
  const node = await prisma.wbsNode.findFirst({
    where: { id: nodeId, project: { companyId: company.id }, ...await scopeWhere("WbsNode", {}) },
    select: { id: true },
  });
  if (!node) return json({ error: "WBS node not found" }, { status: 404 });

  const deps = await prisma.wbsDependency.findMany({
    where: { OR: [{ predecessorId: nodeId }, { successorId: nodeId }] },
    include: {
      predecessor: { select: { id: true, code: true, name: true } },
      successor: { select: { id: true, code: true, name: true } },
    },
    orderBy: { createdAt: "asc" },
  });

  return json(deps.map((d) => ({
    id: d.id,
    type: d.type,
    lagDays: d.lagDays,
    predecessor: d.predecessor,
    successor: d.successor,
    direction: d.predecessorId === nodeId ? "outgoing" : "incoming",
  })));
});

export const POST = apiHandler(async (req: NextRequest) => {
  const user = await requirePermission(PERM.WBS_MANAGE);
  const company = await getCompany();
  const body = await req.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success) return json({ error: parsed.error.issues[0]?.message ?? "Invalid" }, { status: 400 });

  // Scope check on the predecessor's project — the service enforces
  // same-project + same-company on both ends, so checking one end covers
  // the whole edge.
  const pred = await prisma.wbsNode.findUnique({ where: { id: parsed.data.predecessorId }, select: { projectId: true } });
  if (pred) {
    try {
      await assertScopeAllows({ projectId: pred.projectId, departmentId: null });
    } catch (err) {
      return json({ error: err instanceof Error ? err.message : "Scope violation" }, { status: 403 });
    }
  }

  try {
    const dep = await addWbsDependency(
      parsed.data.predecessorId,
      parsed.data.successorId,
      parsed.data.type,
      parsed.data.lagDays,
      user.id,
      company.id,
    );
    return json(dep, { status: 201 });
  } catch (err: unknown) {
    return json({ error: err instanceof Error ? err.message : "Failed" }, { status: err instanceof ServiceError ? err.status : 400 });
  }
});
