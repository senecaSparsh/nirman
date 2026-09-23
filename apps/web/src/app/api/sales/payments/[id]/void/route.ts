import { NextRequest } from "next/server";
import { revalidatePath } from "next/cache";
import { voidAssetSalePayment } from "@nirman/services";
import { prisma } from "@nirman/db";
import { apiHandler, json, requirePermission, getCompany } from "@/lib/server";
import { PERM } from "@/lib/roles";

/**
 * POST /api/sales/payments/[id]/void — void a mis-entered payment.
 * Body: { reason?: string }
 *
 * The payment row stays for the audit trail (status → VOID) but is excluded
 * from every paid-sum; the posted GL entry is reversed so the books net out.
 */
export const POST = apiHandler(async (req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  const user = await requirePermission(PERM.SALES_MANAGE);
  const { id } = await params;

  const company = await getCompany();
  const existing = await prisma.assetSalePayment.findFirst({ where: { id, assetSale: { companyId: company.id } }, select: { id: true } });
  if (!existing) return json({ error: "Not found" }, { status: 404 });

  const body = await req.json().catch(() => ({}));
  try {
    const result = await voidAssetSalePayment({ paymentId: id, userId: user.id, reason: body?.reason });
    revalidatePath("/sales");
    revalidatePath("/m/sales");
    return json({ ok: true, paymentStatus: result.paymentStatus });
  } catch (err: unknown) {
    return json({ error: (err instanceof Error ? err.message : "Void failed") }, { status: 400 });
  }
});
