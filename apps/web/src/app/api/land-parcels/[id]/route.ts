import { NextRequest } from "next/server";
import { setParcelStatus, updateParcelValuation } from "@nirman/services";
import { apiHandler, json, parcelValuationSchema, requirePermission } from "@/lib/server";
import { PERM } from "@/lib/roles";

export const PATCH = apiHandler(async (req: NextRequest, ctx: { params: Promise<{ id: string }> }) => {
  const user = await requirePermission(PERM.ASSETS_MANAGE);
  const { id } = await ctx.params;
  const body = await req.json();
  const action = body?.action as string;

  try {
    if (action === "hold") {
      const p = await setParcelStatus(id, "HOLD", user.id);
      return json({ ok: true, status: p.status });
    }
    if (action === "release") {
      const p = await setParcelStatus(id, "AVAILABLE", user.id);
      return json({ ok: true, status: p.status });
    }
    if (action === "valuate") {
      const parsed = parcelValuationSchema.safeParse(body);
      if (!parsed.success) {
        return json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
      }
      const p = await updateParcelValuation(
        id,
        {
          currentValuation: parsed.data.currentValuation,
          askingPrice: parsed.data.askingPrice === null ? undefined : parsed.data.askingPrice,
        },
        user.id,
      );
      return json({ ok: true });
    }
    return json({ error: "Unknown action" }, { status: 400 });
  } catch (err: any) {
    return json({ error: err?.message ?? "Action failed" }, { status: 400 });
  }
});
