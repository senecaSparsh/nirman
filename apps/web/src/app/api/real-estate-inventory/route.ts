import { NextRequest } from "next/server";
import { getRealEstateInventory } from "@nirman/services";
import { apiHandler, getCompany, json, requirePermission, toNum } from "@/lib/server";
import { PERM } from "@/lib/roles";

export const GET = apiHandler(async (_req: NextRequest) => {
  await requirePermission(PERM.ASSETS_VIEW);
  const company = await getCompany();

  const summary = await getRealEstateInventory(company.id);

  return json({
    totalUnits: summary.totalUnits,
    availableUnits: summary.availableUnits,
    soldUnits: summary.soldUnits,
    underConstructionUnits: summary.underConstructionUnits,
    reservedUnits: summary.reservedUnits,
    rentedUnits: summary.rentedUnits,
    createdUnits: summary.createdUnits,
    purchasedUnits: summary.purchasedUnits,
    totalParcels: summary.totalParcels,
    availableParcels: summary.availableParcels,
    soldParcels: summary.soldParcels,
    partitionedParcels: summary.partitionedParcels,
    totalAssetValue: toNum(summary.totalAssetValue),
    totalRevenue: toNum(summary.totalRevenue),
    projects: summary.projects.map((p) => ({
      id: p.id,
      name: p.name,
      status: p.status,
      totalUnits: p.totalUnits,
      availableUnits: p.availableUnits,
      soldUnits: p.soldUnits,
      underConstructionUnits: p.underConstructionUnits,
      reservedUnits: p.reservedUnits,
      rentedUnits: p.rentedUnits,
      createdUnits: p.createdUnits,
      purchasedUnits: p.purchasedUnits,
      landCost: toNum(p.landCost),
      constructionCost: toNum(p.constructionCost),
      totalAssetValue: toNum(p.totalAssetValue),
      revenue: toNum(p.revenue),
      availableParcels: p.availableParcels,
      parcelArea: toNum(p.parcelArea),
    })),
    monthlyAdditions: summary.monthlyAdditions,
  });
});
