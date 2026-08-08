import { NextRequest } from "next/server";
import { returnEquipment } from "@nirman/services";
import { apiHandler, json, requirePermission } from "@/lib/server";
import { PERM } from "@/lib/roles";

export const PATCH = apiHandler(async (req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  const user = await requirePermission(PERM.ASSETS_MANAGE);
  const { id } = await params;
  const body = await req.json();
  const action = body?.action as string;

  if (action === "return") {
    try {
      await returnEquipment(id, user.id);
      return json({ ok: true });
    } catch (err: unknown) {
      return json({ error: (err instanceof Error ? err.message : "Return failed") }, { status: 400 });
    }
  }

  return json({ error: "Invalid action. Use return." }, { status: 400 });
});
