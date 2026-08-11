import { NextRequest } from "next/server";
import { Prisma, prisma } from "@nirman/db";
import {
  materialInventoryValue,
  unsoldAssetValue,
  lowStockAlerts,
  projectPnl,
} from "@nirman/services";
import { apiHandler, getCompany, json, requireUser } from "@/lib/server";
import { MODULES, type ModelKey } from "@/lib/modules/registry";

/** Deep-serialize: Prisma.Decimal → number, Date → ISO string. */
function serialize(value: unknown): unknown {
  if (value == null) return value;
  if (Prisma.Decimal.isDecimal(value)) return Number(value.toString());
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(serialize);
  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) out[k] = serialize(v);
    return out;
  }
  return value;
}

export interface InsightStat {
  label: string;
  value: string | number;
  type?: "currency" | "number" | "date" | "badge";
  color?: string;
}

export interface InsightAlert {
  severity: "info" | "warning" | "danger";
  message: string;
}

export interface InsightRelated {
  label: string;
  count: number;
  model?: ModelKey;
}

export interface ModuleInsights {
  model: ModelKey;
  moduleLabel: string;
  stats: InsightStat[];
  alerts: InsightAlert[];
  related: InsightRelated[];
  /** Time-series data for charts/timelines */
  timeline?: { date: string; label: string; value: number }[];
}

/**
 * GET /api/modules/insights?model=<ModelKey>
 * Returns module-specific summary metrics, alerts, and related counts.
 * Used by the playground canvas Details tab to show real business data
 * behind each node — stock levels for Materials, P&L for Projects, etc.
 */
export const GET = apiHandler(async (req: NextRequest) => {
  await requireUser();
  const sp = req.nextUrl.searchParams;
  const model = sp.get("model") as ModelKey | null;
  if (!model || !MODULES[model]) {
    return json({ error: "Unknown module." }, { status: 400 });
  }
  const company = await getCompany();
  const insights = await computeInsights(model, company.id);
  return json(serialize(insights));
});

async function computeInsights(model: ModelKey, companyId: string): Promise<ModuleInsights> {
  const mod = MODULES[model];
  const base: ModuleInsights = { model, moduleLabel: mod.label, stats: [], alerts: [], related: [] };

  switch (model) {
    case "Company": return companyInsights(companyId);
    case "Project": return projectInsights(companyId);
    case "ProjectPhase": return phaseInsights(companyId);
    case "Employee": return employeeInsights(companyId);
    case "StockLocation": return stockLocationInsights(companyId);
    case "MaterialCategory": return materialCategoryInsights(companyId);
    case "Material": return materialInsights(companyId);
    case "Supplier": return supplierInsights(companyId);
    case "Subcontractor": return subcontractorInsights(companyId);
    case "PurchaseOrder": return purchaseOrderInsights(companyId);
    case "GoodsReceipt": return goodsReceiptInsights(companyId);
    case "MaterialRequisition": return requisitionInsights(companyId);
    case "StockMovement": return stockMovementInsights(companyId);
    case "StockLocationItem": return stockLocationItemInsights(companyId);
    case "MaterialIssue": return materialIssueInsights(companyId);
    case "StockTransfer": return stockTransferInsights(companyId);
    case "StockCount": return stockCountInsights(companyId);
    case "Equipment": return equipmentInsights(companyId);
    case "EquipmentAssignment": return equipmentAssignmentInsights(companyId);
    case "EquipmentMaintenance": return equipmentMaintenanceInsights(companyId);
    case "LandPurchase": return landPurchaseInsights(companyId);
    case "LandParcel": return landParcelInsights(companyId);
    case "BuiltUnit": return builtUnitInsights(companyId);
    case "Customer": return customerInsights(companyId);
    case "AssetSale": return assetSaleInsights(companyId);
    case "AssetSalePayment": return assetSalePaymentInsights(companyId);
    case "Expense": return expenseInsights(companyId);
    case "ProjectCost": return projectCostInsights(companyId);
    case "SupplierReturn": return supplierReturnInsights(companyId);
    case "AuditLog": return auditLogInsights(companyId);
    case "User": return userInsights(companyId);
    default: return base;
  }
}

// ── Per-module insight computations ──────────────────────────

async function companyInsights(companyId: string): Promise<ModuleInsights> {
  const c = await prisma.company.findUnique({ where: { id: companyId } });
  const [projectCount, locationCount, employeeCount, equipmentCount, materialCount, supplierCount, inventoryVal, unsoldAssets] = await Promise.all([
    prisma.project.count({ where: { companyId, deletedAt: null } }),
    prisma.stockLocation.count({ where: { companyId, deletedAt: null } }),
    prisma.employee.count({ where: { companyId, deletedAt: null } }),
    prisma.equipment.count({ where: { companyId, deletedAt: null } }),
    prisma.material.count({ where: { deletedAt: null, stockItems: { some: { location: { companyId } } } } }),
    // Supplier has no companyId — scope to suppliers with POs in this company.
    prisma.supplier.count({ where: { deletedAt: null, purchaseOrders: { some: { companyId } } } }),
    // Use shared service functions — same numbers as the main dashboard
    materialInventoryValue(companyId),
    unsoldAssetValue(companyId),
  ]);
  return {
    model: "Company",
    moduleLabel: "Company",
    stats: [
      { label: "GSTIN", value: c?.gstin ?? "—" },
      { label: "PAN", value: c?.pan ?? "—" },
      { label: "Currency", value: c?.currency ?? "INR" },
      { label: "Projects", value: projectCount, type: "number" },
      { label: "Inventory Value", value: Number(inventoryVal.toString()), type: "currency" },
      { label: "Unsold Assets", value: Number(unsoldAssets.total.toString()), type: "currency" },
      { label: "Stock Locations", value: locationCount, type: "number" },
      { label: "Employees", value: employeeCount, type: "number" },
      { label: "Equipment", value: equipmentCount, type: "number" },
      { label: "Materials", value: materialCount, type: "number" },
      { label: "Suppliers", value: supplierCount, type: "number" },
    ],
    alerts: [],
    related: [
      { label: "Projects", count: projectCount, model: "Project" },
      { label: "Stock Locations", count: locationCount, model: "StockLocation" },
      { label: "Employees", count: employeeCount, model: "Employee" },
      { label: "Equipment", count: equipmentCount, model: "Equipment" },
    ],
  };
}

