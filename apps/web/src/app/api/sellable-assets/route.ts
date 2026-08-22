import { NextRequest } from "next/server";
import { prisma } from "@nirman/db";
import { apiHandler, getCompany, json, requirePermission, toNum } from "@/lib/server";
import { PERM } from "@/lib/roles";

/**
 * GET /api/sellable-assets?projectId=...&type=LAND|BUILT_UNIT|PROJECT
 * Returns assets that are AVAILABLE or HOLD (sellable) and not already sold.
 * For PROJECT type, returns projects where ALL units are sellable.
 */
export const GET = apiHandler(async (req: NextRequest) => {
  await requirePermission(PERM.ASSETS_VIEW);
  const company = await getCompany();
  const { searchParams } = new URL(req.url);
  const projectId = searchParams.get("projectId");
  const type = searchParams.get("type");

  const result: Record<string, unknown>[] = [];

  // PROJECT type — return sellable projects (all units AVAILABLE/HOLD, none sold)
  if (type === "PROJECT") {
    const projects = await prisma.project.findMany({
      where: {
        companyId: company.id,
        deletedAt: null,
        status: { in: ["PLANNED", "ACTIVE"] },
      },
      select: {
        id: true,
        name: true,
        totalSellableArea: true,
        totalProjectCost: true,
        reraNumber: true,
        builtUnits: {
          where: { deletedAt: null },
          select: { id: true, status: true, saleId: true, productionCost: true, area: true },
        },
      },
      orderBy: { name: "asc" },
    });

    for (const p of projects) {
      const units = p.builtUnits;
      if (units.length === 0) continue;
      // All units must be AVAILABLE or HOLD and not locked to a sale
      const allSellable = units.every((u) =>
        (u.status === "AVAILABLE" || u.status === "HOLD") && u.saleId === null,
      );
      if (!allSellable) continue;

      const totalCost = units.reduce((s, u) => s + toNum(u.productionCost), 0);
      const totalArea = units.reduce((s, u) => s + toNum(u.area), 0);
      result.push({
        id: p.id,
        name: p.name,
        unitCount: units.length,
        totalArea,
        totalCost,
        reraNumber: p.reraNumber,
      });
    }
    return json(result);
  }

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
        project: { select: { id: true, name: true, reraNumber: true } },
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
        projectReraNumber: p.project?.reraNumber ?? null,
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
        project: { select: { id: true, name: true, reraNumber: true } },
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
        projectReraNumber: u.project.reraNumber ?? null,
        costBasis: toNum(u.productionCost),
        askingPrice: u.askingPrice ? toNum(u.askingPrice) : null,
        currentValuation: toNum(u.currentValuation),
      });
    }
  }

  return json(result);
});
