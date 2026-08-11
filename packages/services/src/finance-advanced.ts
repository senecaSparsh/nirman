import { prisma } from "@nirman/db";
import Decimal from "decimal.js";
import { ServiceError } from "./errors";

/**
 * Finance Enhancement Service.
 *
 * 1. Project Profit Center — per-project P&L (BOQ revenue vs actual cost)
 * 2. Cash Flow Forecasting — inflows from payment schedules + outflows from commitments
 * 3. Job Costing — direct + indirect costs, overhead absorption
 * 4. Budget Variance — BOQ budget vs actual, by cost category
 */

// ── 1. Project Profit Center ───────────────────────────────

export interface ProjectProfitCenter {
  projectId: string;
  projectName: string;
  // Revenue side
  totalRevenue: Decimal;        // sum of asset sale prices + other revenue
  costRecovery: Decimal;        // scrap sales etc.
  totalInflow: Decimal;         // revenue + cost recovery
  // Cost side
  landCost: Decimal;
  materialCost: Decimal;        // direct material issues
  labourCost: Decimal;          // payroll allocated to project
  equipmentCost: Decimal;       // equipment costs allocated
  subcontractorCost: Decimal;   // RA bill net payments
  overheadCost: Decimal;        // project expenses (indirect)
  totalCost: Decimal;
  // Profit
  grossProfit: Decimal;
  marginPct: Decimal;
  // Per-unit metrics
  totalSellableArea: Decimal;
  costPerSqft: Decimal;
  revenuePerSqft: Decimal;
}

/**
 * Compute a full P&L for a single project.
 * Revenue = sum of AssetSale.salePrice for this project
 * Costs = land + materials + labour + equipment + subcontractor + overhead
 */
export async function getProjectProfitCenter(projectId: string): Promise<ProjectProfitCenter> {
  const project = await prisma.project.findFirst({
    where: { id: projectId, deletedAt: null },
    select: { id: true, name: true, totalSellableArea: true },
  });
  if (!project) throw new ServiceError("Project not found", 404);

  // Revenue: asset sales
  const sales = await prisma.assetSale.findMany({
    where: { projectId, status: { not: "CANCELLED" } },
    select: { salePrice: true },
  });
  const totalRevenue = sales.reduce(
    (sum, s) => sum.plus(new Decimal(s.salePrice)),
    new Decimal(0),
  );

  // Cost recovery: scrap sales linked to this project
  const scrapSales = await prisma.materialSale.findMany({
    where: { projectId, status: "ACTIVE" },
    select: { scrapSubtotal: true },
  });
  const costRecovery = scrapSales.reduce(
    (sum, s) => sum.plus(new Decimal(s.scrapSubtotal ?? 0)),
    new Decimal(0),
  );

  const totalInflow = totalRevenue.plus(costRecovery);

  // Land cost
  const landPurchases = await prisma.landPurchase.findMany({
    where: { projectId },
    select: { totalCost: true },
  });
  const landCost = landPurchases.reduce(
    (sum, l) => sum.plus(new Decimal(l.totalCost)),
    new Decimal(0),
  );

  // Material cost: sum of MaterialIssueLine.unitCost × qty for this project
  const materialIssues = await prisma.materialIssueLine.aggregate({
    where: { materialIssue: { projectId } },
    _sum: { unitCost: true },
  });
  // Actually we need qty × unitCost, not just unitCost sum
  const issueLines = await prisma.materialIssueLine.findMany({
    where: { materialIssue: { projectId } },
    select: { qty: true, unitCost: true },
  });
  const materialCost = issueLines.reduce(
    (sum, l) => sum.plus(new Decimal(l.qty).times(new Decimal(l.unitCost))),
    new Decimal(0),
  );

  // Labour cost: payroll lines for employees whose activeProjectId = projectId
  const payrollLines = await prisma.payrollLine.aggregate({
    where: { employee: { activeProjectId: projectId } },
    _sum: { netPay: true },
  });
  const labourCost = new Decimal(payrollLines._sum?.netPay ?? 0);

  // Equipment cost: maintenance costs for equipment assigned to this project
  const equipMaintenance = await prisma.equipmentMaintenance.aggregate({
    where: { equipment: { assignments: { some: { projectId } } } },
    _sum: { cost: true },
  });
  const equipmentCost = new Decimal(equipMaintenance._sum?.cost ?? 0);

  // Subcontractor cost: net paid on RA bills
  const raBills = await prisma.raBill.aggregate({
    where: { workOrder: { projectId }, status: "PAID" },
    _sum: { netPayable: true },
  });
  const subcontractorCost = new Decimal(raBills._sum.netPayable ?? 0);

  // Overhead: project expenses
  const expenses = await prisma.projectCost.aggregate({
    where: { projectId },
    _sum: { amount: true },
  });
  const overheadCost = new Decimal(expenses._sum.amount ?? 0);

  const totalCost = landCost
    .plus(materialCost)
    .plus(labourCost)
    .plus(equipmentCost)
    .plus(subcontractorCost)
    .plus(overheadCost);

  const grossProfit = totalInflow.minus(totalCost);
  const marginPct = totalInflow.gt(0)
    ? grossProfit.div(totalInflow).times(100)
    : new Decimal(0);

  const totalSellableArea = new Decimal(project.totalSellableArea ?? 0);
  const costPerSqft = totalSellableArea.gt(0)
    ? totalCost.div(totalSellableArea)
    : new Decimal(0);
  const revenuePerSqft = totalSellableArea.gt(0)
    ? totalRevenue.div(totalSellableArea)
    : new Decimal(0);

  return {
    projectId,
    projectName: project.name,
    totalRevenue: totalRevenue.toDecimalPlaces(2),
    costRecovery: costRecovery.toDecimalPlaces(2),
    totalInflow: totalInflow.toDecimalPlaces(2),
    landCost: landCost.toDecimalPlaces(2),
    materialCost: materialCost.toDecimalPlaces(2),
    labourCost: labourCost.toDecimalPlaces(2),
    equipmentCost: equipmentCost.toDecimalPlaces(2),
    subcontractorCost: subcontractorCost.toDecimalPlaces(2),
    overheadCost: overheadCost.toDecimalPlaces(2),
    totalCost: totalCost.toDecimalPlaces(2),
    grossProfit: grossProfit.toDecimalPlaces(2),
    marginPct: marginPct.toDecimalPlaces(2),
    totalSellableArea: totalSellableArea.toDecimalPlaces(2),
    costPerSqft: costPerSqft.toDecimalPlaces(2),
    revenuePerSqft: revenuePerSqft.toDecimalPlaces(2),
  };
}

