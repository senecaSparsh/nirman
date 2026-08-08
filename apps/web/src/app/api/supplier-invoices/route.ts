import { NextRequest } from "next/server";
import { createSupplierInvoice, getSupplierInvoices } from "@nirman/services";
import { PERM } from "@/lib/roles";
import { apiHandler, getCompany, json, requirePermission } from "@/lib/server";

/**
 * GET /api/supplier-invoices?supplierId=...&purchaseOrderId=...&status=...
 * Returns supplier invoices for the current company, optionally filtered.
 */
export const GET = apiHandler(async (req: NextRequest) => {
  await requirePermission(PERM.FINANCE_VIEW);
  const company = await getCompany();
  const { searchParams } = new URL(req.url);
  const supplierId = searchParams.get("supplierId") ?? undefined;
  const purchaseOrderId = searchParams.get("purchaseOrderId") ?? undefined;
  const status = searchParams.get("status") ?? undefined;

  const invoices = await getSupplierInvoices({
    companyId: company.id,
    supplierId,
    purchaseOrderId,
    status,
  });

  return json(
    invoices.map((inv: typeof invoices[number]) => ({
      id: inv.id,
      invoiceNumber: inv.invoiceNumber,
      supplierId: inv.supplierId,
      supplierName: inv.supplier.name,
      purchaseOrderId: inv.purchaseOrderId,
      poNumber: inv.purchaseOrder?.poNumber ?? null,
      invoiceDate: inv.invoiceDate.toISOString(),
      dueDate: inv.dueDate?.toISOString() ?? null,
      subtotal: inv.subtotal.toString(),
      gstAmount: inv.gstAmount.toString(),
      totalAmount: inv.totalAmount.toString(),
      status: inv.status,
      matchStatus: inv.matchStatus,
      matchNotes: inv.matchNotes,
      receivedByName: inv.receivedBy?.name ?? null,
      approvedByName: inv.approvedBy?.name ?? null,
      approvedAt: inv.approvedAt?.toISOString() ?? null,
      createdAt: inv.createdAt.toISOString(),
    })),
  );
});

/**
 * POST /api/supplier-invoices
 * Body: { invoiceNumber, supplierId, purchaseOrderId?, invoiceDate, dueDate?,
 *         subtotal, gstAmount?, totalAmount, lines? }
 * Creates a supplier invoice and runs the three-way match check.
 */
export const POST = apiHandler(async (req: NextRequest) => {
  const user = await requirePermission(PERM.FINANCE_MANAGE);
  const company = await getCompany();
  const body = await req.json();

  if (!body?.invoiceNumber) return json({ error: "invoiceNumber is required" }, { status: 400 });
  if (!body?.supplierId) return json({ error: "supplierId is required" }, { status: 400 });
  if (!body?.invoiceDate) return json({ error: "invoiceDate is required" }, { status: 400 });
  if (body?.subtotal == null || Number(body.subtotal) < 0) {
    return json({ error: "subtotal must be >= 0" }, { status: 400 });
  }
  if (body?.totalAmount == null || Number(body.totalAmount) < 0) {
    return json({ error: "totalAmount must be >= 0" }, { status: 400 });
  }

  try {
    const invoice = await createSupplierInvoice({
      invoiceNumber: body.invoiceNumber,
      companyId: company.id,
      supplierId: body.supplierId,
      purchaseOrderId: body.purchaseOrderId ?? undefined,
      invoiceDate: new Date(body.invoiceDate),
      dueDate: body.dueDate ? new Date(body.dueDate) : undefined,
      subtotal: Number(body.subtotal),
      gstAmount: body.gstAmount ? Number(body.gstAmount) : undefined,
      totalAmount: Number(body.totalAmount),
      lines: body.lines ?? undefined,
      receivedById: user.id,
      userId: user.id,
    });

    return json(
      {
        id: invoice.id,
        invoiceNumber: invoice.invoiceNumber,
        supplierId: invoice.supplierId,
        supplierName: invoice.supplier.name,
        purchaseOrderId: invoice.purchaseOrderId,
        poNumber: invoice.purchaseOrder?.poNumber ?? null,
        invoiceDate: invoice.invoiceDate.toISOString(),
        dueDate: invoice.dueDate?.toISOString() ?? null,
        subtotal: invoice.subtotal.toString(),
        gstAmount: invoice.gstAmount.toString(),
        totalAmount: invoice.totalAmount.toString(),
        status: invoice.status,
        matchStatus: invoice.matchStatus,
        matchNotes: invoice.matchNotes,
      },
      { status: 201 },
    );
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Failed to create supplier invoice";
    const status = (err as { status?: number })?.status ?? 400;
    return json({ error: msg }, { status });
  }
});
