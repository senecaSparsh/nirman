import { NextRequest } from "next/server";
import { createSupplierPayment, getSupplierPayments } from "@nirman/services";
import { PERM } from "@/lib/roles";
import { apiHandler, getCompany, json, requirePermission } from "@/lib/server";

/**
 * GET /api/supplier-payments?supplierId=...&purchaseOrderId=...
 * Returns supplier payments for the current company, optionally filtered.
 */
export const GET = apiHandler(async (req: NextRequest) => {
  await requirePermission(PERM.FINANCE_VIEW);
  const company = await getCompany();
  const { searchParams } = new URL(req.url);
  const supplierId = searchParams.get("supplierId") ?? undefined;
  const purchaseOrderId = searchParams.get("purchaseOrderId") ?? undefined;

  const payments = await getSupplierPayments({ companyId: company.id, supplierId, purchaseOrderId });

  return json(
    payments.map((p) => ({
      id: p.id,
      paymentNumber: p.paymentNumber,
      supplierId: p.supplierId,
      supplierName: p.supplier.name,
      purchaseOrderId: p.purchaseOrderId,
      poNumber: p.purchaseOrder?.poNumber ?? null,
      invoiceId: p.invoiceId,
      invoiceNumber: p.invoice?.invoiceNumber ?? null,
      amount: p.amount.toString(),
      tdsAmount: p.tdsAmount.toString(),
      tdsSection: p.tdsSection,
      netPaidAmount: p.netPaidAmount.toString(),
      paymentDate: p.paymentDate.toISOString(),
      paymentMode: p.paymentMode,
      referenceNo: p.referenceNo,
      notes: p.notes,
      createdByName: p.createdBy?.name ?? null,
    })),
  );
});

/**
 * POST /api/supplier-payments
 * Body: { supplierId, purchaseOrderId?, amount, tdsAmount?, tdsSection?, paymentDate?, paymentMode, referenceNo?, notes? }
 * Records a supplier payment, posts GL (Dr AP / Cr Cash / Cr TDS Payable), updates supplier balance.
 */
export const POST = apiHandler(async (req: NextRequest) => {
  const user = await requirePermission(PERM.FINANCE_MANAGE);
  const company = await getCompany();
  const body = await req.json();

  if (!body?.supplierId) return json({ error: "supplierId is required" }, { status: 400 });
  const amt = Number(body?.amount);
  if (!body?.amount || !Number.isFinite(amt) || amt <= 0) return json({ error: "amount must be a finite number > 0" }, { status: 400 });
  if (!body?.paymentMode) return json({ error: "paymentMode is required" }, { status: 400 });

  try {
    const payment = await createSupplierPayment({
      supplierId: body.supplierId,
      companyId: company.id,
      purchaseOrderId: body.purchaseOrderId ?? undefined,
      invoiceId: body.invoiceId ?? undefined,
      amount: Number(body.amount),
      tdsAmount: body.tdsAmount ? Number(body.tdsAmount) : undefined,
      tdsSection: body.tdsSection,
      paymentDate: body.paymentDate ? new Date(body.paymentDate) : undefined,
      paymentMode: body.paymentMode,
      referenceNo: body.referenceNo,
      notes: body.notes,
      userId: user.id,
    });

    return json(
      {
        id: payment.id,
        paymentNumber: payment.paymentNumber,
        supplierId: payment.supplierId,
        supplierName: payment.supplier.name,
        purchaseOrderId: payment.purchaseOrderId,
        poNumber: payment.purchaseOrder?.poNumber ?? null,
        invoiceId: payment.invoiceId,
        invoiceNumber: payment.invoice?.invoiceNumber ?? null,
        amount: payment.amount.toString(),
        tdsAmount: payment.tdsAmount.toString(),
        tdsSection: payment.tdsSection,
        netPaidAmount: payment.netPaidAmount.toString(),
        paymentDate: payment.paymentDate.toISOString(),
        paymentMode: payment.paymentMode,
        referenceNo: payment.referenceNo,
        notes: payment.notes,
      },
      { status: 201 },
    );
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Failed to create supplier payment";
    const status = (err as { status?: number })?.status ?? 400;
    return json({ error: msg }, { status });
  }
});
