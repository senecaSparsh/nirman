import { prisma } from "@nirman/db";
import Decimal from "decimal.js";
import { ServiceError } from "./errors";

/**
 * Material Reconciliation + Cost Control Service.
 *
 * For each BOQ line item, reconcile:
 * - Required (from BOQ estimated qty)
 * - Issued (from MaterialIssue lines linked via WBS)
 * - Consumed (from MB entries — verified actual quantities)
 * - Physical stock (current stock at project site)
 *
 * Variance → scrap/wastage flag
 * Tolerance-based alerts when consumption exceeds BOQ + tolerance%
 */

export interface MaterialReconciliation {
  boqItemId: string;
  serialNo: string;
  description: string;
  materialId: string | null;
  materialCode: string;
  materialName: string;
  unit: string;
  // Quantities
  requiredQty: Decimal;       // BOQ estimated qty
  issuedQty: Decimal;         // material issued to site (MaterialIssueLine)
  consumedQty: Decimal;       // verified actual (MB entries)
  currentStock: Decimal;      // physical stock at project site
  // Variances
  issueVariance: Decimal;     // issued - required (over-issued?)
  consumptionVariance: Decimal; // consumed - required (over-consumed?)
  stockVariance: Decimal;     // (issued - consumed) - currentStock (unaccounted?)
  // Flags
  wastagePct: Decimal;        // (consumed - required) / required × 100
  isOverTolerance: boolean;
  tolerancePct: Decimal;
  alertLevel: "OK" | "WARNING" | "CRITICAL";
}

export interface ProjectReconciliation {
  projectId: string;
  items: MaterialReconciliation[];
  totalRequired: Decimal;
  totalIssued: Decimal;
  totalConsumed: Decimal;
  totalWastage: Decimal;
  overToleranceCount: number;
}

/**
 * Reconcile materials for a project: BOQ required vs issued vs consumed vs stock.
 *
 * Tolerance: if wastage exceeds tolerance% (default 5%), flag as WARNING.
 * If wastage exceeds 2× tolerance, flag as CRITICAL.
 */
