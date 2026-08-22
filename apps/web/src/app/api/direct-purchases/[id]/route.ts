import { NextRequest } from "next/server";
import { cancelDirectPurchase } from "@nirman/services";
import { apiHandler, json, requirePermission } from "@/lib/server";
import { PERM } from "@/lib/roles";

/**
 * PATCH /api/direct-purchases/[id] — cancel a direct purchase.
 * Reverses stock (ADJUSTMENT_OUT) and GL entries.
 */
export const PATCH = apiHandler(async (req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  const user = await requirePermission(PERM.INVENTORY_MANAGE);
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const action = body?.action as string;

  if (action === "cancel") {
    try {
      const result = await cancelDirectPurchase(id, user.id);
      return json({ id: result.id, status: result.status });
    } catch (err: unknown) {
      return json({ error: err instanceof Error ? err.message : "Failed to cancel direct purchase" }, { status: 400 });
    }
  }

  return json({ error: "Unknown action" }, { status: 400 });
});
