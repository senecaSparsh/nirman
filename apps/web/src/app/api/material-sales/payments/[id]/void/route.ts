import { NextRequest } from "next/server";
import { revalidatePath } from "next/cache";
import { voidMaterialSalePayment } from "@nirman/services";
import { apiHandler, json, requirePermission, getCompany } from "@/lib/server";
import { PERM } from "@/lib/roles";

/**
 * POST /api/material-sales/payments/[id]/void — void a mis-entered payment.
 * Body: { reason?: string }
 *
 * The payment row stays for the audit trail (status → VOID) but is excluded
 * from paid-sums; the posted GL entry is reversed and the sale's
 * paymentStatus recomputes (PAID → PARTIAL/PENDING).
 */
export const POST = apiHandler(async (req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  const user = await requirePermission(PERM.SALES_MANAGE);
  const { id } = await params;

  const company = await getCompany();
  const body = await req.json().catch(() => ({}));
  try {
    const result = await voidMaterialSalePayment({ paymentId: id, companyId: company.id, userId: user.id, reason: body?.reason });
    revalidatePath("/m/material-sales");
    return json({ ok: true, paymentStatus: result.paymentStatus });
  } catch (err: unknown) {
    return json({ error: (err instanceof Error ? err.message : "Void failed") }, { status: 400 });
  }
});
