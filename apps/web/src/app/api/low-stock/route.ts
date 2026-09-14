import { prisma } from "@nirman/db";
import { apiHandler, getCompany, json, toNum } from "@/lib/server";
import { PERM } from "@/lib/roles";
import { requirePermission } from "@/lib/server";

/**
 * GET /api/low-stock — materials whose total stock across all locations
 * has dropped below their configured reorderPoint threshold.
 */
export const GET = apiHandler(async () => {
  await requirePermission(PERM.INVENTORY_VIEW);
  const company = await getCompany();
  // DB-side aggregation: sum stock per material via groupBy instead of
  // hydrating every StockLocationItem row per material into JS.
  const [materials, stockByMaterial] = await Promise.all([
    prisma.material.findMany({
      where: {
        companyId: company.id,
        deletedAt: null,
        reorderPoint: { not: null },
        category: { deletedAt: null },
      },
      select: {
        id: true,
        code: true,
        name: true,
        unit: true,
        minStock: true,
        reorderPoint: true,
        standardCost: true,
        category: { select: { name: true } },
      },
    }),
    prisma.stockLocationItem.groupBy({
      by: ["materialId"],
      where: { location: { deletedAt: null, companyId: company.id } },
      _sum: { qty: true },
    }),
  ]);
  const qtyByMaterial = new Map(
    stockByMaterial.map((s) => [s.materialId, toNum(s._sum.qty ?? 0)]),
  );

  const rows = materials
    .map((m) => {
      const totalQty = qtyByMaterial.get(m.id) ?? 0;
      const minStock = toNum(m.minStock);
      const reorderPoint = toNum(m.reorderPoint);
      return {
        id: m.id,
        code: m.code,
        name: m.name,
        categoryName: m.category?.name ?? "Uncategorized",
        unit: m.unit,
        totalQty,
        minStock,
        reorderPoint,
        shortfall: reorderPoint - totalQty,
        standardCost: toNum(m.standardCost),
      };
    })
    .filter((r) => r.totalQty < r.reorderPoint)
    .sort((a, b) => b.shortfall - a.shortfall);

  return json(rows);
});
