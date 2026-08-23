import { NextRequest } from "next/server";
import { revalidatePath } from "next/cache";
import { recordLandPurchasePayment } from "@nirman/services";
import { apiHandler, json, requirePermission } from "@/lib/server";
import { PERM } from "@/lib/roles";

/**
 * POST /api/land-purchases/[id]/payment — record a payment against a land purchase.
 * Body: { amount, paymentMode, referenceNo?, notes?, chequeNo?, chequeDate?, chequeBank?, chequePhotoUrl? }
 */
export const POST = apiHandler(async (req: NextRequest, ctx: { params: Promise<{ id: string }> }) => {
  const user = await requirePermission(PERM.ASSETS_MANAGE);
  const { id } = await ctx.params;
  const body = await req.json();

  if (!body?.amount || body.amount <= 0) {
    return json({ error: "Amount must be > 0" }, { status: 400 });
  }
  if (!body?.paymentMode) {
    return json({ error: "Payment mode is required" }, { status: 400 });
  }

  try {
    const result = await recordLandPurchasePayment({
      landPurchaseId: id,
      amount: body.amount,
      paymentMode: body.paymentMode,
      referenceNo: body.referenceNo,
      notes: body.notes,
      userId: user.id,
      chequeNo: body.chequeNo,
      chequeDate: body.chequeDate,
      chequeBank: body.chequeBank,
      chequePhotoUrl: body.chequePhotoUrl,
    });
    revalidatePath("/land");
    revalidatePath(`/land/${id}`);
    return json({ ok: true, paymentId: result.payment.id }, { status: 201 });
  } catch (err: unknown) {
    return json({ error: (err instanceof Error ? err.message : "Payment failed") }, { status: 400 });
  }
});
