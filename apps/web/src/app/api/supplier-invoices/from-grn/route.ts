import { NextRequest } from "next/server";
import { prisma } from "@nirman/db";
import { createSupplierInvoice } from "@nirman/services";
import { PERM } from "@/lib/roles";
import { apiHandler, getCompany, getCompanyGroupIds, json, requirePermission } from "@/lib/server";

/**
 * POST /api/supplier-invoices/from-grn
 * Body: { goodsReceiptId: string }
 *
 * Auto-creates a DRAFT supplier invoice pre-filled from a Goods Receipt.
 * This is the real-world flow: goods arrive with the supplier's invoice/challan,
 * the receiver captures the invoice number on the GRN, and the accountant
 * creates a supplier invoice to trigger three-way matching.
 *
 * The invoice is pre-filled with:
 *   - Supplier from the PO
 *   - Invoice number from the GRN (if captured)
 *   - Line items from the GRN (materialId, qty, unitCost)
 *   - Subtotal = Σ(qty × unitCost)
 *   - GST = Σ(qty × unitCost × gstRate) from PO lines
 *   - Total = subtotal + GST
 *
 * The three-way match runs automatically inside createSupplierInvoice.
 */
export const POST = apiHandler(async (req: NextRequest) => {
  const user = await requirePermission(PERM.FINANCE_MANAGE);
  const company = await getCompany();
  const body = await req.json();

  if (!body?.goodsReceiptId) {
    return json({ error: "goodsReceiptId is required" }, { status: 400 });
  }

  // Fetch the GRN with all related data
  const groupCompanyIds = await getCompanyGroupIds(company);
  const grn = await prisma.goodsReceipt.findFirst({
    where: { id: body.goodsReceiptId },
    include: {
      purchaseOrder: {
        include: {
          supplier: { select: { id: true, name: true } },
          lines: { select: { materialId: true, gstRate: true, unitCost: true } },
        },
      },
      lines: {
        include: { material: { select: { id: true, name: true, gstRate: true } } },
      },
    },
  });

  if (!grn) return json({ error: "Goods receipt not found" }, { status: 404 });
  if (!grn.purchaseOrder) return json({ error: "GRN has no linked purchase order" }, { status: 400 });

  // Verify the GRN belongs to a company in the group
  const po = grn.purchaseOrder;
  if (!groupCompanyIds.includes(po.companyId)) {
    return json({ error: "Goods receipt not found" }, { status: 404 });
  }

  // Check if an invoice already exists for this GRN's invoice number + supplier
  if (grn.invoiceNumber) {
    const existing = await prisma.supplierInvoice.findFirst({
      where: {
        invoiceNumber: grn.invoiceNumber,
        supplierId: po.supplierId,
        companyId: po.companyId,
      },
    });
    if (existing) {
      return json({
        error: "Invoice already exists",
        invoiceId: existing.id,
        invoiceNumber: existing.invoiceNumber,
      }, { status: 409 });
    }
  }

  // Build invoice lines from GRN lines, enriched with GST rate from PO lines
  const invoiceLines = grn.lines.map((grl) => {
    const poLine = po.lines.find((pl) => pl.materialId === grl.materialId);
    const gstRate = poLine?.gstRate ?? grl.material.gstRate ?? 0;
    return {
      materialId: grl.materialId,
      quantity: Number(grl.qtyReceived),
      unitPrice: Number(grl.unitCost),
      gstRate: Number(gstRate),
    };
  });

  // Compute totals
  let subtotal = 0;
  let gstAmount = 0;
  for (const line of invoiceLines) {
    const lineTotal = line.quantity * line.unitPrice;
    subtotal += lineTotal;
    gstAmount += lineTotal * (line.gstRate / 100);
  }
  const totalAmount = subtotal + gstAmount;

  // Generate a draft invoice number if GRN doesn't have one
  const invoiceNumber = grn.invoiceNumber ?? `DRAFT-GRN-${grn.id.slice(-8).toUpperCase()}`;

  try {
    const invoice = await createSupplierInvoice({
      invoiceNumber,
      companyId: po.companyId,
      supplierId: po.supplierId,
      purchaseOrderId: po.id,
      invoiceDate: grn.receiptDate,
      dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days credit
      subtotal,
      gstAmount,
      totalAmount,
      lines: invoiceLines,
      receivedById: user.id,
      userId: user.id,
    });

    return json({
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
    }, { status: 201 });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Failed to create supplier invoice";
    const status = (err as { status?: number })?.status ?? 400;
    return json({ error: msg }, { status });
  }
});
