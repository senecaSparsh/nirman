import { NextRequest } from "next/server";
import { prisma } from "@nirman/db";
import { receiveGoods } from "@nirman/services";
import { PERM } from "@/lib/roles";
import { apiHandler, json, receiveGoodsSchema, requirePermission } from "@/lib/server";

/**
 * POST /api/purchase-orders/[id]/receive — record a goods receipt against a PO.
 * Body: { notes?, lines: [{ purchaseOrderLineId, materialId, qtyReceived, unitCost }] }
 *
 * Delegates to the procurement service which atomically:
 *  - records PURCHASE_RECEIPT stock movements (updates StockLocationItem + MAC)
 *  - creates a GoodsReceipt + lines
 *  - updates PO line qtyReceived + recomputes PO status (PARTIAL/RECEIVED)
 */
export const POST = apiHandler(async (req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  const user = await requirePermission(PERM.PROCUREMENT_MANAGE);
  const { id } = await params;
  const body = await req.json();
  const parsed = receiveGoodsSchema.safeParse(body);
  if (!parsed.success) {
    return json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  }

  // Resolve the PO's destination location (receipt must go there)
  const po = await prisma.purchaseOrder.findUnique({
    where: { id },
    select: { destinationLocationId: true, status: true },
  });
  if (!po) return json({ error: "Purchase order not found" }, { status: 404 });

  const result = await receiveGoods({
    purchaseOrderId: id,
    locationId: po.destinationLocationId,
    receivedById: user.id,
    notes: parsed.data.notes ?? undefined,
    lines: parsed.data.lines.map((l) => ({
      purchaseOrderLineId: l.purchaseOrderLineId,
      materialId: l.materialId,
      qtyReceived: l.qtyReceived,
      unitCost: l.unitCost,
    })),
  });

  return json({ ok: true, newStatus: result.newStatus, goodsReceiptId: result.goodsReceipt.id }, { status: 201 });
});