export async function getProjectMaterialReconciliation(
  projectId: string,
  tolerancePct: Decimal | number = 5,
): Promise<ProjectReconciliation> {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { id: true },
  });
  if (!project) throw new ServiceError("Project not found", 404);

  const tolerance = new Decimal(tolerancePct);
  const criticalThreshold = tolerance.times(2);

  // Get all BOQ line items
  const boqItems = await prisma.boqItem.findMany({
    where: { projectId, type: "LINE_ITEM" },
    select: {
      id: true,
      serialNo: true,
      description: true,
      estimatedQty: true,
      unit: true,
      materialId: true,
      material: { select: { code: true, name: true, unit: true } },
    },
  });

  const items: MaterialReconciliation[] = [];
  let totalRequired = new Decimal(0);
  let totalIssued = new Decimal(0);
  let totalConsumed = new Decimal(0);

  for (const item of boqItems) {
    const requiredQty = new Decimal(item.estimatedQty ?? 0);

    // Issued: MaterialIssueLine for this project (approximation — all issues to the project)
    // In a full implementation, we'd link issues to specific BOQ items via WBS nodes
    let issuedQty = new Decimal(0);
    if (item.materialId) {
      const issues = await prisma.materialIssueLine.aggregate({
        where: {
          materialId: item.materialId,
          materialIssue: { projectId },
        },
        _sum: { qty: true },
      });
      issuedQty = new Decimal(issues._sum?.qty ?? 0);
    }

    // Consumed: MB entries for this BOQ item
    const mbEntries = await prisma.measurementBookEntry.aggregate({
      where: { boqItemId: item.id, status: "APPROVED" },
      _sum: { measuredQty: true },
    });
    const consumedQty = new Decimal(mbEntries._sum?.measuredQty ?? 0);

    // Current stock at project site locations
    let currentStock = new Decimal(0);
    if (item.materialId) {
      const stock = await prisma.stockLocationItem.aggregate({
        where: {
          materialId: item.materialId,
          location: { projectId },
        },
        _sum: { qty: true },
      });
      currentStock = new Decimal(stock._sum?.qty ?? 0);
    }

    // Variances
    const issueVariance = issuedQty.minus(requiredQty);
    const consumptionVariance = consumedQty.minus(requiredQty);
    const stockVariance = issuedQty.minus(consumedQty).minus(currentStock);

    // Wastage % = (consumed - required) / required × 100
    const wastagePct = requiredQty.gt(0)
      ? consumptionVariance.div(requiredQty).times(100)
      : new Decimal(0);

    const isOverTolerance = wastagePct.gt(tolerance);
    const alertLevel: "OK" | "WARNING" | "CRITICAL" =
      wastagePct.gt(criticalThreshold) ? "CRITICAL"
      : isOverTolerance ? "WARNING"
      : "OK";

    items.push({
      boqItemId: item.id,
      serialNo: item.serialNo,
      description: item.description,
      materialId: item.materialId,
      materialCode: item.material?.code ?? "—",
      materialName: item.material?.name ?? "—",
      unit: item.unit ?? item.material?.unit ?? "—",
      requiredQty: requiredQty.toDecimalPlaces(3),
      issuedQty: issuedQty.toDecimalPlaces(3),
      consumedQty: consumedQty.toDecimalPlaces(3),
      currentStock: currentStock.toDecimalPlaces(3),
      issueVariance: issueVariance.toDecimalPlaces(3),
      consumptionVariance: consumptionVariance.toDecimalPlaces(3),
      stockVariance: stockVariance.toDecimalPlaces(3),
      wastagePct: wastagePct.toDecimalPlaces(2),
      isOverTolerance,
      tolerancePct: tolerance.toDecimalPlaces(2),
      alertLevel,
    });

    totalRequired = totalRequired.plus(requiredQty);
    totalIssued = totalIssued.plus(issuedQty);
    totalConsumed = totalConsumed.plus(consumedQty);
  }

  const totalWastage = totalConsumed.minus(totalRequired);
  const overToleranceCount = items.filter((i) => i.isOverTolerance).length;

  return {
    projectId,
    items: items.sort((a, b) => b.wastagePct.minus(a.wastagePct).toNumber()),
    totalRequired: totalRequired.toDecimalPlaces(3),
    totalIssued: totalIssued.toDecimalPlaces(3),
    totalConsumed: totalConsumed.toDecimalPlaces(3),
    totalWastage: totalWastage.toDecimalPlaces(3),
    overToleranceCount,
  };
}

/**
 * Site-wise stock valuation: for each stock location in a project,
 * compute the total value of materials currently held.
 */
export interface SiteStockValuation {
  locationId: string;
  locationName: string;
  locationType: string;
  totalValue: Decimal;
  itemCount: number;
  items: Array<{
    materialCode: string;
    materialName: string;
    qty: Decimal;
    unit: string;
    mac: Decimal;
    value: Decimal;
  }>;
}

export async function getSiteStockValuation(projectId: string): Promise<SiteStockValuation[]> {
  const locations = await prisma.stockLocation.findMany({
    where: { projectId, deletedAt: null },
    select: {
      id: true,
      name: true,
      type: true,
      stockItems: {
        include: {
          material: { select: { code: true, name: true, unit: true } },
        },
      },
    },
  });

  return locations.map((loc) => {
    const items = loc.stockItems.map((item) => ({
      materialCode: item.material.code,
      materialName: item.material.name,
      qty: new Decimal(item.qty),
      unit: item.material.unit,
      mac: new Decimal(item.movingAvgCost),
      value: new Decimal(item.qty).times(new Decimal(item.movingAvgCost)),
    }));

    const totalValue = items.reduce(
      (sum, i) => sum.plus(i.value),
      new Decimal(0),
    );

    return {
      locationId: loc.id,
      locationName: loc.name,
      locationType: loc.type,
      totalValue: totalValue.toDecimalPlaces(2),
      itemCount: items.length,
      items: items
        .map((i) => ({
          ...i,
          qty: i.qty.toDecimalPlaces(3),
          mac: i.mac.toDecimalPlaces(2),
          value: i.value.toDecimalPlaces(2),
        }))
        .sort((a, b) => b.value.minus(a.value).toNumber()),
    };
  });
}
