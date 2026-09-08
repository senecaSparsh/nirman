import { NextRequest } from "next/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createSupplierInvoice, getSupplierInvoices } from "@nirman/services";
import { PERM } from "@/lib/roles";
import { apiHandler, getCompany, json, requirePermission } from "@/lib/server";

const invoiceSchema = z.object({
  invoiceNumber: z.string().min(1, "invoiceNumber is required"),
  supplierId: z.string().min(1, "supplierId is required"),
  purchaseOrderId: z.string().optional(),
  invoiceDate: z.string().min(1, "invoiceDate is required"),
  dueDate: z.string().optional(),
  subtotal: z.union([z.number(), z.string()]),
  gstAmount: z.union([z.number(), z.string()]).optional(),
  totalAmount: z.union([z.number(), z.string()]),
  hsnCode: z.string().optional(),
  invoiceDocumentUrl: z.string().optional(),
  invoiceDocumentName: z.string().optional(),
  lines: z.array(z.object({
    materialId: z.string().min(1),
    quantity: z.union([z.number(), z.string()]),
    unitPrice: z.union([z.number(), z.string()]),
    gstRate: z.union([z.number(), z.string()]).optional(),
  })).optional(),
});

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
      invoiceDocumentUrl: inv.invoiceDocumentUrl ?? null,
      invoiceDocumentName: inv.invoiceDocumentName ?? null,
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
  const parsed = invoiceSchema.safeParse(body);
  if (!parsed.success) {
    return json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  }
  const data = parsed.data;

  try {
    const invoice = await createSupplierInvoice({
      invoiceNumber: data.invoiceNumber,
      companyId: company.id,
      supplierId: data.supplierId,
      purchaseOrderId: data.purchaseOrderId,
      invoiceDate: new Date(data.invoiceDate),
      dueDate: data.dueDate ? new Date(data.dueDate) : undefined,
      subtotal: data.subtotal,
      gstAmount: data.gstAmount,
      totalAmount: data.totalAmount,
      hsnCode: data.hsnCode,
      invoiceDocumentUrl: data.invoiceDocumentUrl,
      invoiceDocumentName: data.invoiceDocumentName,
      lines: data.lines,
      receivedById: user.id,
      userId: user.id,
    });

    revalidatePath("/finance");
    revalidatePath("/m/suppliers");
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
