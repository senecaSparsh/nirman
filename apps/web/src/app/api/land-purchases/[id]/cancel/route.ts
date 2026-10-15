import { NextRequest } from "next/server";
import { revalidatePath } from "next/cache";
import { cancelLandPurchase } from "@nirman/services";
import { prisma } from "@nirman/db";
import { apiHandler, json, requirePermission, getCompany } from "@/lib/server";
import { PERM } from "@/lib/roles";

/**
 * POST /api/land-purchases/[id]/cancel — cancel a pre-registry land purchase.
 * Removes the asset (WIP/land bank) from the books, extinguishes the unpaid
 * AP balance, and converts cash already paid into a seller refund receivable.
 * Body: { reason? }
 */
export const POST = apiHandler(async (req: NextRequest, ctx: { params: Promise<{ id: string }> }) => {
  const user = await requirePermission(PERM.ASSETS_MANAGE);
  const { id } = await ctx.params;

  const company = await getCompany();
  const existing = await prisma.landPurchase.findFirst({ where: { id, companyId: company.id }, select: { id: true } });
  if (!existing) return json({ error: "Not found" }, { status: 404 });

  const body = await req.json().catch(() => ({}));

  try {
    const result = await cancelLandPurchase({
      landPurchaseId: id,
      userId: user.id,
      reason: body?.reason,
    });
    revalidatePath("/land");
    revalidatePath(`/land/${id}`);
    return json({
      ok: true,
      purchaseStage: result.purchaseStage,
      refundReceivable: result.refundReceivable.toString(),
      payableReleased: result.payableReleased.toString(),
    });
  } catch (err: unknown) {
    return json({ error: (err instanceof Error ? err.message : "Cancel failed") }, { status: 400 });
  }
});
