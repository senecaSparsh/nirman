import { NextRequest } from "next/server";
import { deleteRenovationCost } from "@nirman/services";
import { apiHandler, json, requirePermission } from "@/lib/server";
import { PERM } from "@/lib/roles";

export const DELETE = apiHandler(async (_req: NextRequest, { params }: { params: Promise<{ id: string; costId: string }> }) => {
  const user = await requirePermission(PERM.ASSETS_MANAGE);
  const { costId } = await params;
  try {
    await deleteRenovationCost(costId, user.id);
    return json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to delete renovation cost";
    return json({ error: message }, { status: 400 });
  }
});
