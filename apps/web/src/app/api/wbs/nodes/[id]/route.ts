import { NextRequest } from "next/server";
import { updateWbsNode, deleteWbsNode } from "@nirman/services";
import { prisma } from "@nirman/db";
import { apiHandler, json, requirePermission, assertScopeAllows, getCompany } from "@/lib/server";
import { PERM } from "@/lib/roles";

export const PATCH = apiHandler(async (req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  const user = await requirePermission(PERM.WBS_MANAGE);
  const { id } = await params;

  const company = await getCompany();
  const existing = await prisma.wbsNode.findFirst({ where: { id, project: { companyId: company.id } }, select: { id: true } });
  if (!existing) return json({ error: "Not found" }, { status: 404 });

  const body = await req.json();
  try {
    await assertScopeAllows({ projectId: body?.projectId ?? null, departmentId: null });
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : "Scope violation" }, { status: 403 });
  }
  // Convert date strings to Date, preserve null (clear), drop undefined (don't touch)
  const toDate = (v: unknown) => (v == null ? (v === null ? null : undefined) : new Date(v as string));
  try {
    const node = await updateWbsNode(id, {
      ...body,
      plannedStart: toDate(body.plannedStart),
      plannedEnd: toDate(body.plannedEnd),
      actualStart: toDate(body.actualStart),
      actualEnd: toDate(body.actualEnd),
      userId: user.id,
    });
    return json(node);
  } catch (err: unknown) {
    return json({ error: err instanceof Error ? err.message : "Failed" }, { status: 400 });
  }
});

export const DELETE = apiHandler(async (_req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  const user = await requirePermission(PERM.WBS_MANAGE);
  const { id } = await params;

  const company = await getCompany();
  const existing = await prisma.wbsNode.findFirst({ where: { id, project: { companyId: company.id } }, select: { id: true } });
  if (!existing) return json({ error: "Not found" }, { status: 404 });

  try {
    await deleteWbsNode(id, user.id);
    return json({ ok: true });
  } catch (err: unknown) {
    return json({ error: err instanceof Error ? err.message : "Failed" }, { status: 400 });
  }
});
