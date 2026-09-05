import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@nirman/db";
import { getPortalCustomer } from "@/lib/portal-auth";
import { toNum } from "@/lib/server";

/**
 * GET /api/portal/sales — list the customer's asset sales (bookings).
 */
export const GET = async (_req: NextRequest) => {
  const customer = await getPortalCustomer();
  if (!customer) {
    return NextResponse.json({ error: "Not logged in" }, { status: 401 });
  }

  const sales = await prisma.assetSale.findMany({
    where: { customerId: customer.id, status: "ACTIVE" },
    include: {
      project: { select: { id: true, name: true } },
      landParcel: { select: { id: true, number: true, area: true, areaUnit: true } },
      builtUnit: { select: { id: true, unitNumber: true, unitType: true, area: true, areaUnit: true, floor: true, wing: true } },
      payments: { orderBy: { paymentDate: "asc" } },
      paymentSchedule: { include: { items: { orderBy: { installmentNo: "asc" } } } },
    },
    orderBy: { saleDate: "desc" },
  });

  return NextResponse.json({
    sales: sales.map((s) => {
      const totalPaid = s.payments.reduce((sum, p) => sum + toNum(p.amount), 0);
      const totalAmount = toNum(s.salePrice) + toNum(s.gstAmount);
      return {
        id: s.id,
        saleNumber: s.saleNumber,
        saleDate: s.saleDate.toISOString(),
        saleStage: s.saleStage,
        assetType: s.assetType,
        projectName: s.project?.name ?? "—",
        unitLabel: s.assetType === "LAND"
          ? `Plot ${s.landParcel?.number ?? "—"}`
          : `Unit ${s.builtUnit?.unitNumber ?? "—"}`,
        unitArea: s.landParcel?.area ?? s.builtUnit?.area ?? null,
        unitAreaUnit: s.landParcel?.areaUnit ?? s.builtUnit?.areaUnit ?? "sqft",
        salePrice: toNum(s.salePrice),
        gstAmount: toNum(s.gstAmount),
        totalAmount,
        totalPaid,
        balanceDue: totalAmount - totalPaid,
        paymentProgress: totalAmount > 0 ? Math.round((totalPaid / totalAmount) * 100) : 0,
        // Documents
        atsDocumentUrl: s.atsDocumentUrl,
        bbaDocumentUrl: s.bbaDocumentUrl,
        registryDocumentUrl: s.registryDocumentUrl,
        allotmentDocumentUrl: s.allotmentDocumentUrl,
        draftDocumentUrl: s.draftDocumentUrl,
        // Compliance
        allotmentLetterNo: s.allotmentLetterNo,
        bbaNo: s.bbaNo,
        saleDeedNo: s.saleDeedNo,
        atsNo: s.atsNo,
        // Payments
        payments: s.payments.map((p) => ({
          id: p.id,
          amount: toNum(p.amount),
          paymentDate: p.paymentDate.toISOString(),
          mode: p.mode,
          reference: p.reference,
          status: p.status,
        })),
        // Payment schedule
        paymentSchedule: s.paymentSchedule
          ? {
              type: s.paymentSchedule.type,
              items: s.paymentSchedule.items.map((item) => ({
                id: item.id,
                installmentNo: item.installmentNo,
                description: item.description,
                percentage: toNum(item.percentage),
                amount: toNum(item.amount),
                dueDate: item.dueDate?.toISOString() ?? null,
                status: item.status,
                paidAmount: toNum(item.paidAmount),
              })),
            }
          : null,
      };
    }),
  });
};
