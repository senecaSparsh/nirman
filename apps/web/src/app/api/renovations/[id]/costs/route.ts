import { NextRequest } from "next/server";
import { addRenovationCost } from "@nirman/services";
import { apiHandler, json, renovationCostSchema, requirePermission } from "@/lib/server";
import { PERM } from "@/lib/roles";

export const POST = apiHandler(async (req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  const user = await requirePermission(PERM.ASSETS_MANAGE);
  const { id } = await params;
  const body = await req.json();
  const parsed = renovationCostSchema.safeParse({ ...body, renovationProjectId: id });
  if (!parsed.success) {
    return json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  }
  try {
    const cost = await addRenovationCost({
      renovationProjectId: id,
      costType: parsed.data.costType,
      amount: parsed.data.amount,
      vendor: parsed.data.vendor ?? undefined,
      notes: parsed.data.notes ?? undefined,
      receiptUrl: parsed.data.receiptUrl ?? undefined,
      userId: user.id,
    });
    return json({ ok: true, id: cost.id }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to add renovation cost";
    return json({ error: message }, { status: 400 });
  }
});