async function projectInsights(companyId: string): Promise<ModuleInsights> {
  const projects = await prisma.project.findMany({
    where: { companyId, deletedAt: null },
    select: {
      id: true, name: true, status: true, type: true,
      totalBudget: true, totalProjectCost: true, costPerSqft: true,
      totalSellableArea: true, startDate: true, endDate: true,
      _count: { select: { builtUnits: true, phases: true, purchaseOrders: true, materialIssues: true, landPurchases: true } },
    },
  });
  const statusCounts = new Map<string, number>();
  projects.forEach((p) => statusCounts.set(p.status, (statusCounts.get(p.status) ?? 0) + 1));
  const totalBudget = projects.reduce((s, p) => s + Number(p.totalBudget ?? 0), 0);
  const totalCost = projects.reduce((s, p) => s + Number(p.totalProjectCost ?? 0), 0);
  const totalUnits = projects.reduce((s, p) => s + p._count.builtUnits, 0);
  const totalPOs = projects.reduce((s, p) => s + p._count.purchaseOrders, 0);

  // Compute real-time P&L for active projects using the shared service
  // (syncs with the project detail page which uses the same function)
  const activeProjects = projects.filter(p => p.status === "ACTIVE" || p.status === "PLANNED");
  const pnlResults = await Promise.all(
    activeProjects.slice(0, 10).map(p => projectPnl(p.id).catch(() => null)),
  );
  const totalRevenue = pnlResults.reduce((s, r) => s + (r ? Number(r.revenue.toString()) : 0), 0);
  const totalRealCost = pnlResults.reduce((s, r) => s + (r ? Number(r.total.toString()) : 0), 0);
  const totalProfit = totalRevenue - totalRealCost;

  const alerts: InsightAlert[] = [];
  projects.forEach((p) => {
    if (p.status === "ACTIVE" && p.endDate) {
      const daysLeft = Math.ceil((new Date(p.endDate).getTime() - Date.now()) / 86400000);
      if (daysLeft < 0) alerts.push({ severity: "danger", message: `${p.name} is ${Math.abs(daysLeft)} days overdue` });
      else if (daysLeft <= 14) alerts.push({ severity: "warning", message: `${p.name} ends in ${daysLeft} days` });
    }
    if (p.totalBudget && p.totalProjectCost && Number(p.totalProjectCost) > Number(p.totalBudget)) {
      alerts.push({ severity: "danger", message: `${p.name} is over budget (cost ${Number(p.totalProjectCost).toFixed(0)} vs budget ${Number(p.totalBudget).toFixed(0)})` });
    }
  });

  return {
    model: "Project",
    moduleLabel: "Project",
    stats: [
      { label: "Total Projects", value: projects.length, type: "number" },
      { label: "Total Budget", value: totalBudget, type: "currency" },
      { label: "Total Cost", value: totalCost, type: "currency" },
      { label: "Revenue (active)", value: totalRevenue, type: "currency" },
      { label: "Profit (active)", value: totalProfit, type: "currency", color: totalProfit >= 0 ? "#16a34a" : "#ef4444" },
      { label: "Built Units", value: totalUnits, type: "number" },
      { label: "Purchase Orders", value: totalPOs, type: "number" },
      ...Array.from(statusCounts.entries()).map(([status, count]) => ({
        label: status, value: count, type: "badge" as const,
      })),
    ],
    alerts,
    related: [
      { label: "Built Units", count: totalUnits, model: "BuiltUnit" },
      { label: "Phases", count: projects.reduce((s, p) => s + p._count.phases, 0), model: "ProjectPhase" },
      { label: "Purchase Orders", count: totalPOs, model: "PurchaseOrder" },
      { label: "Material Issues", count: projects.reduce((s, p) => s + p._count.materialIssues, 0), model: "MaterialIssue" },
      { label: "Land Purchases", count: projects.reduce((s, p) => s + p._count.landPurchases, 0), model: "LandPurchase" },
    ],
  };
}

async function phaseInsights(_companyId: string): Promise<ModuleInsights> {
  const phases = await prisma.projectPhase.findMany({
    select: {
      id: true, name: true, status: true, budget: true, startDate: true, endDate: true,
      _count: { select: { builtUnits: true, stockLocations: true, materialIssues: true } },
    },
  });
  const statusCounts = new Map<string, number>();
  phases.forEach((p) => statusCounts.set(p.status, (statusCounts.get(p.status) ?? 0) + 1));
  const totalBudget = phases.reduce((s, p) => s + Number(p.budget ?? 0), 0);
  return {
    model: "ProjectPhase",
    moduleLabel: "Project Phase",
    stats: [
      { label: "Total Phases", value: phases.length, type: "number" },
      { label: "Total Budget", value: totalBudget, type: "currency" },
      { label: "Built Units", value: phases.reduce((s, p) => s + p._count.builtUnits, 0), type: "number" },
      { label: "Stock Locations", value: phases.reduce((s, p) => s + p._count.stockLocations, 0), type: "number" },
      ...Array.from(statusCounts.entries()).map(([status, count]) => ({
        label: status, value: count, type: "badge" as const,
      })),
    ],
    alerts: phases.filter(p => p.status === "ACTIVE" && p.endDate && new Date(p.endDate) < new Date())
      .map(p => ({ severity: "danger" as const, message: `${p.name} phase is overdue` })),
    related: [
      { label: "Built Units", count: phases.reduce((s, p) => s + p._count.builtUnits, 0), model: "BuiltUnit" },
      { label: "Material Issues", count: phases.reduce((s, p) => s + p._count.materialIssues, 0), model: "MaterialIssue" },
    ],
  };
}

