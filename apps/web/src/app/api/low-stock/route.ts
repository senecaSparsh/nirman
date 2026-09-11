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
  const materials = await prisma.material.findMany({
    where: {
      companyId: company.id,
      deletedAt: null,
      reorderPoint: { not: null },
      category: { deletedAt: null },
    },
    include: {
      category: { select: { name: true } },
      stockItems: {
        where: { location: { deletedAt: null, companyId: company.id } },
        select: { qty: true, movingAvgCost: true },
      },
    },
  });

  const rows = materials
    .map((m) => {
      const totalQty = m.stockItems.reduce((s, i) => s + toNum(i.qty), 0);
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
