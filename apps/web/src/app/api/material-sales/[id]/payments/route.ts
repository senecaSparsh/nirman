import { NextRequest } from "next/server";
import { createMaterialSalePayment, getMaterialSalePayments } from "@nirman/services";
import { prisma } from "@nirman/db";
import { PERM } from "@/lib/roles";
import { apiHandler, ForbiddenError, getCompany, getUserPermissions, json, requireUser } from "@/lib/server";

/**
 * GET /api/material-sales/[id]/payments
 * Returns all payments recorded against a material sale.
 * Requires SALES_VIEW or FINANCE_VIEW permission.
 */
export const GET = apiHandler(async (req: NextRequest) => {
  const user = await requireUser();
  const perms = await getUserPermissions();
  const hasView = perms.includes(PERM.SALES_VIEW) || perms.includes(PERM.FINANCE_VIEW);
  if (!hasView) throw new ForbiddenError();

  const company = await getCompany();
  const saleId = new URL(req.url).pathname.split("/")[3]!; // /api/material-sales/[id]/payments

  // Verify the sale belongs to the current company before returning payments
  const sale = await prisma.materialSale.findFirst({
    where: { id: saleId, companyId: company.id },
    select: { id: true, totalAmount: true, paymentStatus: true },
  });
  if (!sale) return json({ error: "Material sale not found" }, { status: 404 });

  const payments = await getMaterialSalePayments(saleId);

  return json(
    payments.map((p) => ({
      id: p.id,
      saleId: p.saleId,
      amount: p.amount.toString(),
      paymentDate: p.paymentDate.toISOString(),
      paymentMode: p.paymentMode,
      referenceNo: p.referenceNo,
      notes: p.notes,
      createdByName: p.createdBy?.name ?? null,
    })),
  );
});

/**
 * POST /api/material-sales/[id]/payments
 * Body: { amount, paymentDate?, paymentMode, referenceNo?, notes? }
 * Records a partial / additional payment against a material sale.
 * Posts GL (Dr Cash / Cr AR) and updates sale.paymentStatus.
 * Requires SALES_MANAGE or FINANCE_MANAGE permission.
 */
export const POST = apiHandler(async (req: NextRequest) => {
  const user = await requireUser();
  const perms = await getUserPermissions();
  const hasManage = perms.includes(PERM.SALES_MANAGE) || perms.includes(PERM.FINANCE_MANAGE);
  if (!hasManage) throw new ForbiddenError();

  const company = await getCompany();
  const saleId = new URL(req.url).pathname.split("/")[3]!; // /api/material-sales/[id]/payments
  const body = await req.json();

  if (!body?.amount || Number(body.amount) <= 0) return json({ error: "amount must be > 0" }, { status: 400 });
  if (!body?.paymentMode) return json({ error: "paymentMode is required" }, { status: 400 });

  try {
    const payment = await createMaterialSalePayment({
      saleId,
      companyId: company.id,
      amount: Number(body.amount),
      paymentDate: body.paymentDate ? new Date(body.paymentDate) : undefined,
      paymentMode: body.paymentMode,
      referenceNo: body.referenceNo,
      notes: body.notes,
      userId: user.id,
    });

    return json(
      {
        id: payment.id,
        saleId: payment.saleId,
        amount: payment.amount.toString(),
        paymentDate: payment.paymentDate.toISOString(),
        paymentMode: payment.paymentMode,
        referenceNo: payment.referenceNo,
        notes: payment.notes,
      },
      { status: 201 },
    );
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Failed to create material sale payment";
    const status = (err as { status?: number })?.status ?? 400;
    return json({ error: msg }, { status });
  }
});
