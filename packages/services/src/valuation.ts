import { prisma, type Prisma } from "@nirman/db";
import Decimal from "decimal.js";

/**
 * Valuation Service — derives all financial reporting from the ledgers.
 *
 * Three core computations:
 * 1. Material inventory value (Σ qty × MAC per StockLocationItem, excluding deleted)
 * 2. Unsold asset value (Σ available/hold land parcels + built units × currentValuation)
 * 3. Project P&L + cost-per-sqft allocation to built units
 *
 * All functions are read-only (no mutations) except `reallocateProjectCosts`,
 * which writes the cached allocation back to Project + BuiltUnit rows.
 */

/**
 * Total value of all material stock across all locations (excluding soft-deleted).
 * Value = Σ StockLocationItem.qty × StockLocationItem.movingAvgCost
 */
export async function materialInventoryValue(companyId?: string): Promise<Decimal> {
  const items = await prisma.stockLocationItem.findMany({
    where: {
      location: {
        deletedAt: null,
        ...(companyId ? { companyId } : {}),
      },
      material: { deletedAt: null },
    },
    select: { qty: true, movingAvgCost: true },
  });

  return items.reduce(
    (sum, item) => sum.plus(new Decimal(item.qty).times(new Decimal(item.movingAvgCost))),
    new Decimal(0),
  );
}

/**
 * Material inventory value grouped by location.
 */
export async function materialInventoryValueByLocation(companyId?: string) {
  const items = await prisma.stockLocationItem.findMany({
    where: {
      location: {
        deletedAt: null,
        ...(companyId ? { companyId } : {}),
      },
      material: { deletedAt: null },
    },
    include: {
      location: { select: { id: true, name: true, type: true } },
      material: { select: { id: true, code: true, name: true, unit: true } },
    },
  });

  return items.map((item) => ({
    locationId: item.location.id,
    locationName: item.location.name,
    locationType: item.location.type,
    materialId: item.material.id,
    materialCode: item.material.code,
    materialName: item.material.name,
    unit: item.material.unit,
    qty: new Decimal(item.qty),
    mac: new Decimal(item.movingAvgCost),
    value: new Decimal(item.qty).times(new Decimal(item.movingAvgCost)),
  }));
}

/**
 * Total value of unsold assets (land parcels + built units that are AVAILABLE or HOLD).
 */
export async function unsoldAssetValue(companyId?: string): Promise<{
  land: Decimal;
  builtUnits: Decimal;
  total: Decimal;
}> {
  const [parcels, units] = await Promise.all([
    prisma.landParcel.findMany({
      where: {
        deletedAt: null,
        status: { in: ["AVAILABLE", "HOLD"] },
        landPurchase: {
          ...(companyId ? { companyId } : {}),
        },
      },
      select: { currentValuation: true },
    }),
    prisma.builtUnit.findMany({
      where: {
        deletedAt: null,
        status: { in: ["AVAILABLE", "HOLD"] },
        project: {
          ...(companyId ? { companyId } : {}),
        },
      },
      select: { currentValuation: true },
    }),
  ]);

  const land = parcels.reduce(
    (sum, p) => sum.plus(new Decimal(p.currentValuation)),
    new Decimal(0),
  );
  const builtUnits = units.reduce(
    (sum, u) => sum.plus(new Decimal(u.currentValuation)),
    new Decimal(0),
  );

  return { land, builtUnits, total: land.plus(builtUnits) };
}

/**
 * Computes the total cost of a project from all cost sources:
 * - Material issues (Σ MaterialIssueLine.qty × unitCost)
 * - Project costs (labour, overhead, equipment, contractor, permits)
 * - Allocated land cost (land purchases linked to this project)
 */
export async function projectTotalCost(projectId: string): Promise<{
  materials: Decimal;
  labour: Decimal;
  land: Decimal;
  costRecovery: Decimal;
  total: Decimal;
}> {
  const [materialIssues, projectCosts, landPurchases] = await Promise.all([
    prisma.materialIssueLine.aggregate({
      where: { materialIssue: { projectId } },
      _sum: { qty: true, unitCost: true },
    }),
    // ProjectCost doesn't have a single "amount" aggregate easily since costType varies;
    // sum all amounts
    prisma.projectCost.findMany({
      where: { projectId },
      select: { amount: true },
    }),
    prisma.landPurchase.findMany({
      where: { projectId, deletedAt: null },
      select: { totalCost: true },
    }),
  ]);

  // Materials: Σ (qty × unitCost) per line — Prisma can't multiply in aggregate,
  // so fetch lines and compute. For large datasets this could be a raw SQL query.
  const lines = await prisma.materialIssueLine.findMany({
    where: { materialIssue: { projectId } },
    select: { qty: true, unitCost: true },
  });
  const materials = lines.reduce(
    (sum, l) => sum.plus(new Decimal(l.qty).times(new Decimal(l.unitCost))),
    new Decimal(0),
  );

  const labour = projectCosts.reduce(
    (sum, c) => sum.plus(new Decimal(c.amount)),
    new Decimal(0),
  );

  const land = landPurchases.reduce(
    (sum, p) => sum.plus(new Decimal(p.totalCost)),
    new Decimal(0),
  );

  // Scrap sale revenue linked to this project — treated as cost recovery,
  // reducing the project's total construction expense.
  const scrapSales = await prisma.materialSale.findMany({
    where: { projectId, status: "ACTIVE" },
    select: { scrapSubtotal: true },
  });
  const costRecovery = scrapSales.reduce(
    (sum, s) => sum.plus(new Decimal(s.scrapSubtotal)),
    new Decimal(0),
  );

  const grossCost = materials.plus(labour).plus(land);
  const netCost = grossCost.minus(costRecovery);

  return { materials, labour, land, costRecovery, total: netCost };
}