async function employeeInsights(companyId: string): Promise<ModuleInsights> {
  const employees = await prisma.employee.findMany({
    where: { companyId, deletedAt: null },
    select: { id: true, name: true, trade: true, dailyRate: true, active: true },
  });
  const active = employees.filter(e => e.active);
  const trades = new Map<string, number>();
  employees.forEach(e => { if (e.trade) trades.set(e.trade, (trades.get(e.trade) ?? 0) + 1); });
  const totalDailyRate = active.reduce((s, e) => s + Number(e.dailyRate), 0);
  return {
    model: "Employee",
    moduleLabel: "Employee",
    stats: [
      { label: "Total", value: employees.length, type: "number" },
      { label: "Active", value: active.length, type: "number" },
      { label: "Inactive", value: employees.length - active.length, type: "number" },
      { label: "Daily Labour Cost", value: totalDailyRate, type: "currency" },
      ...Array.from(trades.entries()).map(([trade, count]) => ({
        label: trade, value: count, type: "badge" as const,
      })),
    ],
    alerts: [],
    related: [],
  };
}

async function stockLocationInsights(companyId: string): Promise<ModuleInsights> {
  const [locations, totalItems, inventoryValue] = await Promise.all([
    prisma.stockLocation.findMany({
      where: { companyId, deletedAt: null },
      select: { id: true, name: true, type: true, _count: { select: { stockItems: true, purchaseOrders: true, goodsReceipts: true } } },
    }),
    prisma.stockLocationItem.count({
      where: { location: { companyId, deletedAt: null } },
    }),
    // Use shared service for inventory value — consistent with dashboard
    materialInventoryValue(companyId),
  ]);
  const warehouseCount = locations.filter(l => l.type === "COMPANY_WAREHOUSE").length;
  const siteCount = locations.filter(l => l.type === "PROJECT_SITE").length;
  return {
    model: "StockLocation",
    moduleLabel: "Stock Location",
    stats: [
      { label: "Total Locations", value: locations.length, type: "number" },
      { label: "Warehouses", value: warehouseCount, type: "number" },
      { label: "Project Sites", value: siteCount, type: "number" },
      { label: "Stock Items", value: totalItems, type: "number" },
      { label: "Inventory Value", value: Number(inventoryValue.toString()), type: "currency" },
    ],
    alerts: [],
    related: [
      { label: "Purchase Orders", count: locations.reduce((s, l) => s + l._count.purchaseOrders, 0), model: "PurchaseOrder" },
      { label: "Goods Receipts", count: locations.reduce((s, l) => s + l._count.goodsReceipts, 0), model: "GoodsReceipt" },
    ],
  };
}

async function materialCategoryInsights(_companyId: string): Promise<ModuleInsights> {
  // Global entity — shared across companies (no companyId on MaterialCategory).
  const categories = await prisma.materialCategory.findMany({
    where: { deletedAt: null },
    select: { id: true, name: true, class: true, _count: { select: { materials: true } } },
  });
  const classCounts = new Map<string, number>();
  categories.forEach(c => classCounts.set(c.class, (classCounts.get(c.class) ?? 0) + 1));
  return {
    model: "MaterialCategory",
    moduleLabel: "Material Category",
    stats: [
      { label: "Total Categories", value: categories.length, type: "number" },
      { label: "Total Materials", value: categories.reduce((s, c) => s + c._count.materials, 0), type: "number" },
      ...Array.from(classCounts.entries()).map(([cls, count]) => ({
        label: cls, value: count, type: "badge" as const,
      })),
    ],
    alerts: [],
    related: [{ label: "Materials", count: categories.reduce((s, c) => s + c._count.materials, 0), model: "Material" }],
  };
}

async function materialInsights(companyId: string): Promise<ModuleInsights> {
  // Use shared service functions for consistency with the main dashboard
  // Material is a global catalog entity (no companyId); stock scoped per company.
  const [materials, inventoryValue, alerts] = await Promise.all([
    prisma.material.findMany({
      where: { deletedAt: null },
      select: {
        id: true, code: true, name: true, unit: true, minStock: true, reorderPoint: true,
        stockItems: { where: { location: { companyId } }, select: { qty: true, movingAvgCost: true } },
      },
    }),
    materialInventoryValue(companyId),
    lowStockAlerts(companyId),
  ]);

  const totalValue = Number(inventoryValue.toString());
  const lowStock = alerts.filter(a => a.isCritical);
  const reorder = alerts.filter(a => !a.isCritical);

  return {
    model: "Material",
    moduleLabel: "Material",
    stats: [
      { label: "Total Materials", value: materials.length, type: "number" },
      { label: "Inventory Value", value: totalValue, type: "currency" },
      { label: "Low Stock", value: lowStock.length, type: "number", color: lowStock.length > 0 ? "#ef4444" : undefined },
      { label: "Needs Reorder", value: reorder.length, type: "number", color: reorder.length > 0 ? "#f59e0b" : undefined },
    ],
    alerts: [
      ...lowStock.slice(0, 5).map(a => ({ severity: "danger" as const, message: `Low stock: ${a.code} (${Number(a.totalStock).toFixed(0)} ${a.unit})` })),
      ...reorder.slice(0, 3).map(a => ({ severity: "warning" as const, message: `Reorder needed: ${a.code}` })),
    ],
    related: [
      { label: "Stock Items", count: materials.reduce((s, m) => s + m.stockItems.length, 0), model: "StockLocationItem" },
    ],
  };
}

