import { NextRequest } from "next/server";
import { prisma } from "@nirman/db";
import { requirePortalSupplier } from "@/lib/supplier-portal-auth";
import { createSupplierInvoice } from "@nirman/services";
import { apiHandler, json, toNum, UnauthorizedError } from "@/lib/server";

/**
 * GET /api/supplier-portal/invoices — the vendor's submitted bills with
 * match/approval/payment status + outstanding. Read-only.
 */
export const GET = apiHandler(async (_req: NextRequest) => {
  let supplier;
  try {
    supplier = await requirePortalSupplier();
  } catch {
    throw new UnauthorizedError();
  }

  const invoices = await prisma.supplierInvoice.findMany({
    where: { supplierId: supplier.id },
    select: {
      id: true,
      invoiceNumber: true,
      invoiceDate: true,
      dueDate: true,
      subtotal: true,
      gstAmount: true,
      totalAmount: true,
      status: true,
      matchStatus: true,
      purchaseOrder: { select: { poNumber: true } },
      payments: {
        where: { status: { not: "VOID" } },
        select: { amount: true },
      },
    },
    orderBy: { invoiceDate: "desc" },
    take: 200,
  });

  return json({
    invoices: invoices.map((i) => {
      const paid = i.payments.reduce((s, p) => s + toNum(p.amount), 0);
      return {
        id: i.id,
        invoiceNumber: i.invoiceNumber,
        invoiceDate: i.invoiceDate.toISOString(),
        dueDate: i.dueDate?.toISOString() ?? null,
        poNumber: i.purchaseOrder?.poNumber ?? null,
        subtotal: toNum(i.subtotal),
        gstAmount: toNum(i.gstAmount),
        totalAmount: toNum(i.totalAmount),
        status: i.status,
        matchStatus: i.matchStatus,
        paid,
        outstanding: Math.max(0, toNum(i.totalAmount) - paid),
      };
    }),
  });
}, { skipSession: true });

/**
 * POST /api/supplier-portal/invoices — submit a bill. The vendor keys in
 * their own invoice number, dates and amounts; the three-way match runs at
 * creation exactly like a staff-keyed invoice, landing it PENDING or
 * MATCHED for finance review. Supplier- and PO-scoped — a vendor can only
 * bill against their own POs.
 */
export const POST = apiHandler(async (req: NextRequest) => {
  let supplier;
  try {
    supplier = await requirePortalSupplier();
  } catch {
    throw new UnauthorizedError();
  }

  const body = await req.json().catch(() => ({}));
  const invoiceNumber = typeof body.invoiceNumber === "string" ? body.invoiceNumber.trim() : "";
  const invoiceDate = body.invoiceDate ? new Date(body.invoiceDate) : null;
  const dueDate = body.dueDate ? new Date(body.dueDate) : undefined;
  const subtotal = Number(body.subtotal);
  const gstAmount = body.gstAmount != null ? Number(body.gstAmount) : undefined;
  const totalAmount = Number(body.totalAmount);
  const purchaseOrderId = typeof body.purchaseOrderId === "string" && body.purchaseOrderId ? body.purchaseOrderId : undefined;
  const hsnCode = typeof body.hsnCode === "string" && body.hsnCode ? body.hsnCode : undefined;

  if (!invoiceNumber) return json({ error: "Invoice number is required." }, { status: 400 });
  if (!invoiceDate || isNaN(invoiceDate.getTime())) {
    return json({ error: "A valid invoice date is required." }, { status: 400 });
  }
  if (!isFinite(subtotal) || !isFinite(totalAmount)) {
    return json({ error: "Subtotal and total are required numbers." }, { status: 400 });
  }

  if (purchaseOrderId) {
    const po = await prisma.purchaseOrder.findUnique({
      where: { id: purchaseOrderId },
      select: { supplierId: true },
    });
    if (!po || po.supplierId !== supplier.id) {
      return json({ error: "That purchase order doesn't belong to you." }, { status: 403 });
    }
  }

  const invoice = await createSupplierInvoice({
    invoiceNumber,
    companyId: supplier.companyId,
    supplierId: supplier.id,
    purchaseOrderId,
    invoiceDate,
    dueDate: dueDate && !isNaN(dueDate.getTime()) ? dueDate : undefined,
    subtotal,
    gstAmount,
    totalAmount,
    hsnCode,
  });

  return json({
    ok: true,
    invoice: { id: invoice.id, invoiceNumber: invoice.invoiceNumber, status: invoice.status },
  });
}, { skipSession: true });
