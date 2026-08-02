import { NextRequest } from "next/server";
import { prisma } from "@nirman/db";
import { receiveGoods } from "@nirman/services";
import { apiHandler, getCompany, json, receiveGoodsSchema, requirePermission, toNum } from "@/lib/server";
import { PERM } from "@/lib/roles";

/**
 * GET /api/goods-receipts/receivable
 * Returns Purchase Orders in ORDERED or PARTIAL status for the current company,
 * with their lines + remaining qty — the data the field receiving flow needs to
 * pick a PO and record a goods receipt against it.
 */
export const GET = apiHandler(async (req: NextRequest) => {
  await requirePermission(PERM.PROCUREMENT_VIEW);
  const company = await getCompany();
  const { searchParams } = new URL(req.url);
  const receivableOnly = searchParams.get("receivable") === "true";

  const pos = await prisma.purchaseOrder.findMany({
    where: {
      companyId: company.id,
      ...(receivableOnly ? { status: { in: ["ORDERED", "PARTIAL"] } } : {}),
    },
    orderBy: { createdAt: "desc" },
    include: {
      supplier: { select: { id: true, name: true } },
      project: { select: { id: true, name: true } },
      destinationLocation: { select: { id: true, name: true, type: true } },
      lines: {
        include: { material: { select: { id: true, code: true, name: true, unit: true } } },
        orderBy: { material: { name: "asc" } },
      },
    },
  });

  return json(
    pos.map((po) => {
      const lines = po.lines.map((l) => ({
        id: l.id,
        materialId: l.materialId,
        materialCode: l.material.code,
        materialName: l.material.name,
        unit: l.material.unit,
        qtyOrdered: toNum(l.qtyOrdered),
        qtyReceived: toNum(l.qtyReceived),
        unitCost: toNum(l.unitCost),
        remaining: toNum(l.qtyOrdered) - toNum(l.qtyReceived),
      }));
      const totalOrdered = lines.reduce((s, l) => s + l.qtyOrdered, 0);
      const totalReceived = lines.reduce((s, l) => s + l.qtyReceived, 0);
      return {
        id: po.id,
        poNumber: po.poNumber,
        supplierName: po.supplier.name,
        projectName: po.project?.name ?? null,
        destinationLocationId: po.destinationLocationId,
        destinationLocationName: po.destinationLocation.name,
        destinationLocationType: po.destinationLocation.type,
        status: po.status,
        expectedDate: po.expectedDate?.toISOString() ?? null,
        totalOrdered,
        totalReceived,
        receivedPct: totalOrdered > 0 ? Math.round((totalReceived / totalOrdered) * 100) : 0,
        lines,
      };
    }),
  );
});

/**
 * POST /api/goods-receipts
 * Records a goods receipt against a Purchase Order. Delegates to receiveGoods which
 * atomically records PURCHASE_RECEIPT stock movements (updates MAC), creates the
 * GoodsReceipt + lines, and recomputes PO status (PARTIAL / RECEIVED).
 *
 * This is the primary field-facing mutation — wrapped by the offline-first /field
 * page so site storekeepers can receive shipments without connectivity.
 */
export const POST = apiHandler(async (req: NextRequest) => {
  const user = await requirePermission(PERM.PROCUREMENT_MANAGE);
  const body = await req.json();
  const parsed = receiveGoodsSchema.safeParse(body);
  if (!parsed.success) {
    return json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  }
  const { purchaseOrderId, locationId, notes, lines } = body as {
    purchaseOrderId: string;
    locationId: string;
    notes?: string | null;
    lines: { purchaseOrderLineId: string; materialId: string; qtyReceived: number; unitCost: number }[];
  };
  if (!purchaseOrderId) return json({ error: "purchaseOrderId is required" }, { status: 400 });
  if (!locationId) return json({ error: "locationId is required" }, { status: 400 });
  try {
    const result = await receiveGoods({
      purchaseOrderId,
      locationId,
      receivedById: user.id,
      notes: notes ?? undefined,
      lines: lines.map((l) => ({
        purchaseOrderLineId: l.purchaseOrderLineId,
        materialId: l.materialId,
        qtyReceived: l.qtyReceived,
        unitCost: l.unitCost,
      })),
    });
    return json(
      {
        ok: true,
        goodsReceiptId: result.goodsReceipt.id,
        newStatus: result.newStatus,
      },
      { status: 201 },
    );
  } catch (err: any) {
    return json({ error: err?.message ?? "Failed to receive goods" }, { status: 400 });
  }
});
