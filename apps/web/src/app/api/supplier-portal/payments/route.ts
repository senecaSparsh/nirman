import { NextRequest } from "next/server";
import { prisma } from "@nirman/db";
import { requirePortalSupplier } from "@/lib/supplier-portal-auth";
import { apiHandler, json, toNum, UnauthorizedError } from "@/lib/server";

/**
 * GET /api/supplier-portal/payments — the vendor's payment trail: payment
 * number, amount net of TDS, the TDS deduction (for their Form 26AS), mode,
 * reference, and status. Read-only.
 */
export const GET = apiHandler(async (_req: NextRequest) => {
  let supplier;
  try {
    supplier = await requirePortalSupplier();
  } catch {
    throw new UnauthorizedError();
  }

  const payments = await prisma.supplierPayment.findMany({
    where: { supplierId: supplier.id },
    select: {
      id: true,
      paymentNumber: true,
      amount: true,
      tdsAmount: true,
      tdsSection: true,
      netPaidAmount: true,
      paymentDate: true,
      paymentMode: true,
      referenceNo: true,
      status: true,
      purchaseOrder: { select: { poNumber: true } },
      invoice: { select: { invoiceNumber: true } },
    },
    orderBy: { paymentDate: "desc" },
    take: 200,
  });

  return json({
    payments: payments.map((p) => ({
      id: p.id,
      paymentNumber: p.paymentNumber,
      amount: toNum(p.amount),
      tdsAmount: toNum(p.tdsAmount),
      tdsSection: p.tdsSection,
      netPaidAmount: toNum(p.netPaidAmount),
      paymentDate: p.paymentDate.toISOString(),
      paymentMode: p.paymentMode,
      referenceNo: p.referenceNo,
      status: p.status,
      poNumber: p.purchaseOrder?.poNumber ?? null,
      invoiceNumber: p.invoice?.invoiceNumber ?? null,
    })),
  });
}, { skipSession: true });
