import { prisma } from "@nirman/db";
import { apiHandler, getCompany, json, toNum } from "@/lib/server";

/**
 * GET /api/low-stock — materials whose total stock across all locations
 * has dropped below their configured minStock threshold.
 */
export const GET = apiHandler(async () => {
  const company = await getCompany();
  const materials = await prisma.material.findMany({
    where: {
      deletedAt: null,
      minStock: { not: null },
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
      return {
        id: m.id,
        code: m.code,
        name: m.name,
        categoryName: m.category.name,
        unit: m.unit,
        totalQty,
        minStock,
        shortfall: minStock - totalQty,
        standardCost: toNum(m.standardCost),
      };
    })
    .filter((r) => r.totalQty < r.minStock)
    .sort((a, b) => b.shortfall - a.shortfall);

  return json(rows);
});
