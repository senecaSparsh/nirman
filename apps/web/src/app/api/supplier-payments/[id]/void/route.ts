import { NextRequest } from "next/server";
import { revalidatePath } from "next/cache";
import { voidSupplierPayment } from "@nirman/services";
import { prisma } from "@nirman/db";
import { apiHandler, json, requirePermission, getCompany } from "@/lib/server";
import { PERM } from "@/lib/roles";

/**
 * POST /api/supplier-payments/[id]/void — void a mis-entered supplier payment.
 * Body: { reason?: string }
 *
 * The payment row stays for the audit trail (status → VOID) but is excluded
 * from every paid-sum; the posted GL entry is reversed, the supplier's
 * balance re-opens, and invoices it paid revert to APPROVED.
 */
export const POST = apiHandler(async (req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  const user = await requirePermission(PERM.FINANCE_MANAGE);
  const { id } = await params;

  const company = await getCompany();
  const existing = await prisma.supplierPayment.findFirst({ where: { id, companyId: company.id }, select: { id: true } });
  if (!existing) return json({ error: "Not found" }, { status: 404 });

  const body = await req.json().catch(() => ({}));
  try {
    await voidSupplierPayment({ paymentId: id, companyId: company.id, userId: user.id, reason: body?.reason });
    revalidatePath("/finance");
    revalidatePath("/m/supplier-payments");
    revalidatePath("/m/accounts");
    return json({ ok: true });
  } catch (err: unknown) {
    return json({ error: (err instanceof Error ? err.message : "Void failed") }, { status: 400 });
  }
});
