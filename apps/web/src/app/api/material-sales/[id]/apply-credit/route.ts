import { NextRequest } from "next/server";
import { revalidatePath } from "next/cache";
import { applySaleCredit, listCustomerCredits, ServiceError } from "@nirman/services";
import { prisma } from "@nirman/db";
import { PERM } from "@/lib/roles";
import { apiHandler, ForbiddenError, getCompany, getUserPermissions, json, requireUser } from "@/lib/server";

/**
 * GET — the customer's spendable credits on other sales (for the apply-credit dialog).
 * POST — apply credit from a source sale to this one:
 *        { sourceSaleId, amount, notes? }
 *        Dr AR(source) / Cr AR(target), paired CREDIT_APPLIED rows, no cash.
 */
export const GET = apiHandler(async (_req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  await requireUser();
  const company = await getCompany();
  const perms = await getUserPermissions();
  if (!perms.includes(PERM.SALES_VIEW) && !perms.includes(PERM.FINANCE_VIEW)) {
    throw new ForbiddenError("Missing sales/finance view permission");
  }
  const { id } = await params;
  const sale = await prisma.materialSale.findFirst({
    where: { id, companyId: company.id },
    select: { customerId: true },
  });
  if (!sale) return json({ error: "Material sale not found" }, { status: 404 });
  const credits = await listCustomerCredits({ customerId: sale.customerId, companyId: company.id, excludeSaleId: id });
  return json({ credits: credits.map((c) => ({ saleId: c.saleId, saleNumber: c.saleNumber, refundable: c.refundable.toString() })) });
});

export const POST = apiHandler(async (req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  const user = await requireUser();
  const company = await getCompany();
  const perms = await getUserPermissions();
  if (!perms.includes(PERM.SALES_MANAGE) && !perms.includes(PERM.FINANCE_MANAGE)) {
    throw new ForbiddenError("Missing sales/finance manage permission");
  }
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const { sourceSaleId, amount, notes } = body ?? {};
  if (!sourceSaleId || amount == null) {
    return json({ error: "sourceSaleId and amount are required" }, { status: 400 });
  }
  try {
    const result = await applySaleCredit({
      sourceSaleId,
      targetSaleId: id,
      companyId: company.id,
      amount,
      notes: notes ?? undefined,
      userId: user.id,
    });
    revalidatePath("/material-sales");
    return json({ ok: true, paymentStatus: result.paymentStatus }, { status: 201 });
  } catch (err) {
    if (err instanceof ServiceError) return json({ error: err.message }, { status: err.status ?? 400 });
    throw err;
  }
});
