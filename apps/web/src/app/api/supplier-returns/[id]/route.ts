import { NextRequest } from "next/server";
import { cancelSupplierReturn, completeSupplierReturn, submitSupplierReturn } from "@nirman/services";
import { PERM } from "@/lib/roles";
import { apiHandler, json, requirePermission } from "@/lib/server";

export const PATCH = apiHandler(async (req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  const user = await requirePermission(PERM.PROCUREMENT_MANAGE);
  const { id } = await params;
  const body = await req.json();
  const action = body?.action as string;

  try {
    if (action === "submit") {
      await submitSupplierReturn(id, user.id);
      return json({ ok: true });
    }
    if (action === "complete") {
      await completeSupplierReturn({
        returnId: id,
        creditNoteNo: body?.creditNoteNo ?? undefined,
        userId: user.id,
      });
      return json({ ok: true });
    }
    if (action === "cancel") {
      await cancelSupplierReturn(id, user.id);
      return json({ ok: true });
    }
    return json({ error: "Invalid action. Use submit, complete, or cancel." }, { status: 400 });
  } catch (err: any) {
    return json({ error: err?.message ?? "Action failed" }, { status: 400 });
  }
});
