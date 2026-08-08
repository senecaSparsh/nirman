import { NextRequest } from "next/server";
import { cancelRateContract } from "@nirman/services";
import { apiHandler, json, requirePermission } from "@/lib/server";
import { PERM } from "@/lib/roles";

export const PATCH = apiHandler(async (req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  const user = await requirePermission(PERM.PROCUREMENT_MANAGE);
  const { id } = await params;
  const body = await req.json();
  if (body?.action === "cancel") {
    try {
      const contract = await cancelRateContract(id, user.id);
      return json(contract);
    } catch (err: unknown) {
      return json({ error: err instanceof Error ? err.message : "Failed" }, { status: 400 });
    }
  }
  return json({ error: "Unknown action. Use: cancel" }, { status: 400 });
});
