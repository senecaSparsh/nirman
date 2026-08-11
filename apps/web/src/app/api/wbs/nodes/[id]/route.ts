import { NextRequest } from "next/server";
import { updateWbsNode, deleteWbsNode } from "@nirman/services";
import { apiHandler, json, requirePermission } from "@/lib/server";
import { PERM } from "@/lib/roles";

export const PATCH = apiHandler(async (req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  const user = await requirePermission(PERM.ASSETS_MANAGE);
  const { id } = await params;
  const body = await req.json();
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
  const user = await requirePermission(PERM.ASSETS_MANAGE);
  const { id } = await params;
  try {
    await deleteWbsNode(id, user.id);
    return json({ ok: true });
  } catch (err: unknown) {
    return json({ error: err instanceof Error ? err.message : "Failed" }, { status: 400 });
  }
});
