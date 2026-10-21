import { NextRequest } from "next/server";
import { prisma } from "@nirman/db";
import { requirePortalSupplier } from "@/lib/supplier-portal-auth";
import { apiHandler, json, toNum, UnauthorizedError } from "@/lib/server";

/**
 * GET /api/supplier-portal/purchase-orders — the vendor's POs: number, status,
 * dates, totals, and per-line ordered qty. Read-only; scoped to the
 * authenticated supplier cookie.
 */
export const GET = apiHandler(async (_req: NextRequest) => {
  let supplier;
  try {
    supplier = await requirePortalSupplier();
  } catch {
    throw new UnauthorizedError();
  }

  const orders = await prisma.purchaseOrder.findMany({
    where: { supplierId: supplier.id },
    select: {
      id: true,
      poNumber: true,
      status: true,
      orderDate: true,
      expectedDate: true,
      subtotal: true,
      gstTotal: true,
      freightTotal: true,
      loadingTotal: true,
      packingTotal: true,
      insuranceTotal: true,
      miscChargesTotal: true,
      discountTotal: true,
      total: true,
      project: { select: { name: true } },
      lines: {
        select: {
          id: true,
          qtyOrdered: true,
          unitCost: true,
          qtyReceived: true,
          material: { select: { name: true, unit: true } },
        },
      },
    },
    orderBy: { orderDate: "desc" },
    take: 200,
  });

  return json({
    orders: orders.map((o) => ({
      id: o.id,
      poNumber: o.poNumber,
      status: o.status,
      orderDate: o.orderDate.toISOString(),
      expectedDate: o.expectedDate?.toISOString() ?? null,
      projectName: o.project?.name ?? null,
      total: toNum(o.total),
      lines: o.lines.map((l: { id: string; qtyOrdered: unknown; qtyReceived: unknown; unitCost: unknown; material: { name: string; unit: string } | null }) => ({
        id: l.id,
        materialName: l.material?.name ?? "—",
        unit: l.material?.unit ?? null,
        qtyOrdered: toNum(l.qtyOrdered),
        qtyReceived: toNum(l.qtyReceived),
        unitCost: toNum(l.unitCost),
      })),
    })),
  });
}, { skipSession: true });
