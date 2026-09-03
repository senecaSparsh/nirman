import { NextRequest } from "next/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createSupplierPayment, getSupplierPayments } from "@nirman/services";
import { PERM } from "@/lib/roles";
import { apiHandler, getCompany, json, requirePermission } from "@/lib/server";

const paymentSchema = z.object({
  supplierId: z.string().min(1, "supplierId is required"),
  purchaseOrderId: z.string().optional(),
  invoiceId: z.string().optional(),
  amount: z.union([z.number(), z.string()]),
  tdsAmount: z.union([z.number(), z.string()]).optional(),
  tdsSection: z.string().optional(),
  paymentDate: z.string().optional(),
  paymentMode: z.string().min(1, "paymentMode is required"),
  referenceNo: z.string().optional(),
  chequePhotoUrl: z.string().optional().nullable(),
  notes: z.string().optional(),
});

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
      chequePhotoUrl: p.chequePhotoUrl,
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
  const parsed = paymentSchema.safeParse(body);
  if (!parsed.success) {
    return json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  }
  const data = parsed.data;

  try {
    const payment = await createSupplierPayment({
      supplierId: data.supplierId,
      companyId: company.id,
      purchaseOrderId: data.purchaseOrderId,
      invoiceId: data.invoiceId,
      amount: data.amount,
      tdsAmount: data.tdsAmount,
      tdsSection: data.tdsSection,
      paymentDate: data.paymentDate ? new Date(data.paymentDate) : undefined,
      paymentMode: data.paymentMode,
      referenceNo: data.referenceNo,
      chequePhotoUrl: data.chequePhotoUrl ?? null,
      notes: data.notes,
      userId: user.id,
    });

    revalidatePath("/supplier-payments");
    revalidatePath("/m/suppliers");
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
        chequePhotoUrl: payment.chequePhotoUrl,
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