// ── 2. Cash Flow Forecasting ───────────────────────────────

export interface CashFlowForecast {
  inflows: {
    scheduledPayments: Array<{
      assetSaleId: string;
      customerName: string;
      unitName: string;
      dueDate: string | null;
      amount: Decimal;
      status: string;
    }>;
    totalInflow: Decimal;
  };
  outflows: {
    commitments: Decimal;        // open POs
    pendingRaBills: Decimal;     // RA bills awaiting payment
    payrollDue: Decimal;         // pending payroll
    totalOutflow: Decimal;
  };
  netCashFlow: Decimal;
}

/**
 * Forecast cash flow for a project over the coming period.
 * Inflows: due/pending payment schedule items
 * Outflows: open PO commitments + pending RA bills + pending payroll
 */
export async function getCashFlowForecast(projectId: string): Promise<CashFlowForecast> {
  const project = await prisma.project.findFirst({
    where: { id: projectId, deletedAt: null },
    select: { id: true },
  });
  if (!project) throw new ServiceError("Project not found", 404);

  // Inflows: payment schedule items that are DUE or PARTIAL
  const dueItems = await prisma.paymentScheduleItem.findMany({
    where: {
      status: { in: ["DUE", "PARTIAL"] },
      paymentSchedule: { assetSale: { projectId } },
    },
    include: {
      paymentSchedule: {
        include: {
          assetSale: {
            include: {
              customer: { select: { name: true } },
              builtUnit: { select: { unitNumber: true } },
            },
          },
        },
      },
    },
    orderBy: { dueDate: "asc" },
  });

  const scheduledPayments = dueItems.map((item) => {
    const sale = item.paymentSchedule!.assetSale;
    return {
      assetSaleId: sale.id,
      customerName: sale.customer.name,
      unitName: sale.builtUnit?.unitNumber ?? "—",
      dueDate: item.dueDate?.toISOString() ?? null,
      amount: new Decimal(item.totalAmount).minus(new Decimal(item.paidAmount)).toDecimalPlaces(2),
      status: item.status,
    };
  });

  const totalInflow = scheduledPayments.reduce(
    (sum, p) => sum.plus(p.amount),
    new Decimal(0),
  );

  // Outflows
  // Open POs
  const openPos = await prisma.purchaseOrder.aggregate({
    where: { projectId, status: { in: ["APPROVED", "ORDERED", "PARTIAL"] } },
    _sum: { total: true },
  });
  const commitments = new Decimal(openPos._sum.total ?? 0);

  // Pending RA bills (approved but not yet paid)
  const pendingRaBills = await prisma.raBill.aggregate({
    where: { workOrder: { projectId }, status: "APPROVED" },
    _sum: { netPayable: true },
  });
  const raBillsDue = new Decimal(pendingRaBills._sum?.netPayable ?? 0);

  // Pending payroll: payroll lines for employees assigned to this project, in DRAFT periods
  const pendingPayroll = await prisma.payrollLine.aggregate({
    where: {
      employee: { activeProjectId: projectId },
      payrollPeriod: { status: "DRAFT" },
    },
    _sum: { netPay: true },
  });
  const payrollDue = new Decimal(pendingPayroll._sum?.netPay ?? 0);

  const totalOutflow = commitments.plus(raBillsDue).plus(payrollDue);
  const netCashFlow = totalInflow.minus(totalOutflow);

  return {
    inflows: {
      scheduledPayments,
      totalInflow: totalInflow.toDecimalPlaces(2),
    },
    outflows: {
      commitments: commitments.toDecimalPlaces(2),
      pendingRaBills: raBillsDue.toDecimalPlaces(2),
      payrollDue: payrollDue.toDecimalPlaces(2),
      totalOutflow: totalOutflow.toDecimalPlaces(2),
    },
    netCashFlow: netCashFlow.toDecimalPlaces(2),
  };
}