async function supplierInsights(companyId: string): Promise<ModuleInsights> {
  const suppliers = await prisma.supplier.findMany({
    where: { companyId, deletedAt: null },
    select: { id: true, name: true, balanceOwed: true, _count: { select: { purchaseOrders: { where: { companyId } } } } },
  });
  const totalOwed = suppliers.reduce((s, sup) => s + Number(sup.balanceOwed), 0);
  return {
    model: "Supplier",
    moduleLabel: "Supplier",
    stats: [
      { label: "Total Suppliers", value: suppliers.length, type: "number" },
      { label: "Balance Owed", value: totalOwed, type: "currency", color: totalOwed > 0 ? "#f59e0b" : undefined },
      { label: "Total POs", value: suppliers.reduce((s, sup) => s + sup._count.purchaseOrders, 0), type: "number" },
    ],
    alerts: suppliers.filter(s => Number(s.balanceOwed) > 0).slice(0, 5)
      .map(s => ({ severity: "warning" as const, message: `${s.name} owes ${Number(s.balanceOwed).toFixed(0)}` })),
    related: [{ label: "Purchase Orders", count: suppliers.reduce((s, sup) => s + sup._count.purchaseOrders, 0), model: "PurchaseOrder" }],
  };
}

async function subcontractorInsights(companyId: string): Promise<ModuleInsights> {
  const subs = await prisma.subcontractor.findMany({
    where: { companyId, deletedAt: null },
    select: { id: true, name: true, trade: true, _count: { select: { materialIssues: true, projectCosts: true } } },
  });
  const trades = new Map<string, number>();
  subs.forEach(s => { if (s.trade) trades.set(s.trade, (trades.get(s.trade) ?? 0) + 1); });
  return {
    model: "Subcontractor",
    moduleLabel: "Subcontractor",
    stats: [
      { label: "Total", value: subs.length, type: "number" },
      { label: "Material Issues", value: subs.reduce((s, x) => s + x._count.materialIssues, 0), type: "number" },
      { label: "Project Costs", value: subs.reduce((s, x) => s + x._count.projectCosts, 0), type: "number" },
      ...Array.from(trades.entries()).map(([trade, count]) => ({
        label: trade, value: count, type: "badge" as const,
      })),
    ],
    alerts: [],
    related: [],
  };
}

async function purchaseOrderInsights(companyId: string): Promise<ModuleInsights> {
  const pos = await prisma.purchaseOrder.findMany({
    where: { companyId },
    select: { id: true, poNumber: true, status: true, total: true, expectedDate: true, orderDate: true, _count: { select: { lines: true, goodsReceipts: true } } },
  });
  const statusCounts = new Map<string, number>();
  pos.forEach(p => statusCounts.set(p.status, (statusCounts.get(p.status) ?? 0) + 1));
  const totalValue = pos.reduce((s, p) => s + Number(p.total), 0);
  const overdue = pos.filter(p => p.expectedDate && new Date(p.expectedDate) < new Date() && p.status !== "RECEIVED" && p.status !== "CANCELLED");
  return {
    model: "PurchaseOrder",
    moduleLabel: "Purchase Order",
    stats: [
      { label: "Total POs", value: pos.length, type: "number" },
      { label: "Total Value", value: totalValue, type: "currency" },
      { label: "Overdue", value: overdue.length, type: "number", color: overdue.length > 0 ? "#ef4444" : undefined },
      ...Array.from(statusCounts.entries()).map(([status, count]) => ({
        label: status, value: count, type: "badge" as const,
      })),
    ],
    alerts: overdue.slice(0, 5).map(p => ({
      severity: "danger" as const,
      message: `PO ${p.poNumber} expected ${new Date(p.expectedDate!).toLocaleDateString()} is overdue`,
    })),
    related: [
      { label: "PO Lines", count: pos.reduce((s, p) => s + p._count.lines, 0) },
      { label: "Goods Receipts", count: pos.reduce((s, p) => s + p._count.goodsReceipts, 0), model: "GoodsReceipt" },
    ],
  };
}

async function goodsReceiptInsights(companyId: string): Promise<ModuleInsights> {
  const receipts = await prisma.goodsReceipt.findMany({
    where: { location: { companyId } },
    select: { id: true, inspectionStatus: true, receiptDate: true, _count: { select: { lines: true } } },
  });
  const inspectionCounts = new Map<string, number>();
  receipts.forEach(r => inspectionCounts.set(r.inspectionStatus, (inspectionCounts.get(r.inspectionStatus) ?? 0) + 1));
  const pending = receipts.filter(r => r.inspectionStatus === "PENDING");
  return {
    model: "GoodsReceipt",
    moduleLabel: "Goods Receipt",
    stats: [
      { label: "Total Receipts", value: receipts.length, type: "number" },
      { label: "Pending Inspection", value: pending.length, type: "number", color: pending.length > 0 ? "#f59e0b" : undefined },
      ...Array.from(inspectionCounts.entries()).map(([status, count]) => ({
        label: status, value: count, type: "badge" as const,
      })),
    ],
    alerts: pending.slice(0, 3).map(r => ({ severity: "warning" as const, message: `Receipt ${r.id.slice(-6)} pending inspection` })),
    related: [],
  };
}

