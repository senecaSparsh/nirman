import { NextRequest } from "next/server";
import { revalidatePath } from "next/cache";
import { clearLandPurchaseCheque, bounceLandPurchaseCheque } from "@nirman/services";
import { apiHandler, json, requirePermission } from "@/lib/server";
import { PERM } from "@/lib/roles";

/**
 * POST /api/land-purchases/payments/[id]/cheque — clear or bounce a land purchase cheque payment.
 * Body: { action: "clear" | "bounce", bounceReason? }
 */
export const POST = apiHandler(async (req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  const user = await requirePermission(PERM.ASSETS_MANAGE);
  const { id } = await params;
  const body = await req.json();
  const action = body?.action as string;

  try {
    if (action === "clear") {
      await clearLandPurchaseCheque(id, user.id);
      revalidatePath("/land");
      return json({ ok: true, chequeStatus: "CLEARED" });
    }
    if (action === "bounce") {
      await bounceLandPurchaseCheque(id, user.id, body?.bounceReason);
      revalidatePath("/land");
      return json({ ok: true, chequeStatus: "BOUNCED" });
    }
    return json({ error: "Invalid action. Use 'clear' or 'bounce'." }, { status: 400 });
  } catch (err: unknown) {
    return json({ error: (err instanceof Error ? err.message : "Cheque action failed") }, { status: 400 });
  }
});