// ── 3. Job Costing ─────────────────────────────────────────

export interface JobCosting {
  projectId: string;
  directCosts: {
    materials: Decimal;
    labour: Decimal;
    subcontractor: Decimal;
    equipment: Decimal;
    total: Decimal;
  };
  indirectCosts: {
    overhead: Decimal;
    adminAllocated: Decimal;
    total: Decimal;
  };
  totalCost: Decimal;
  absorbedOverheadRate: Decimal;  // indirect / direct %
}

/**
 * Job costing: classify costs as direct (materials, labour, subcontractor, equipment)
 * vs indirect (overhead, admin). Compute overhead absorption rate.
 */
export async function getJobCosting(projectId: string) {
  const pc = await getProjectProfitCenter(projectId);

  const directTotal = pc.materialCost
    .plus(pc.labourCost)
    .plus(pc.subcontractorCost)
    .plus(pc.equipmentCost);

  const indirectTotal = pc.overheadCost;

  const absorbedOverheadRate = directTotal.gt(0)
    ? indirectTotal.div(directTotal).times(100)
    : new Decimal(0);

  return {
    projectId,
    directCosts: {
      materials: pc.materialCost,
      labour: pc.labourCost,
      subcontractor: pc.subcontractorCost,
      equipment: pc.equipmentCost,
      total: directTotal.toDecimalPlaces(2),
    },
    indirectCosts: {
      overhead: pc.overheadCost,
      adminAllocated: new Decimal(0), // TODO: allocate company admin costs
      total: indirectTotal.toDecimalPlaces(2),
    },
    totalCost: pc.totalCost,
    absorbedOverheadRate: absorbedOverheadRate.toDecimalPlaces(2),
  };
}

// ── 4. Budget Variance ─────────────────────────────────────

export interface BudgetVarianceItem {
  id: string;               // boqItemId or synthetic id for non-BOQ categories
  serialNo: string;
  description: string;
  category: string;          // top-level BOQ section name or cost-type label
  source: "BOQ" | "LAND" | "MATERIAL" | "PROJECT_COST";
  budgetedAmount: Decimal;
  actualAmount: Decimal;
  variance: Decimal;
  variancePct: Decimal;
  status: "UNDER" | "ON_TRACK" | "OVER" | "UNBUDGETED";
}