async function requisitionInsights(companyId: string): Promise<ModuleInsights> {
  const reqs = await prisma.materialRequisition.findMany({
    where: { project: { companyId } },
    select: { id: true, reqNumber: true, status: true, neededByDate: true, _count: { select: { lines: true } } },
  });
  const statusCounts = new Map<string, number>();
  reqs.forEach(r => statusCounts.set(r.status, (statusCounts.get(r.status) ?? 0) + 1));
  const overdue = reqs.filter(r => r.neededByDate && new Date(r.neededByDate) < new Date() && r.status === "APPROVED");
  return {
    model: "MaterialRequisition",
    moduleLabel: "Material Requisition",
    stats: [
      { label: "Total Requisitions", value: reqs.length, type: "number" },
      { label: "Overdue Need-By", value: overdue.length, type: "number", color: overdue.length > 0 ? "#ef4444" : undefined },
      ...Array.from(statusCounts.entries()).map(([status, count]) => ({
        label: status, value: count, type: "badge" as const,
      })),
    ],
    alerts: overdue.slice(0, 3).map(r => ({ severity: "warning" as const, message: `Requisition ${r.reqNumber} needed by ${new Date(r.neededByDate!).toLocaleDateString()}` })),
    related: [],
  };
}

async function stockMovementInsights(companyId: string): Promise<ModuleInsights> {
  const movements = await prisma.stockMovement.findMany({
    where: { toLocation: { companyId } },
    select: { id: true, movementType: true, qty: true, unitCost: true, timestamp: true },
    orderBy: { timestamp: "desc" },
    take: 500,
  });
  const typeCounts = new Map<string, number>();
  movements.forEach(m => typeCounts.set(m.movementType, (typeCounts.get(m.movementType) ?? 0) + 1));
  const totalValue = movements.reduce((s, m) => s + Number(m.qty) * Number(m.unitCost), 0);
  // Last 7 days timeline
  const timeline: { date: string; label: string; value: number }[] = [];
  for (let i = 6; i >= 0; i--) {
    const day = new Date(); day.setHours(0, 0, 0, 0); day.setDate(day.getDate() - i);
    const next = new Date(day); next.setDate(next.getDate() + 1);
    const count = movements.filter(m => new Date(m.timestamp) >= day && new Date(m.timestamp) < next).length;
    timeline.push({ date: day.toISOString(), label: day.toLocaleDateString("en", { weekday: "short" }), value: count });
  }
  return {
    model: "StockMovement",
    moduleLabel: "Stock Movement",
    stats: [
      { label: "Total Movements", value: movements.length, type: "number" },
      { label: "Total Value", value: totalValue, type: "currency" },
      ...Array.from(typeCounts.entries()).map(([type, count]) => ({
        label: type.replace(/_/g, " "), value: count, type: "badge" as const,
      })),
    ],
    alerts: [],
    related: [],
    timeline,
  };
}

async function stockLocationItemInsights(companyId: string): Promise<ModuleInsights> {
  const [items, inventoryValue] = await Promise.all([
    prisma.stockLocationItem.findMany({
      where: { location: { companyId, deletedAt: null }, material: { deletedAt: null } },
      select: { qty: true, location: { select: { name: true } }, material: { select: { name: true, code: true, unit: true } } },
    }),
    // Use shared service for inventory value — consistent with dashboard
    materialInventoryValue(companyId),
  ]);
  const zeroStock = items.filter(i => Number(i.qty) === 0).length;
  return {
    model: "StockLocationItem",
    moduleLabel: "Stock Item",
    stats: [
      { label: "Total Items", value: items.length, type: "number" },
      { label: "Inventory Value", value: Number(inventoryValue.toString()), type: "currency" },
      { label: "Zero Stock", value: zeroStock, type: "number", color: zeroStock > 0 ? "#f59e0b" : undefined },
    ],
    alerts: [],
    related: [],
  };
}

async function materialIssueInsights(companyId: string): Promise<ModuleInsights> {
  const issues = await prisma.materialIssue.findMany({
    where: { project: { companyId } },
    select: { id: true, issueDate: true, totalCost: true, _count: { select: { lines: true } } },
    orderBy: { issueDate: "desc" },
    take: 500,
  });
  const totalCost = issues.reduce((s, i) => s + Number(i.totalCost), 0);
  const timeline: { date: string; label: string; value: number }[] = [];
  for (let i = 6; i >= 0; i--) {
    const day = new Date(); day.setHours(0, 0, 0, 0); day.setDate(day.getDate() - i);
    const next = new Date(day); next.setDate(next.getDate() + 1);
    const dayIssues = issues.filter(x => new Date(x.issueDate) >= day && new Date(x.issueDate) < next);
    timeline.push({ date: day.toISOString(), label: day.toLocaleDateString("en", { weekday: "short" }), value: dayIssues.reduce((s, x) => s + Number(x.totalCost), 0) });
  }
  return {
    model: "MaterialIssue",
    moduleLabel: "Material Issue",
    stats: [
      { label: "Total Issues", value: issues.length, type: "number" },
      { label: "Total Cost", value: totalCost, type: "currency" },
      { label: "Issue Lines", value: issues.reduce((s, i) => s + i._count.lines, 0), type: "number" },
    ],
    alerts: [],
    related: [],
    timeline,
  };
}

async function stockTransferInsights(_companyId: string): Promise<ModuleInsights> {
  const transfers = await prisma.stockTransfer.findMany({
    select: { id: true, status: true, _count: { select: { lines: true } } },
  });
  const statusCounts = new Map<string, number>();
  transfers.forEach(t => statusCounts.set(t.status, (statusCounts.get(t.status) ?? 0) + 1));
  return {
    model: "StockTransfer",
    moduleLabel: "Stock Transfer",
    stats: [
      { label: "Total Transfers", value: transfers.length, type: "number" },
      { label: "Transfer Lines", value: transfers.reduce((s, t) => s + t._count.lines, 0), type: "number" },
      ...Array.from(statusCounts.entries()).map(([status, count]) => ({
        label: status, value: count, type: "badge" as const,
      })),
    ],
    alerts: transfers.filter(t => t.status === "IN_TRANSIT").slice(0, 3)
      .map(t => ({ severity: "info" as const, message: `Transfer ${t.id.slice(-6)} in transit` })),
    related: [],
  };
}

