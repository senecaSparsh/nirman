import { NextRequest } from "next/server";
import { recordMaterialSaleRefund } from "@nirman/services";
import { prisma } from "@nirman/db";
import { PERM } from "@/lib/roles";
import { apiHandler, ForbiddenError, getCompany, getUserPermissions, json, requireUser, scopeWhere } from "@/lib/server";

/**
 * POST /api/material-sales/[id]/refund
 * Body: { amount, paymentMode, referenceNo?, notes? }
 * Refunds a customer credit — returns on an already-paid sale push the
 * receivable negative; this pays the customer back (Dr AR / Cr Cash).
 * Capped at the outstanding credit so it can never over-refund.
 * Requires SALES_MANAGE or FINANCE_MANAGE permission.
 */
export const POST = apiHandler(async (req: NextRequest) => {
  const user = await requireUser();
  const perms = await getUserPermissions();
  const hasManage = perms.includes(PERM.SALES_MANAGE) || perms.includes(PERM.FINANCE_MANAGE);
  if (!hasManage) throw new ForbiddenError();

  const company = await getCompany();
  const saleId = new URL(req.url).pathname.split("/")[3]!; // /api/material-sales/[id]/refund
  const body = await req.json();

  if (!body?.amount || Number(body.amount) <= 0) return json({ error: "amount must be > 0" }, { status: 400 });
  if (!body?.paymentMode) return json({ error: "paymentMode is required" }, { status: 400 });

  const sale = await prisma.materialSale.findFirst({
    where: { id: saleId, companyId: company.id, ...await scopeWhere("MaterialSale", {}) },
    select: { id: true },
  });
  if (!sale) return json({ error: "Material sale not found" }, { status: 404 });

  try {
    const refund = await recordMaterialSaleRefund({
      saleId,
      companyId: company.id,
      amount: String(body.amount),
      paymentMode: body.paymentMode,
      referenceNo: body.referenceNo,
      notes: body.notes,
      userId: user.id,
    });
    return json({ ok: true, refundId: refund.id, amount: refund.amount.toString() });
  } catch (err: unknown) {
    return json({ error: (err instanceof Error ? err.message : "Refund failed") }, { status: 400 });
  }
});