/**
 * Computes project revenue from all asset sales linked to the project.
 */
export async function projectRevenue(projectId: string): Promise<Decimal> {
  const sales = await prisma.assetSale.findMany({
    where: { projectId },
    select: { salePrice: true },
  });
  return sales.reduce((sum, s) => sum.plus(new Decimal(s.salePrice)), new Decimal(0));
}

/**
 * Full project P&L: cost breakdown, revenue, profit, margin.
 */
export async function projectPnl(projectId: string) {
  const cost = await projectTotalCost(projectId);
  const revenue = await projectRevenue(projectId);
  const profit = revenue.minus(cost.total);
  const margin = revenue.gt(0) ? profit.div(revenue).times(100) : new Decimal(0);

  return { ...cost, revenue, profit, margin };
}

/**
 * Cost-per-sqft allocation routine.
 *
 * Bulk materials are issued to the *project*, not to individual units. To estimate
 * each unit's production cost, we allocate total project cost proportionally by area:
 *
 *   costPerSqft = totalProjectCost / totalSellableArea
 *   unit.productionCost = costPerSqft × unit.area
 *
 * This function:
 * 1. Computes total project cost (materials + labour + land)
 * 2. Sums the area of all sellable built units (non-deleted)
 * 3. Calculates costPerSqft
 * 4. Writes the allocation back to each BuiltUnit.productionCost + Project cache fields
 *
 * Should be called after material issues, project costs, or land purchases change.
 */
export async function reallocateProjectCosts(
  tx: Prisma.TransactionClient,
  projectId: string,
): Promise<{ costPerSqft: Decimal; totalCost: Decimal; totalArea: Decimal }> {
  // 1a. Material costs issued to the PROJECT (not to a specific unit) — area-allocated
  const projectLines = await tx.materialIssueLine.findMany({
    where: { materialIssue: { projectId, builtUnitId: null } },
    select: { qty: true, unitCost: true },
  });
  const projectMaterials = projectLines.reduce(
    (sum, l) => sum.plus(new Decimal(l.qty).times(new Decimal(l.unitCost))),
    new Decimal(0),
  );

  // 1b. Material costs issued directly to specific units — NOT area-allocated
  const unitDirectCosts = await tx.materialIssueLine.findMany({
    where: { materialIssue: { projectId, builtUnitId: { not: null } } },
    include: { materialIssue: { select: { builtUnitId: true } } },
  });
  const unitDirectCostMap = new Map<string, Decimal>();
  for (const line of unitDirectCosts) {
    const unitId = line.materialIssue.builtUnitId!;
    const cost = new Decimal(line.qty).times(new Decimal(line.unitCost));
    unitDirectCostMap.set(unitId, (unitDirectCostMap.get(unitId) ?? new Decimal(0)).plus(cost));
  }
  const directMaterialsTotal = [...unitDirectCostMap.values()].reduce(
    (sum, c) => sum.plus(c), new Decimal(0),
  );

  const projectCosts = await tx.projectCost.findMany({
    where: { projectId },
    select: { amount: true },
  });
  const labour = projectCosts.reduce(
    (sum, c) => sum.plus(new Decimal(c.amount)),
    new Decimal(0),
  );

  const landPurchases = await tx.landPurchase.findMany({
    where: { projectId, deletedAt: null },
    select: { totalCost: true },
  });
  const land = landPurchases.reduce(
    (sum, p) => sum.plus(new Decimal(p.totalCost)),
    new Decimal(0),
  );

  // Scrap sale revenue linked to this project — cost recovery reduces the
  // project's total construction expense (per the architecture: "reducing the
  // overall construction expense of that specific project").
  const scrapSales = await tx.materialSale.findMany({
    where: { projectId, status: "ACTIVE" },
    select: { scrapSubtotal: true },
  });
  const costRecovery = scrapSales.reduce(
    (sum, s) => sum.plus(new Decimal(s.scrapSubtotal)),
    new Decimal(0),
  );

  // Total cost = project-level materials + direct-to-unit materials + labour + land − scrap cost recovery
  const totalCost = projectMaterials.plus(directMaterialsTotal).plus(labour).plus(land).minus(costRecovery);

  // 2. Total sellable area (all non-deleted built units)
  const units = await tx.builtUnit.findMany({
    where: { projectId, deletedAt: null },
    select: { id: true, area: true },
  });
  const totalArea = units.reduce(
    (sum, u) => sum.plus(new Decimal(u.area)),
    new Decimal(0),
  );

  // 3. Cost per sqft — only for the PROJECT-level costs (not direct-to-unit costs)
  //    Direct-to-unit costs are added on top of the area allocation for that specific unit.
  //    Scrap cost recovery reduces the area-allocated pool (benefits all units proportionally).
  const poolToAllocate = projectMaterials.plus(labour).plus(land).minus(costRecovery);
  const costPerSqft = totalArea.gt(0) ? poolToAllocate.div(totalArea) : new Decimal(0);

  // 4. Write allocation back to each unit + project cache
  for (const unit of units) {
    const areaAllocated = costPerSqft.times(new Decimal(unit.area));
    const directCost = unitDirectCostMap.get(unit.id) ?? new Decimal(0);
    const totalUnitCost = areaAllocated.plus(directCost);
    await tx.builtUnit.update({
      where: { id: unit.id },
      data: { productionCost: totalUnitCost },
    });
  }

  await tx.project.update({
    where: { id: projectId },
    data: {
      costPerSqft,
      totalProjectCost: totalCost,
      totalSellableArea: totalArea,
    },
  });

  return { costPerSqft, totalCost, totalArea };
}