async function stockCountInsights(companyId: string): Promise<ModuleInsights> {
  const counts = await prisma.stockCount.findMany({
    where: { location: { companyId } },
    select: { id: true, status: true, countDate: true, _count: { select: { lines: true } } },
  });
  const statusCounts = new Map<string, number>();
  counts.forEach(c => statusCounts.set(c.status, (statusCounts.get(c.status) ?? 0) + 1));
  const drafts = counts.filter(c => c.status === "DRAFT");
  return {
    model: "StockCount",
    moduleLabel: "Stock Count",
    stats: [
      { label: "Total Counts", value: counts.length, type: "number" },
      { label: "Draft", value: drafts.length, type: "number", color: drafts.length > 0 ? "#f59e0b" : undefined },
      ...Array.from(statusCounts.entries()).map(([status, count]) => ({
        label: status, value: count, type: "badge" as const,
      })),
    ],
    alerts: drafts.slice(0, 3).map(c => ({ severity: "info" as const, message: `Stock count ${c.id.slice(-6)} is in draft` })),
    related: [],
  };
}

async function equipmentInsights(companyId: string): Promise<ModuleInsights> {
  const equipment = await prisma.equipment.findMany({
    where: { companyId, deletedAt: null },
    select: { id: true, name: true, status: true, acquisitionCost: true, currentValue: true, _count: { select: { assignments: true, maintenance: true } } },
  });
  const statusCounts = new Map<string, number>();
  equipment.forEach(e => statusCounts.set(e.status, (statusCounts.get(e.status) ?? 0) + 1));
  const totalValue = equipment.reduce((s, e) => s + Number(e.currentValue), 0);
  const inMaintenance = equipment.filter(e => e.status === "IN_MAINTENANCE");
  return {
    model: "Equipment",
    moduleLabel: "Equipment",
    stats: [
      { label: "Total Equipment", value: equipment.length, type: "number" },
      { label: "Total Value", value: totalValue, type: "currency" },
      { label: "In Maintenance", value: inMaintenance.length, type: "number", color: inMaintenance.length > 0 ? "#f59e0b" : undefined },
      ...Array.from(statusCounts.entries()).map(([status, count]) => ({
        label: status, value: count, type: "badge" as const,
      })),
    ],
    alerts: inMaintenance.slice(0, 3).map(e => ({ severity: "warning" as const, message: `${e.name} is in maintenance` })),
    related: [
      { label: "Assignments", count: equipment.reduce((s, e) => s + e._count.assignments, 0), model: "EquipmentAssignment" },
      { label: "Maintenance Records", count: equipment.reduce((s, e) => s + e._count.maintenance, 0), model: "EquipmentMaintenance" },
    ],
  };
}

async function equipmentAssignmentInsights(_companyId: string): Promise<ModuleInsights> {
  const assignments = await prisma.equipmentAssignment.findMany({
    select: { id: true, status: true, assignedAt: true, returnedAt: true },
  });
  const active = assignments.filter(a => a.status === "ACTIVE");
  return {
    model: "EquipmentAssignment",
    moduleLabel: "Equipment Assignment",
    stats: [
      { label: "Total Assignments", value: assignments.length, type: "number" },
      { label: "Active", value: active.length, type: "number" },
      { label: "Returned", value: assignments.length - active.length, type: "number" },
    ],
    alerts: [],
    related: [],
  };
}

async function equipmentMaintenanceInsights(_companyId: string): Promise<ModuleInsights> {
  const records = await prisma.equipmentMaintenance.findMany({
    select: { id: true, type: true, startDate: true, endDate: true, cost: true },
  });
  const typeCounts = new Map<string, number>();
  records.forEach(r => typeCounts.set(r.type, (typeCounts.get(r.type) ?? 0) + 1));
  const ongoing = records.filter(r => !r.endDate);
  const totalCost = records.reduce((s, r) => s + Number(r.cost), 0);
  return {
    model: "EquipmentMaintenance",
    moduleLabel: "Equipment Maintenance",
    stats: [
      { label: "Total Records", value: records.length, type: "number" },
      { label: "Total Cost", value: totalCost, type: "currency" },
      { label: "Ongoing", value: ongoing.length, type: "number", color: ongoing.length > 0 ? "#f59e0b" : undefined },
      ...Array.from(typeCounts.entries()).map(([type, count]) => ({
        label: type, value: count, type: "badge" as const,
      })),
    ],
    alerts: ongoing.slice(0, 3).map(r => ({ severity: "info" as const, message: `${r.type} maintenance ongoing since ${new Date(r.startDate).toLocaleDateString()}` })),
    related: [],
  };
}

async function landPurchaseInsights(companyId: string): Promise<ModuleInsights> {
  const purchases = await prisma.landPurchase.findMany({
    where: { companyId, deletedAt: null },
    select: { id: true, sellerName: true, totalArea: true, totalCost: true, _count: { select: { parcels: true } } },
  });
  const totalCost = purchases.reduce((s, p) => s + Number(p.totalCost), 0);
  const totalArea = purchases.reduce((s, p) => s + Number(p.totalArea), 0);
  return {
    model: "LandPurchase",
    moduleLabel: "Land Purchase",
    stats: [
      { label: "Total Purchases", value: purchases.length, type: "number" },
      { label: "Total Area", value: totalArea.toLocaleString() + " Sq.Ft", type: "number" },
      { label: "Total Cost", value: totalCost, type: "currency" },
      { label: "Total Parcels", value: purchases.reduce((s, p) => s + p._count.parcels, 0), type: "number" },
    ],
    alerts: [],
    related: [{ label: "Land Parcels", count: purchases.reduce((s, p) => s + p._count.parcels, 0), model: "LandParcel" }],
  };
}

