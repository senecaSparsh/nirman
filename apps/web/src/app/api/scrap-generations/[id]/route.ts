import { NextRequest } from "next/server";
import { getScrapGeneration } from "@nirman/services";
import { apiHandler, getCompany, json, requirePermission, toNum } from "@/lib/server";
import { PERM } from "@/lib/roles";

/**
 * GET /api/scrap-generations/[id]
 * Get a single scrap generation with full details.
 */
export const GET = apiHandler(async (req: NextRequest) => {
  await requirePermission(PERM.INVENTORY_VIEW);
  const company = await getCompany();
  const id = new URL(req.url).pathname.split("/").pop()!;

  const scrap = await getScrapGeneration(id, company.id);
  return json({
    ...scrap,
    generationDate: scrap.generationDate.toISOString(),
    createdAt: scrap.createdAt.toISOString(),
    lines: scrap.lines.map((l) => ({
      ...l,
      qty: toNum(l.qty),
      unitCost: toNum(l.unitCost),
      lineTotal: toNum(l.qty) * toNum(l.unitCost),
    })),
  });
});
