import { NextRequest } from "next/server";
import { revalidatePath } from "next/cache";
import { clearMaterialSaleCheque, bounceMaterialSaleCheque } from "@nirman/services";
import { apiHandler, json, requirePermission, getCompany } from "@/lib/server";
import { PERM } from "@/lib/roles";

/**
 * POST /api/material-sales/payments/[id]/cheque — clear or bounce a cheque
 * payment on a material sale.
 * Body: { action: "clear" | "bounce", bounceReason? }
 * Bounce reverses the Dr Cash / Cr AR posted at record time and recomputes
 * the sale's paymentStatus — a bounced cheque was never real money.
 */
export const POST = apiHandler(async (req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  const user = await requirePermission(PERM.SALES_MANAGE);
  const company = await getCompany();
  const { id } = await params;

  const body = await req.json().catch(() => ({}));
  const action = body?.action as string;

  try {
    if (action === "clear") {
      await clearMaterialSaleCheque({ paymentId: id, companyId: company.id, userId: user.id });
      revalidatePath("/material-sales");
      return json({ ok: true });
    }
    if (action === "bounce") {
      const result = await bounceMaterialSaleCheque({
        paymentId: id,
        companyId: company.id,
        userId: user.id,
        bounceReason: body?.bounceReason,
      });
      revalidatePath("/material-sales");
      return json({ ok: true, paymentStatus: result.paymentStatus });
    }
    return json({ error: "Invalid action. Use 'clear' or 'bounce'." }, { status: 400 });
  } catch (err: unknown) {
    return json({ error: (err instanceof Error ? err.message : "Cheque action failed") }, { status: 400 });
  }
});
