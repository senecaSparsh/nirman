import { NextRequest } from "next/server";
import { prisma } from "@nirman/db";
import { requirePortalSupplier } from "@/lib/supplier-portal-auth";
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
