import { NextRequest } from "next/server";
import { revalidatePath } from "next/cache";
import { clearCheque, bounceCheque } from "@nirman/services";
import { apiHandler, json, requirePermission } from "@/lib/server";
import { PERM } from "@/lib/roles";

/**
 * POST /api/sales/payments/[id]/cheque — clear or bounce a cheque payment.
 * Body: { action: "clear" | "bounce" }
 */
export const POST = apiHandler(async (req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  const user = await requirePermission(PERM.SALES_MANAGE);
  const { id } = await params;
  const body = await req.json();
  const action = body?.action as string;

  try {
    if (action === "clear") {
      const result = await clearCheque(id, user.id);
      revalidatePath("/sales");
      return json({ ok: true, saleStage: result.saleStage });
    }
    if (action === "bounce") {
      const result = await bounceCheque(id, user.id, body?.bounceReason);
      revalidatePath("/sales");
      return json({ ok: true, saleStage: result.saleStage });
    }
    return json({ error: "Invalid action. Use 'clear' or 'bounce'." }, { status: 400 });
  } catch (err: unknown) {
    return json({ error: (err instanceof Error ? err.message : "Cheque action failed") }, { status: 400 });
  }
});
