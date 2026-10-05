import { NextRequest } from "next/server";
import { prisma } from "@nirman/db";
import { apiHandler, json, toNum, requireUser, getCompany, scopeWhere } from "@/lib/server";

/**
 * GET /api/materials/[id]/last-purchase
 *
 * Returns the last purchase price for a material — the most recent
 * GoodsReceiptLine's unitCost for this material, scoped to the current
 * company. Falls back to the material's standardCost if no receipts exist.
 *
 * Response: { unitCost: number, source: "receipt" | "standard" | "none", date: string | null }
 */
export const GET = apiHandler(async (_req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  await requireUser();
  const company = await getCompany();
  const { id } = await params;

  // Find the most recent goods receipt line for this material, scoped to
  // in-scope locations — a scoped user's price hint must come from THEIR
  // project's history, not another site's negotiated rate.
  const grScope = await scopeWhere("GoodsReceipt");
  const lastReceipt = await prisma.goodsReceiptLine.findFirst({
    where: {
      materialId: id,
      goodsReceipt: {
        location: { companyId: company.id, deletedAt: null },
        ...(grScope ?? {}),
      },
    },
    orderBy: {
      goodsReceipt: { receiptDate: "desc" },
    },
    include: {
      goodsReceipt: {
        select: {
          receiptDate: true,
          purchaseOrder: { select: { poNumber: true } },
        },
      },
    },
  });

  if (lastReceipt) {
    return json({
      unitCost: toNum(lastReceipt.unitCost),
      source: "receipt",
      date: lastReceipt.goodsReceipt.receiptDate.toISOString(),
      poNumber: lastReceipt.goodsReceipt.purchaseOrder.poNumber,
      qty: toNum(lastReceipt.qtyReceived),
    });
  }

  // Fall back to the material's standard cost (company-scoped)
  const material = await prisma.material.findFirst({
    where: { id, companyId: company.id, deletedAt: null },
    select: { standardCost: true, currentCost: true },
  });

  if (!material) {
    return json({ error: "Material not found" }, { status: 404 });
  }

  const cost = toNum(material.standardCost) || toNum(material.currentCost);
  return json({
    unitCost: cost,
    source: cost > 0 ? "standard" : "none",
    date: null,
  });
});