export interface BudgetVariance {
  projectId: string;
  items: BudgetVarianceItem[];
  totalBudget: Decimal;      // project.totalBudget (overall)
  totalActual: Decimal;      // all actual costs
  totalVariance: Decimal;
  totalVariancePct: Decimal;
  // Budget allocation: how the overall budget splits between BOQ + non-BOQ
  boqBudget: Decimal;        // sum of BOQ estimatedAmount
  nonBoqBudget: Decimal;     // totalBudget - boqBudget (the residual for land/material/overhead)
}

/**
 * Full budget variance: compares project.totalBudget against ALL actual costs.
 *
 * The overall project budget covers everything — land, materials, labour, overhead,
 * AND construction work (BOQ). The BOQ itself only budgets the construction portion.
 * The residual (totalBudget − Σ BOQ estimates) is the implicit budget for non-BOQ costs.
 *
 * Cost categories:
 * 1. BOQ line items — budget = estimatedAmount, actual = RA bill lines linked to that BOQ item
 * 2. Land — budget = residual allocation, actual = land purchase totalCost
 * 3. Material Issues — budget = residual allocation, actual = Σ (qty × unitCost) of material issue lines
 * 4. Project Costs — budget = residual allocation, actual = Σ ProjectCost.amount
 *
 * The non-BOQ categories share the residual budget. If the residual is ≤ 0 (BOQ consumes
 * the entire budget), they're flagged UNBUDGETED.
 */
