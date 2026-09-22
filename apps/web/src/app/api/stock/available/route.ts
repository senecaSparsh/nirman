import { NextRequest } from "next/server";
import { prisma } from "@nirman/db";
import { apiHandler, json, toNum, getCompany, scopeWhere } from "@/lib/server";
import { PERM } from "@/lib/roles";
import { requireAnyPermission } from "@/lib/server";

/**
 * GET /api/stock/available?locationId=...
 *   Returns materials that have stock (qty > 0) at the given location,
 *   with their current qty + MAC. Used by transfer and issue forms.
 *
 * GET /api/stock/available?materialId=...
 *   Returns the total stock (summed across all company locations) for a
 *   single material. Used by the requisition form to show current stock
 *   context (demand-slip enrichment).
 */
export const GET = apiHandler(async (req: NextRequest) => {
  // "What's in stock here / at each location" powers the material pickers in
  // issue, transfer, scrap, sale, adjust and requisition forms — an action-
  // perm holder must read availability or every line shows "No stock here".
  await requireAnyPermission(
    PERM.INVENTORY_VIEW, PERM.STOCK_ISSUE, PERM.STOCK_TRANSFER,
    PERM.REQUISITION_CREATE, PERM.PROCUREMENT_VIEW, PERM.SALES_VIEW,
  );
  const company = await getCompany();
  const { searchParams } = new URL(req.url);
  const locationId = searchParams.get("locationId");
  const materialId = searchParams.get("materialId");

  // StockLocationItem is scopeable through its location — a project-scoped
  // user sees only their projects' stock (same rule as /api/stock). Without
  // this filter the endpoint silently exposes out-of-scope locations' stock.
  const itemScope = await scopeWhere("StockLocationItem");

  // Single-material stock. Default: summed total across all locations.
  // With byLocation=true: a per-location breakdown so pickers can show
  // "N in stock" / dim zero-stock locations before the user submits.
  if (materialId && !locationId) {
    const byLocation = searchParams.get("byLocation") === "true";
    const items = await prisma.stockLocationItem.findMany({
      where: {
        materialId,
        location: { companyId: company.id, deletedAt: null },
        material: { deletedAt: null },
        AND: [itemScope],
      },
      select: {
        qty: true,
        movingAvgCost: true,
        location: { select: { id: true, name: true } },
      },
    });
    if (byLocation) {
      return json(
        items.map((i) => ({
          locationId: i.location.id,
          locationName: i.location.name,
          qty: toNum(i.qty),
        })),
      );
    }
    const totalQty = items.reduce((s, i) => s + toNum(i.qty), 0);
    const totalValue = items.reduce((s, i) => s + toNum(i.qty) * toNum(i.movingAvgCost), 0);
    const avgCost = totalQty > 0 ? totalValue / totalQty : 0;
    return json({ materialId, totalQty, totalValue, avgCost });
  }

  if (!locationId) return json({ error: "locationId or materialId is required" }, { status: 400 });

  const items = await prisma.stockLocationItem.findMany({
    where: {
      locationId,
      qty: { gt: 0 },
      material: { deletedAt: null },
      location: { companyId: company.id },
      AND: [itemScope],
    },
    include: {
      material: { select: { id: true, code: true, name: true, unit: true, barcode: true } },
    },
    orderBy: { material: { name: "asc" } },
    take: 1000,
  });

  const rows = items.map((i) => ({
    materialId: i.material.id,
    materialCode: i.material.code,
    materialName: i.material.name,
    unit: i.material.unit,
    barcode: i.material.barcode,
    qty: toNum(i.qty),
    mac: toNum(i.movingAvgCost),
  }));

  return json(rows);
});
