import { NextRequest } from "next/server";
import { prisma } from "@nirman/db";
import { apiHandler, getCompany, json, toNum } from "@/lib/server";

/**
 * GET /api/stock — stock-by-location matrix.
 * Optional query: ?locationId=...  ?materialId=...
 *
 * Returns one row per (material, location) that has stock (qty > 0),
 * plus zero-qty rows are omitted for clarity.
 */
export const GET = apiHandler(async (req: NextRequest) => {
  const company = await getCompany();
  const { searchParams } = new URL(req.url);
  const locationId = searchParams.get("locationId");
  const materialId = searchParams.get("materialId");

  const items = await prisma.stockLocationItem.findMany({
    where: {
      location: { deletedAt: null, companyId: company.id, ...(locationId ? { id: locationId } : {}) },
      material: { deletedAt: null, ...(materialId ? { id: materialId } : {}) },
      qty: { gt: 0 },
    },
    include: {
      location: { select: { id: true, name: true, type: true } },
      material: {
        select: { id: true, code: true, name: true, unit: true, categoryId: true, category: { select: { name: true } } },
      },
    },
    orderBy: [{ material: { name: "asc" } }, { location: { name: "asc" } }],
  });

  const rows = items.map((i) => ({
    id: i.id,
    locationId: i.location.id,
    locationName: i.location.name,
    locationType: i.location.type,
    materialId: i.material.id,
    materialCode: i.material.code,
    materialName: i.material.name,
    categoryName: i.material.category.name,
    unit: i.material.unit,
    qty: toNum(i.qty),
    mac: toNum(i.movingAvgCost),
    value: toNum(i.qty) * toNum(i.movingAvgCost),
  }));

  return json(rows);
});
