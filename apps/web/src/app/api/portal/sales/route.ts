import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@nirman/db";
import { ServiceError } from "@nirman/services";
import { getPortalCustomer } from "@/lib/portal-auth";
import { toNum, json, ForbiddenError, UnauthorizedError } from "@/lib/server";

/**
 * GET /api/portal/sales — list the customer's asset sales (bookings).
 */
export const GET = async (_req: NextRequest) => {
  try {
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
  } catch (err: unknown) {
    if (err instanceof ServiceError) {
      return json({ error: err.message }, { status: err.status ?? 400 });
    }
    if (err instanceof SyntaxError && err.message.includes("JSON")) {
      return json({ error: "Malformed JSON in request body" }, { status: 400 });
    }
    if (err instanceof ForbiddenError) {
      return json({ error: err.message }, { status: 403 });
    }
    if (err instanceof UnauthorizedError) {
      return json({ error: err.message }, { status: 401 });
    }
    const prismaCode = (err as { code?: string })?.code;
    if (prismaCode === "P2024") {
      console.error("[apiHandler] Prisma P2024: connection pool exhausted");
      return json({ error: "Database busy — please retry shortly", retryable: true }, { status: 503, headers: { "Retry-After": "5" } });
    }
    if (prismaCode === "P1001") {
      console.error("[apiHandler] Prisma P1001: database unreachable");
      return json({ error: "Database unreachable — please retry shortly", retryable: true }, { status: 503, headers: { "Retry-After": "10" } });
    }
    if (prismaCode === "P1002") {
      console.error("[apiHandler] Prisma P1002: database timeout");
      return json({ error: "Database request timed out — please retry", retryable: true }, { status: 504 });
    }
    console.error("[apiHandler] Unhandled error:", err);
    return json({ error: "Internal server error" }, { status: 500 });
  }
};
