import { NextRequest } from "next/server";
import { approveSupplierInvoice, getSupplierInvoice } from "@nirman/services";
import { PERM } from "@/lib/roles";
import { apiHandler, getCompany, json, requirePermission } from "@/lib/server";

/**
 * GET /api/supplier-invoices/[id]
 * Returns a single supplier invoice with three-way match details.
 */
export const GET = apiHandler(async (_req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  await requirePermission(PERM.FINANCE_VIEW);
  const company = await getCompany();
  const { id } = await params;

  const invoice = await getSupplierInvoice(id, company.id);
  if (!invoice) return json({ error: "Supplier invoice not found" }, { status: 404 });

  return json({
    id: invoice.id,
    invoiceNumber: invoice.invoiceNumber,
    supplierId: invoice.supplierId,
    supplier: invoice.supplier,
    purchaseOrderId: invoice.purchaseOrderId,
    purchaseOrder: invoice.purchaseOrder
      ? {
          id: invoice.purchaseOrder.id,
          poNumber: invoice.purchaseOrder.poNumber,
          status: invoice.purchaseOrder.status,
          subtotal: invoice.purchaseOrder.subtotal.toString(),
          gstTotal: invoice.purchaseOrder.gstTotal.toString(),
          total: invoice.purchaseOrder.total.toString(),
          lines: invoice.purchaseOrder.lines.map((l: typeof invoice.purchaseOrder.lines[number]) => ({
            id: l.id,
            materialId: l.materialId,
            materialName: l.material.name,
            materialCode: l.material.code,
            unit: l.material.unit,
            qtyOrdered: l.qtyOrdered.toString(),
            unitCost: l.unitCost.toString(),
            gstRate: l.gstRate.toString(),
            lineTotal: l.lineTotal.toString(),
          })),
          goodsReceipts: invoice.purchaseOrder.goodsReceipts.map((gr: typeof invoice.purchaseOrder.goodsReceipts[number]) => ({
            id: gr.id,
            receiptDate: gr.receiptDate.toISOString(),
            lines: gr.lines.map((gl: typeof gr.lines[number]) => ({
              id: gl.id,
              materialId: gl.materialId,
              materialName: gl.material.name,
              qtyReceived: gl.qtyReceived.toString(),
              unitCost: gl.unitCost.toString(),
            })),
          })),
        }
      : null,
    invoiceDate: invoice.invoiceDate.toISOString(),
    dueDate: invoice.dueDate?.toISOString() ?? null,
    subtotal: invoice.subtotal.toString(),
    gstAmount: invoice.gstAmount.toString(),
    totalAmount: invoice.totalAmount.toString(),
    status: invoice.status,
    matchStatus: invoice.matchStatus,
    matchNotes: invoice.matchNotes,
    receivedBy: invoice.receivedBy,
    approvedBy: invoice.approvedBy,
    approvedAt: invoice.approvedAt?.toISOString() ?? null,
    matchDetails: invoice.matchDetails
      ? {
          matched: invoice.matchDetails.matched,
          matchType: invoice.matchDetails.matchType,
          variances: invoice.matchDetails.variances,
        }
      : null,
  });
});

/**
 * PATCH /api/supplier-invoices/[id]
 * Body: { action: "approve" | "reject", notes? }
 * Approves or rejects (disputes) a supplier invoice.
 */
export const PATCH = apiHandler(async (req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  const user = await requirePermission(PERM.FINANCE_MANAGE);
  const company = await getCompany();
  const { id } = await params;
  const body = await req.json();

  if (!body?.action || !["approve", "reject"].includes(body.action)) {
    return json({ error: "action must be 'approve' or 'reject'" }, { status: 400 });
  }

  try {
    const updated = await approveSupplierInvoice({
      invoiceId: id,
      companyId: company.id,
      userId: user.id,
      action: body.action,
      notes: body.notes,
    });

    return json({
      ok: true,
      id: updated.id,
      status: updated.status,
      approvedByName: updated.approvedBy?.name ?? null,
      approvedAt: updated.approvedAt?.toISOString() ?? null,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Failed to update supplier invoice";
    const status = (err as { status?: number })?.status ?? 400;
    return json({ error: msg }, { status });
  }
});
