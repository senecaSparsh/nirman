import { NextRequest } from "next/server";
import { prisma } from "@nirman/db";
import { apiHandler, getCompany, json, requirePermission, toNum } from "@/lib/server";
import { PERM } from "@/lib/roles";

/**
 * GET /api/sellable-assets?projectId=...&type=LAND|BUILT_UNIT
 * Returns assets that are AVAILABLE or HOLD (sellable) and not already sold.
 */
export const GET = apiHandler(async (req: NextRequest) => {
  await requirePermission(PERM.ASSETS_VIEW);
  const company = await getCompany();
  const { searchParams } = new URL(req.url);
  const projectId = searchParams.get("projectId");
  const type = searchParams.get("type");

  const result: any[] = [];

  if (!type || type === "LAND") {
    const parcels = await prisma.landParcel.findMany({
      where: {
        deletedAt: null,
        status: { in: ["AVAILABLE", "HOLD"] },
        saleId: null,
        landPurchase: { companyId: company.id },
        ...(projectId ? { projectId } : {}),
      },
      include: {
        project: { select: { id: true, name: true } },
        landPurchase: { select: { sellerName: true } },
      },
      orderBy: { number: "asc" },
    });
    for (const p of parcels) {
      result.push({
        assetType: "LAND",
        assetId: p.id,
        label: `Plot ${p.number} — ${toNum(p.area)} ${p.areaUnit}`,
        projectId: p.projectId,
        projectName: p.project?.name ?? null,
        costBasis: toNum(p.acquisitionCost),
        askingPrice: p.askingPrice ? toNum(p.askingPrice) : null,
        currentValuation: toNum(p.currentValuation),
      });
    }
  }

  if (!type || type === "BUILT_UNIT") {
    const units = await prisma.builtUnit.findMany({
      where: {
        deletedAt: null,
        status: { in: ["AVAILABLE", "HOLD"] },
        saleId: null,
        project: { companyId: company.id },
        ...(projectId ? { projectId } : {}),
      },
      include: {
        project: { select: { id: true, name: true } },
      },
      orderBy: { unitNumber: "asc" },
    });
    for (const u of units) {
      result.push({
        assetType: "BUILT_UNIT",
        assetId: u.id,
        label: `Unit ${u.unitNumber} (${u.unitType.replace("_", " ")}) — ${toNum(u.area)} ${u.areaUnit}`,
        projectId: u.projectId,
        projectName: u.project.name,
        costBasis: toNum(u.productionCost),
        askingPrice: u.askingPrice ? toNum(u.askingPrice) : null,
        currentValuation: toNum(u.currentValuation),
      });
    }
  }

  return json(result);
});
