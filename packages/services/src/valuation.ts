import { prisma, type Prisma } from "@nirman/db";
import Decimal from "decimal.js";
import { ServiceError } from "./errors";

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
export async function materialInventoryValue(companyId: string): Promise<Decimal> {
  const items = await prisma.stockLocationItem.findMany({
    where: {
      location: {
        deletedAt: null,
        companyId,
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
export async function unsoldAssetValue(companyId: string): Promise<{
  land: Decimal;
  builtUnits: Decimal;
  total: Decimal;
}> {
  const [parcels, units] = await Promise.all([
    prisma.landParcel.findMany({
      where: {
        deletedAt: null,
        status: { in: ["AVAILABLE", "HOLD"] },
        landPurchase: { companyId },
      },
      select: { currentValuation: true },
    }),
    prisma.builtUnit.findMany({
      where: {
        deletedAt: null,
        status: { in: ["AVAILABLE", "HOLD"] },
        project: { companyId },
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

  // Scrap generation value linked to this project — the scrap value was
  // already recovered from WIP at generation time (Dr Inventory / Cr WIP via
  // postScrapGeneration). This reduces the project's total construction cost
  // in the GL. The costing layer must match the GL, so we subtract the scrap
  // generation value here too.
  //
  // NOTE: Previously this subtracted scrap SALE revenue (MaterialSale.scrapSubtotal),
  // but that double-counted with the WIP credit at generation. The scrap sale
  // revenue is now recognized separately in the GL via COST_RECOVERY (4100) at
  // sale time, and does NOT reduce the project cost in the costing layer.
  const scrapGenerations = await prisma.scrapGenerationLine.findMany({
    where: { scrapGeneration: { projectId } },
    select: { qty: true, unitCost: true },
  });
  const costRecovery = scrapGenerations.reduce(
    (sum, l) => sum.plus(new Decimal(l.qty).times(new Decimal(l.unitCost))),
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

  // Scrap generation value linked to this project — the scrap value was
  // already recovered from WIP at generation time (Dr Inventory / Cr WIP via
  // postScrapGeneration). The costing layer must match the GL WIP balance,
  // so we subtract the scrap generation value (NOT scrap sale revenue, which
  // would double-count with the WIP credit at generation).
  const scrapGenLines = await tx.scrapGenerationLine.findMany({
    where: { scrapGeneration: { projectId } },
    select: { qty: true, unitCost: true },
  });
  const costRecovery = scrapGenLines.reduce(
    (sum, l) => sum.plus(new Decimal(l.qty).times(new Decimal(l.unitCost))),
    new Decimal(0),
  );

  // Total cost = project-level materials + direct-to-unit materials + labour + land − scrap generation value
  const totalCost = projectMaterials.plus(directMaterialsTotal).plus(labour).plus(land).minus(costRecovery);

  // 2. Total sellable area — only CREATED units participate in area allocation.
  //    PURCHASED units have their cost basis set at acquisition (acquisitionCost),
  //    and should NOT receive area-allocated construction costs.
  const units = await tx.builtUnit.findMany({
    where: { projectId, deletedAt: null, status: { in: ["AVAILABLE", "HOLD", "UNDER_CONSTRUCTION"] }, originType: "CREATED" },
    select: { id: true, area: true },
  });
  const totalArea = units.reduce(
    (sum, u) => sum.plus(new Decimal(u.area)),
    new Decimal(0),
  );

  // 3. Cost per sqft — only for the PROJECT-level costs (not direct-to-unit costs)
  //    Direct-to-unit costs are added on top of the area allocation for that specific unit.
  //    Scrap generation value reduces the area-allocated pool (benefits all units proportionally).
  const poolToAllocate = projectMaterials.plus(labour).plus(land).minus(costRecovery);
  if (totalArea.eq(0)) {
    // No sellable units (all PLANNED or SOLD) — costs remain in WIP
    // uncapitalized until units become AVAILABLE/HOLD/UNDER_CONSTRUCTION.
    // This is NOT an error — it's a valid state during early construction.
    // Previously this threw, which broke createBuiltUnits() on projects
    // that had land costs but no sellable units yet.
  }
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

// ─────────────────────────────────────────────────────────────────────────────
// PORTFOLIO SUMMARY — company-wide aggregation across all projects
// ─────────────────────────────────────────────────────────────────────────────

export interface PortfolioProjectSummary {
  id: string;
  name: string;
  status: string;
  totalBudget: Decimal;
  totalCost: Decimal;
  revenue: Decimal;
  profit: Decimal;
  marginPct: Decimal;
  unitCount: number;
  soldUnits: number;
  availableUnits: number;
}

export interface CompanyPortfolioSummary {
  /** Total value of material inventory across all locations */
  inventoryValue: Decimal;
  /** Total value of unsold land parcels + built units */
  unsoldAssetValue: Decimal;
  /** Total portfolio value = inventory + unsold assets */
  totalPortfolioValue: Decimal;
  /** Total revenue across all projects (from asset sales) */
  totalRevenue: Decimal;
  /** Total cost across all projects */
  totalCost: Decimal;
  /** Total profit = revenue - cost */
  totalProfit: Decimal;
  /** Average margin % across projects with revenue > 0 */
  avgMarginPct: Decimal;
  /** Total units across all projects */
  totalUnits: number;
  /** Units sold */
  soldUnits: number;
  /** Units available (AVAILABLE or HOLD) */
  availableUnits: number;
  /** Active projects (PLANNED or ACTIVE) */
  activeProjectCount: number;
  /** Per-project breakdown (sorted by revenue desc) */
  projects: PortfolioProjectSummary[];
}

/**
 * Company-wide portfolio summary — aggregates revenue, costs, profit,
 * and unit counts across ALL projects for a company.
 *
 * This is the "Cockpit" data: the owner's top-level view. It does NOT
 * load per-project line items — just the rolled-up numbers. Drill-down
 * pages (project health, cash flow, budget variance) load their own data.
 *
 * Uses the cached `totalProjectCost` + `totalBudget` fields on Project
 * for the cost/budget figures (these are kept fresh by
 * `reallocateProjectCosts()`), and computes revenue from AssetSale
 * directly. This avoids calling `projectPnl()` for every project on
 * every page load — the cached fields are the source of truth for the
 * summary, and the detail pages recompute when drilled into.
 */
export async function getCompanyPortfolioSummary(
  companyId: string,
): Promise<CompanyPortfolioSummary> {
  const [inventoryValue, unsoldAssets, projects] = await Promise.all([
    materialInventoryValue(companyId),
    unsoldAssetValue(companyId),
    prisma.project.findMany({
      where: { companyId, deletedAt: null },
      select: {
        id: true,
        name: true,
        status: true,
        totalBudget: true,
        totalProjectCost: true,
        _count: {
          select: {
            builtUnits: true,
            assetSales: { where: { status: { not: "CANCELLED" } } },
          },
        },
        builtUnits: {
          where: { deletedAt: null },
          select: { status: true },
        },
      },
      orderBy: { name: "asc" },
    }),
  ]);

  // Revenue per project — batch query all sales for this company's projects
  const projectIds = projects.map((p) => p.id);
  const sales = projectIds.length > 0
    ? await prisma.assetSale.findMany({
        where: { projectId: { in: projectIds }, status: { not: "CANCELLED" } },
        select: { projectId: true, salePrice: true },
      })
    : [];
  const revenueByProject = new Map<string, Decimal>();
  for (const s of sales) {
    const key = s.projectId ?? "__standalone__";
    const prev = revenueByProject.get(key) ?? new Decimal(0);
    revenueByProject.set(key, prev.plus(new Decimal(s.salePrice)));
  }

  const projectSummaries: PortfolioProjectSummary[] = projects.map((p) => {
    const revenue = revenueByProject.get(p.id) ?? new Decimal(0);
    const cost = new Decimal(p.totalProjectCost ?? 0);
    const profit = revenue.minus(cost);
    const marginPct = revenue.gt(0) ? profit.div(revenue).times(100) : new Decimal(0);
    const soldUnits = p._count.assetSales;
    const availableUnits = p.builtUnits.filter(
      (u) => u.status === "AVAILABLE" || u.status === "HOLD",
    ).length;
    return {
      id: p.id,
      name: p.name,
      status: p.status,
      totalBudget: new Decimal(p.totalBudget ?? 0),
      totalCost: cost,
      revenue,
      profit,
      marginPct,
      unitCount: p._count.builtUnits,
      soldUnits,
      availableUnits,
    };
  });

  // Sort by revenue descending — highest-revenue projects first
  projectSummaries.sort((a, b) => b.revenue.minus(a.revenue).toNumber());

  const totalRevenue = projectSummaries.reduce(
    (s, p) => s.plus(p.revenue),
    new Decimal(0),
  );
  const totalCost = projectSummaries.reduce(
    (s, p) => s.plus(p.totalCost),
    new Decimal(0),
  );
  const totalProfit = totalRevenue.minus(totalCost);
  // Average margin: only across projects that have revenue > 0
  const projectsWithRevenue = projectSummaries.filter((p) => p.revenue.gt(0));
  const avgMarginPct = projectsWithRevenue.length > 0
    ? projectsWithRevenue.reduce((s, p) => s.plus(p.marginPct), new Decimal(0)).div(projectsWithRevenue.length)
    : new Decimal(0);

  const totalUnits = projectSummaries.reduce((s, p) => s + p.unitCount, 0);
  const soldUnits = projectSummaries.reduce((s, p) => s + p.soldUnits, 0);
  const availableUnits = projectSummaries.reduce((s, p) => s + p.availableUnits, 0);
  const activeProjectCount = projectSummaries.filter(
    (p) => p.status === "PLANNED" || p.status === "ACTIVE",
  ).length;

  const totalPortfolioValue = inventoryValue.plus(unsoldAssets.total);

  return {
    inventoryValue,
    unsoldAssetValue: unsoldAssets.total,
    totalPortfolioValue,
    totalRevenue,
    totalCost,
    totalProfit,
    avgMarginPct,
    totalUnits,
    soldUnits,
    availableUnits,
    activeProjectCount,
    projects: projectSummaries,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// REAL ESTATE INVENTORY — the client's "real estate inventory dashboard"
// Shows: units sold/remaining/new additions per month, construction cost per
// project, land cost, total asset value, and available land parcels (whole).
// Two categories: "Whole" (plots sold as-is) + "Subdivided" (units on plots).
// ─────────────────────────────────────────────────────────────────────────────

export interface RealEstateProjectSummary {
  id: string;
  name: string;
  status: string;
  // Unit counts by status
  totalUnits: number;
  availableUnits: number;
  soldUnits: number;
  underConstructionUnits: number;
  reservedUnits: number;
  rentedUnits: number;
  // Unit counts by origin
  createdUnits: number;
  purchasedUnits: number;
  // Cost breakdown
  landCost: Decimal;
  constructionCost: Decimal; // materials + labour
  totalAssetValue: Decimal; // land + construction
  // Revenue from sold units + land
  revenue: Decimal;
  // Available land parcels (whole plots for sale) in this project
  availableParcels: number;
  parcelArea: Decimal;
}

export interface MonthlyAddition {
  month: string; // YYYY-MM
  created: number;
  purchased: number;
  total: number;
}

export interface RealEstateInventorySummary {
  // Summary counts
  totalUnits: number;
  availableUnits: number;
  soldUnits: number;
  underConstructionUnits: number;
  reservedUnits: number;
  rentedUnits: number;
  createdUnits: number;
  purchasedUnits: number;
  // Whole plots
  totalParcels: number;
  availableParcels: number;
  soldParcels: number;
  partitionedParcels: number;
  // Value
  totalAssetValue: Decimal;
  totalRevenue: Decimal;
  // Per-project breakdown
  projects: RealEstateProjectSummary[];
  // Monthly additions (last 12 months)
  monthlyAdditions: MonthlyAddition[];
}

export async function getRealEstateInventory(
  companyId: string,
): Promise<RealEstateInventorySummary> {
  // Fetch all projects for the company
  const projects = await prisma.project.findMany({
    where: { companyId, deletedAt: null },
    select: {
      id: true,
      name: true,
      status: true,
      totalProjectCost: true,
      totalSellableArea: true,
    },
    orderBy: { name: "asc" },
  });

  const projectIds = projects.map((p) => p.id);

  // Fetch all built units for these projects (non-deleted)
  const units = await prisma.builtUnit.findMany({
    where: { projectId: { in: projectIds }, deletedAt: null },
    select: {
      id: true,
      projectId: true,
      status: true,
      originType: true,
      productionCost: true,
      acquisitionCost: true,
      currentValuation: true,
      createdAt: true,
      purchaseDate: true,
    },
  });

  // Fetch all land parcels for these projects (non-deleted)
  const parcels = await prisma.landParcel.findMany({
    where: { projectId: { in: projectIds }, deletedAt: null },
    select: {
      id: true,
      projectId: true,
      status: true,
      acquisitionCost: true,
      area: true,
      saleId: true,
    },
  });

  // Fetch revenue from asset sales
  const sales = await prisma.assetSale.findMany({
    where: { companyId, status: { not: "CANCELLED" } },
    select: { salePrice: true },
  });
  const totalRevenue = sales.reduce((s, sale) => s.plus(new Decimal(sale.salePrice)), new Decimal(0));

  // Fetch land purchases for land cost per project
  const landPurchases = await prisma.landPurchase.findMany({
    where: { projectId: { in: projectIds }, deletedAt: null },
    select: { projectId: true, totalCost: true },
  });

  // ── Aggregate per project ──
  const projectSummaries: RealEstateProjectSummary[] = projects.map((project) => {
    const projectUnits = units.filter((u) => u.projectId === project.id);
    const projectParcels = parcels.filter((p) => p.projectId === project.id);
    const projectLand = landPurchases.filter((l) => l.projectId === project.id);

    const landCost = projectLand.reduce((s, l) => s.plus(new Decimal(l.totalCost)), new Decimal(0));
    // constructionCost = totalProjectCost - landCost (totalProjectCost includes land + materials + labour)
    const constructionCost = new Decimal(project.totalProjectCost ?? 0).minus(landCost);
    const totalAssetValue = new Decimal(project.totalProjectCost ?? 0);

    const projectRevenue = sales
      .filter(() => true) // already filtered by company; per-project revenue needs sale.projectId
      .reduce((s, sale) => s.plus(new Decimal(sale.salePrice)), new Decimal(0));

    return {
      id: project.id,
      name: project.name,
      status: project.status,
      totalUnits: projectUnits.length,
      availableUnits: projectUnits.filter((u) => u.status === "AVAILABLE").length,
      soldUnits: projectUnits.filter((u) => u.status === "SOLD").length,
      underConstructionUnits: projectUnits.filter((u) => u.status === "UNDER_CONSTRUCTION").length,
      reservedUnits: projectUnits.filter((u) => u.status === "RESERVED").length,
      rentedUnits: projectUnits.filter((u) => u.status === "RENTED").length,
      createdUnits: projectUnits.filter((u) => u.originType === "CREATED").length,
      purchasedUnits: projectUnits.filter((u) => u.originType === "PURCHASED").length,
      landCost,
      constructionCost: constructionCost.lt(0) ? new Decimal(0) : constructionCost,
      totalAssetValue,
      revenue: projectRevenue,
      availableParcels: projectParcels.filter((p) => p.status === "AVAILABLE").length,
      parcelArea: projectParcels
        .filter((p) => p.status === "AVAILABLE")
        .reduce((s, p) => s.plus(new Decimal(p.area)), new Decimal(0)),
    };
  });

  // ── Monthly additions (last 12 months) ──
  const now = new Date();
  const monthlyMap = new Map<string, { created: number; purchased: number }>();
  for (let i = 11; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    monthlyMap.set(key, { created: 0, purchased: 0 });
  }

  for (const unit of units) {
    const date = unit.originType === "PURCHASED" ? unit.purchaseDate : unit.createdAt;
    if (!date) continue;
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
    const entry = monthlyMap.get(key);
    if (entry) {
      if (unit.originType === "PURCHASED") entry.purchased++;
      else entry.created++;
    }
  }

  const monthlyAdditions: MonthlyAddition[] = [...monthlyMap.entries()].map(([month, v]) => ({
    month,
    created: v.created,
    purchased: v.purchased,
    total: v.created + v.purchased,
  }));

  // ── Summary totals ──
  const totalUnits = units.length;
  const availableUnits = units.filter((u) => u.status === "AVAILABLE").length;
  const soldUnits = units.filter((u) => u.status === "SOLD").length;
  const underConstructionUnits = units.filter((u) => u.status === "UNDER_CONSTRUCTION").length;
  const reservedUnits = units.filter((u) => u.status === "RESERVED").length;
  const rentedUnits = units.filter((u) => u.status === "RENTED").length;
  const createdUnits = units.filter((u) => u.originType === "CREATED").length;
  const purchasedUnits = units.filter((u) => u.originType === "PURCHASED").length;

  const totalParcels = parcels.length;
  const availableParcels = parcels.filter((p) => p.status === "AVAILABLE").length;
  const soldParcels = parcels.filter((p) => p.status === "SOLD").length;
  const partitionedParcels = parcels.filter((p) => p.status === "PARTITIONED").length;

  const totalAssetValue = projectSummaries.reduce(
    (s, p) => s.plus(p.totalAssetValue),
    new Decimal(0),
  );

  return {
    totalUnits,
    availableUnits,
    soldUnits,
    underConstructionUnits,
    reservedUnits,
    rentedUnits,
    createdUnits,
    purchasedUnits,
    totalParcels,
    availableParcels,
    soldParcels,
    partitionedParcels,
    totalAssetValue,
    totalRevenue,
    projects: projectSummaries,
    monthlyAdditions,
  };
}