async function landParcelInsights(companyId: string): Promise<ModuleInsights> {
  const [parcels, unsoldAssets] = await Promise.all([
    // LandParcel has no companyId — scope via the parent LandPurchase.companyId.
    prisma.landParcel.findMany({
      where: { deletedAt: null, landPurchase: { companyId } },
      select: { id: true, status: true, area: true, currentValuation: true, askingPrice: true },
    }),
    // Use shared service for unsold value — consistent with dashboard
    unsoldAssetValue(companyId),
  ]);
  const statusCounts = new Map<string, number>();
  parcels.forEach(p => statusCounts.set(p.status, (statusCounts.get(p.status) ?? 0) + 1));
  return {
    model: "LandParcel",
    moduleLabel: "Land Parcel",
    stats: [
      { label: "Total Parcels", value: parcels.length, type: "number" },
      { label: "Unsold Land Value", value: Number(unsoldAssets.land.toString()), type: "currency" },
      { label: "Available", value: (statusCounts.get("AVAILABLE") ?? 0), type: "number" },
      { label: "Sold", value: (statusCounts.get("SOLD") ?? 0), type: "number" },
      ...Array.from(statusCounts.entries()).map(([status, count]) => ({
        label: status, value: count, type: "badge" as const,
      })),
    ],
    alerts: [],
    related: [],
  };
}

async function builtUnitInsights(companyId: string): Promise<ModuleInsights> {
  const [units, unsoldAssets] = await Promise.all([
    prisma.builtUnit.findMany({
      where: { project: { companyId }, deletedAt: null },
      select: { id: true, status: true, unitType: true, area: true, productionCost: true, currentValuation: true, askingPrice: true },
    }),
    // Use shared service for unsold value — consistent with dashboard
    unsoldAssetValue(companyId),
  ]);
  const statusCounts = new Map<string, number>();
  const typeCounts = new Map<string, number>();
  units.forEach(u => {
    statusCounts.set(u.status, (statusCounts.get(u.status) ?? 0) + 1);
    typeCounts.set(u.unitType, (typeCounts.get(u.unitType) ?? 0) + 1);
  });
  const totalArea = units.reduce((s, u) => s + Number(u.area), 0);
  return {
    model: "BuiltUnit",
    moduleLabel: "Built Unit",
    stats: [
      { label: "Total Units", value: units.length, type: "number" },
      { label: "Total Area", value: totalArea.toLocaleString() + " Sq.Ft", type: "number" },
      { label: "Unsold Unit Value", value: Number(unsoldAssets.builtUnits.toString()), type: "currency" },
      { label: "Sold", value: (statusCounts.get("SOLD") ?? 0), type: "number" },
      ...Array.from(typeCounts.entries()).map(([type, count]) => ({
        label: type.replace(/_/g, " "), value: count, type: "badge" as const,
      })),
    ],
    alerts: [],
    related: [],
  };
}

async function customerInsights(companyId: string): Promise<ModuleInsights> {
  const customers = await prisma.customer.findMany({
    where: { companyId, deletedAt: null },
    select: { id: true, name: true, _count: { select: { assetSales: { where: { companyId } } } } },
  });
  const [totalSales, totalSaleValue] = await Promise.all([
    prisma.assetSale.count({ where: { companyId } }),
    prisma.assetSale.aggregate({ where: { companyId }, _sum: { salePrice: true } }),
  ]);
  return {
    model: "Customer",
    moduleLabel: "Customer",
    stats: [
      { label: "Total Customers", value: customers.length, type: "number" },
      { label: "Total Sales", value: totalSales, type: "number" },
      { label: "Total Sale Value", value: Number(totalSaleValue._sum.salePrice ?? 0), type: "currency" },
    ],
    alerts: [],
    related: [{ label: "Asset Sales", count: totalSales, model: "AssetSale" }],
  };
}

async function assetSaleInsights(companyId: string): Promise<ModuleInsights> {
  const sales = await prisma.assetSale.findMany({
    where: { companyId },
    select: { id: true, saleNumber: true, assetType: true, salePrice: true, profit: true, status: true, paymentStatus: true },
  });
  const statusCounts = new Map<string, number>();
  const payCounts = new Map<string, number>();
  sales.forEach(s => {
    statusCounts.set(s.status, (statusCounts.get(s.status) ?? 0) + 1);
    payCounts.set(s.paymentStatus, (payCounts.get(s.paymentStatus) ?? 0) + 1);
  });
  const totalRevenue = sales.reduce((s, x) => s + Number(x.salePrice), 0);
  const totalProfit = sales.reduce((s, x) => s + Number(x.profit), 0);
  const pending = sales.filter(s => s.paymentStatus === "PENDING" || s.paymentStatus === "PARTIAL");
  return {
    model: "AssetSale",
    moduleLabel: "Asset Sale",
    stats: [
      { label: "Total Sales", value: sales.length, type: "number" },
      { label: "Total Revenue", value: totalRevenue, type: "currency" },
      { label: "Total Profit", value: totalProfit, type: "currency", color: totalProfit >= 0 ? "#16a34a" : "#ef4444" },
      { label: "Pending Payment", value: pending.length, type: "number", color: pending.length > 0 ? "#f59e0b" : undefined },
      ...Array.from(payCounts.entries()).map(([status, count]) => ({
        label: status, value: count, type: "badge" as const,
      })),
    ],
    alerts: pending.slice(0, 3).map(s => ({ severity: "warning" as const, message: `Sale ${s.saleNumber} payment ${s.paymentStatus.toLowerCase()}` })),
    related: [{ label: "Payments", count: sales.length, model: "AssetSalePayment" }],
  };
}