export async function getBudgetVariance(projectId: string): Promise<BudgetVariance> {
  const project = await prisma.project.findFirst({
    where: { id: projectId, deletedAt: null },
    select: { id: true, totalBudget: true },
  });
  if (!project) throw new ServiceError("Project not found", 404);

  const totalBudget = new Decimal(project.totalBudget ?? 0);

  // ── 1. BOQ line items: budget vs RA bills ──
  const boqItems = await prisma.boqItem.findMany({
    where: { projectId, type: "LINE_ITEM" },
    select: {
      id: true,
      serialNo: true,
      description: true,
      estimatedAmount: true,
      parent: { select: { description: true } },
    },
  });

  // Batch: single groupBy query instead of N+1 per-item aggregates
  const boqItemIds = boqItems.map((b) => b.id);
  const raBillLineSums = boqItemIds.length > 0
    ? await prisma.raBillLine.groupBy({
        by: ["boqItemId"],
        where: { boqItemId: { in: boqItemIds } },
        _sum: { totalAmount: true },
      })
    : [];
  const actualByBoq = new Map<string, Decimal>();
  for (const r of raBillLineSums) {
    actualByBoq.set(r.boqItemId, new Decimal(r._sum?.totalAmount ?? 0));
  }

  const items: BudgetVarianceItem[] = [];
  let boqBudget = new Decimal(0);
  let boqActual = new Decimal(0);

  for (const item of boqItems) {
    const budget = new Decimal(item.estimatedAmount ?? 0);
    const actual = actualByBoq.get(item.id) ?? new Decimal(0);
    const variance = budget.minus(actual);
    const variancePct = budget.gt(0) ? variance.div(budget).times(100) : new Decimal(0);
    const status: "UNDER" | "ON_TRACK" | "OVER" =
      variancePct.lt(-5) ? "OVER" : variancePct.gt(5) ? "UNDER" : "ON_TRACK";

    items.push({
      id: item.id,
      serialNo: item.serialNo,
      description: item.description,
      category: item.parent?.description ?? "Uncategorized",
      source: "BOQ",
      budgetedAmount: budget.toDecimalPlaces(2),
      actualAmount: actual.toDecimalPlaces(2),
      variance: variance.toDecimalPlaces(2),
      variancePct: variancePct.toDecimalPlaces(2),
      status,
    });

    boqBudget = boqBudget.plus(budget);
    boqActual = boqActual.plus(actual);
  }

  // ── 2. Non-BOQ costs: land, material issues, project costs ──
  // These share the residual budget (totalBudget − boqBudget).
  // We split the residual equally across the non-BOQ categories that have actual costs.
  const [landPurchases, materialLines, projectCosts] = await Promise.all([
    prisma.landPurchase.findMany({
      where: { projectId, deletedAt: null },
      select: { totalCost: true },
    }),
    prisma.materialIssueLine.findMany({
      where: { materialIssue: { projectId } },
      select: { qty: true, unitCost: true },
    }),
    prisma.projectCost.findMany({
      where: { projectId },
      select: { amount: true, costType: true },
    }),
  ]);

  const landActual = landPurchases.reduce(
    (s, p) => s.plus(new Decimal(p.totalCost)), new Decimal(0),
  );
  const materialActual = materialLines.reduce(
    (s, l) => s.plus(new Decimal(l.qty).times(new Decimal(l.unitCost))), new Decimal(0),
  );
  const projectCostActual = projectCosts.reduce(
    (s, c) => s.plus(new Decimal(c.amount)), new Decimal(0),
  );

  // Group project costs by type for finer granularity
  const costsByType = new Map<string, Decimal>();
  for (const c of projectCosts) {
    const key = c.costType;
    costsByType.set(key, (costsByType.get(key) ?? new Decimal(0)).plus(new Decimal(c.amount)));
  }

  const nonBoqActual = landActual.plus(materialActual).plus(projectCostActual);
  const nonBoqBudget = Decimal.max(0, totalBudget.minus(boqBudget));

  // Allocate the residual proportionally to each non-BOQ category's share of actual cost.
  // If nonBoqActual is 0, split equally. If residual is 0, all are UNBUDGETED.
  const nonBoqCategories: { source: "LAND" | "MATERIAL" | "PROJECT_COST"; description: string; actual: Decimal }[] = [];

  if (landActual.gt(0)) {
    nonBoqCategories.push({ source: "LAND", description: "Land Acquisition", actual: landActual });
  }
  if (materialActual.gt(0)) {
    nonBoqCategories.push({ source: "MATERIAL", description: "Material Issues", actual: materialActual });
  }
  // Project costs broken down by type
  for (const [costType, amount] of costsByType) {
    if (amount.gt(0)) {
      nonBoqCategories.push({
        source: "PROJECT_COST",
        description: `${costType.charAt(0) + costType.slice(1).toLowerCase()} Costs`,
        actual: amount,
      });
    }
  }

  const nonBoqCount = nonBoqCategories.length;
  for (const cat of nonBoqCategories) {
    const budget = nonBoqActual.gt(0)
      ? nonBoqBudget.times(cat.actual).div(nonBoqActual)
      : nonBoqBudget.div(Math.max(nonBoqCount, 1));
    const actual = cat.actual;
    const variance = budget.minus(actual);
    const variancePct = budget.gt(0) ? variance.div(budget).times(100) : new Decimal(0);
    const status: BudgetVarianceItem["status"] =
      budget.eq(0) ? "UNBUDGETED" :
      variancePct.lt(-5) ? "OVER" :
      variancePct.gt(5) ? "UNDER" : "ON_TRACK";

    items.push({
      id: `nonboq-${cat.source}-${cat.description}`,
      serialNo: "—",
      description: cat.description,
      category: "Non-BOQ Costs",
      source: cat.source,
      budgetedAmount: budget.toDecimalPlaces(2),
      actualAmount: actual.toDecimalPlaces(2),
      variance: variance.toDecimalPlaces(2),
      variancePct: variancePct.toDecimalPlaces(2),
      status,
    });
  }

  // ── 3. Totals ──
  const totalActual = boqActual.plus(nonBoqActual);
  const totalVariance = totalBudget.minus(totalActual);
  const totalVariancePct = totalBudget.gt(0)
    ? totalVariance.div(totalBudget).times(100)
    : new Decimal(0);

  return {
    projectId,
    items: items.sort((a, b) => b.variancePct.minus(a.variancePct).toNumber()),
    totalBudget: totalBudget.toDecimalPlaces(2),
    totalActual: totalActual.toDecimalPlaces(2),
    totalVariance: totalVariance.toDecimalPlaces(2),
    totalVariancePct: totalVariancePct.toDecimalPlaces(2),
    boqBudget: boqBudget.toDecimalPlaces(2),
    nonBoqBudget: nonBoqBudget.toDecimalPlaces(2),
  };
}
