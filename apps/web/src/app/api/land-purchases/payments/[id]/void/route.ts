import { NextRequest } from "next/server";
import { revalidatePath } from "next/cache";
import { voidLandPurchasePayment } from "@nirman/services";
import { prisma } from "@nirman/db";
import { apiHandler, json, requirePermission, getCompany } from "@/lib/server";
import { PERM } from "@/lib/roles";

/**
 * POST /api/land-purchases/payments/[id]/void — void a mis-entered land payment.
 * Body: { reason?: string }
 *
 * The row stays for the audit trail (status → VOID) but is excluded from
 * payment sums; the GL effect is reversed (payment-level JE reversal, or a
 * correcting Dr AP / Cr Cash for a token payment folded into the purchase JE).
 */
export const POST = apiHandler(async (req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  const user = await requirePermission(PERM.ASSETS_MANAGE);
  const { id } = await params;

  const company = await getCompany();
  const existing = await prisma.landPurchasePayment.findFirst({ where: { id, landPurchase: { companyId: company.id } }, select: { id: true } });
  if (!existing) return json({ error: "Not found" }, { status: 404 });

  const body = await req.json().catch(() => ({}));
  try {
    await voidLandPurchasePayment({ paymentId: id, companyId: company.id, userId: user.id, reason: body?.reason });
    revalidatePath("/land");
    revalidatePath("/m/land");
    return json({ ok: true });
  } catch (err: unknown) {
    return json({ error: (err instanceof Error ? err.message : "Void failed") }, { status: 400 });
  }
});
