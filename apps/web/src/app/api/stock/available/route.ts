import { NextRequest } from "next/server";
import { prisma } from "@nirman/db";
import { apiHandler, json, toNum, getCompany } from "@/lib/server";
import { PERM } from "@/lib/roles";
import { requirePermission } from "@/lib/server";

/**
 * GET /api/stock/available?locationId=...
 * Returns materials that have stock (qty > 0) at the given location,
 * with their current qty + MAC. Used by transfer and issue forms.
 */
export const GET = apiHandler(async (req: NextRequest) => {
  await requirePermission(PERM.INVENTORY_VIEW);
  const company = await getCompany();
  const { searchParams } = new URL(req.url);
  const locationId = searchParams.get("locationId");
  if (!locationId) return json({ error: "locationId is required" }, { status: 400 });

  const items = await prisma.stockLocationItem.findMany({
    where: {
      locationId,
      qty: { gt: 0 },
      material: { deletedAt: null },
      location: { companyId: company.id },
    },
    include: {
      material: { select: { id: true, code: true, name: true, unit: true } },
    },
    orderBy: { material: { name: "asc" } },
  });

  const rows = items.map((i) => ({
    materialId: i.material.id,
    materialCode: i.material.code,
    materialName: i.material.name,
    unit: i.material.unit,
    qty: toNum(i.qty),
    mac: toNum(i.movingAvgCost),
  }));

  return json(rows);
});