async function assetSalePaymentInsights(_companyId: string): Promise<ModuleInsights> {
  const payments = await prisma.assetSalePayment.findMany({
    select: { id: true, amount: true, paymentDate: true, mode: true, status: true },
  });
  const totalAmount = payments.reduce((s, p) => s + Number(p.amount), 0);
  const modeCounts = new Map<string, number>();
  payments.forEach(p => modeCounts.set(p.mode, (modeCounts.get(p.mode) ?? 0) + 1));
  return {
    model: "AssetSalePayment",
    moduleLabel: "Sale Payment",
    stats: [
      { label: "Total Payments", value: payments.length, type: "number" },
      { label: "Total Amount", value: totalAmount, type: "currency" },
      ...Array.from(modeCounts.entries()).map(([mode, count]) => ({
        label: mode, value: count, type: "badge" as const,
      })),
    ],
    alerts: [],
    related: [],
  };
}

async function expenseInsights(companyId: string): Promise<ModuleInsights> {
  const expenses = await prisma.expense.findMany({
    where: { companyId },
    select: { id: true, category: true, amount: true, date: true },
  });
  const totalAmount = expenses.reduce((s, e) => s + Number(e.amount), 0);
  const categoryCounts = new Map<string, number>();
  expenses.forEach(e => categoryCounts.set(e.category, (categoryCounts.get(e.category) ?? 0) + 1));
  return {
    model: "Expense",
    moduleLabel: "Expense",
    stats: [
      { label: "Total Expenses", value: expenses.length, type: "number" },
      { label: "Total Amount", value: totalAmount, type: "currency" },
      ...Array.from(categoryCounts.entries()).map(([cat, count]) => ({
        label: cat, value: count, type: "badge" as const,
      })),
    ],
    alerts: [],
    related: [],
  };
}

async function projectCostInsights(companyId: string): Promise<ModuleInsights> {
  const costs = await prisma.projectCost.findMany({
    where: { project: { companyId } },
    select: { id: true, costType: true, amount: true, date: true },
  });
  const totalAmount = costs.reduce((s, c) => s + Number(c.amount), 0);
  const typeCounts = new Map<string, number>();
  costs.forEach(c => typeCounts.set(c.costType, (typeCounts.get(c.costType) ?? 0) + 1));
  return {
    model: "ProjectCost",
    moduleLabel: "Project Cost",
    stats: [
      { label: "Total Costs", value: costs.length, type: "number" },
      { label: "Total Amount", value: totalAmount, type: "currency" },
      ...Array.from(typeCounts.entries()).map(([type, count]) => ({
        label: type, value: count, type: "badge" as const,
      })),
    ],
    alerts: [],
    related: [],
  };
}

async function supplierReturnInsights(companyId: string): Promise<ModuleInsights> {
  const returns = await prisma.supplierReturn.findMany({
    where: { companyId },
    select: { id: true, returnNumber: true, status: true, returnDate: true, _count: { select: { lines: true } } },
  });
  const statusCounts = new Map<string, number>();
  returns.forEach(r => statusCounts.set(r.status, (statusCounts.get(r.status) ?? 0) + 1));
  return {
    model: "SupplierReturn",
    moduleLabel: "Supplier Return",
    stats: [
      { label: "Total Returns", value: returns.length, type: "number" },
      { label: "Return Lines", value: returns.reduce((s, r) => s + r._count.lines, 0), type: "number" },
      ...Array.from(statusCounts.entries()).map(([status, count]) => ({
        label: status, value: count, type: "badge" as const,
      })),
    ],
    alerts: returns.filter(r => r.status === "DRAFT").slice(0, 3)
      .map(r => ({ severity: "info" as const, message: `Return ${r.returnNumber} is in draft` })),
    related: [],
  };
}

async function auditLogInsights(_companyId: string): Promise<ModuleInsights> {
  const total = await prisma.auditLog.count();
  const recent = await prisma.auditLog.findMany({
    select: { id: true, action: true, entityType: true, timestamp: true },
    orderBy: { timestamp: "desc" },
    take: 100,
  });
  const actionCounts = new Map<string, number>();
  recent.forEach(a => actionCounts.set(a.action, (actionCounts.get(a.action) ?? 0) + 1));
  return {
    model: "AuditLog",
    moduleLabel: "Audit Log",
    stats: [
      { label: "Total Logs", value: total, type: "number" },
      { label: "Recent (100)", value: recent.length, type: "number" },
      ...Array.from(actionCounts.entries()).map(([action, count]) => ({
        label: action, value: count, type: "badge" as const,
      })),
    ],
    alerts: [],
    related: [],
  };
}

async function userInsights(_companyId: string): Promise<ModuleInsights> {
  const users = await prisma.user.findMany({ select: { id: true, name: true, role: true, active: true } });
  const roleCounts = new Map<string, number>();
  users.forEach(u => roleCounts.set(u.role, (roleCounts.get(u.role) ?? 0) + 1));
  return {
    model: "User",
    moduleLabel: "User",
    stats: [
      { label: "Total Users", value: users.length, type: "number" },
      { label: "Active", value: users.filter(u => u.active).length, type: "number" },
      ...Array.from(roleCounts.entries()).map(([role, count]) => ({
        label: role, value: count, type: "badge" as const,
      })),
    ],
    alerts: [],
    related: [],
  };
}
