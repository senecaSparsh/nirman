import { NextRequest } from "next/server";
import { prisma, type StockMovementType } from "@nirman/db";
import {
  generateExcelWorkbook,
  buildInventoryValueReport,
  buildPurchaseTrendsReport,
  buildSalesRevenueReport,
  buildProjectProgressReport,
  buildPayrollExpenseReport,
  buildPendingPaymentsReport,
  buildTrialBalanceReport,
  buildStockMovementReport,
  buildPurchaserPerformanceReport,
  buildReconciliationReport,
  buildStockIssueSummaryReport,
  buildStockMovementSummaryReport,
  buildIssueRegisterReport,
  buildPurchaseRegisterReport,
  trialBalance,
  getPurchaserPerformance,
  getProjectMaterialReconciliation,
  projectPnl,
} from "@nirman/services";
import { PERM, hasPermission } from "@/lib/roles";
import { apiHandler, getCompany, json, toNum, requireUser, getUserRole } from "@/lib/server";

/**
 * GET /api/export?type=<report>&format=xlsx|csv
 *
 * Generates a downloadable Excel (xlsx) or CSV file for the requested report.
 * Supported types:
 *   inventory-value, purchase-trends, sales-revenue, project-progress,
 *   payroll-expense, pending-payments, trial-balance, stock-movements,
 *   purchaser-performance, reconciliation
 *
 * Date range params `from`/`to` apply where relevant.
 * For `reconciliation`, `projectId` is required.
 * For `inventory-value`, `asOn` is optional (YYYY-MM-DD).
 */
export const GET = apiHandler(async (req: NextRequest) => {
  const user = await requireUser();
  const role = await getUserRole();
  const company = await getCompany();
  const { searchParams } = new URL(req.url);
  const type = searchParams.get("type") ?? "";
  const format = searchParams.get("format") ?? "xlsx";
  const from = searchParams.get("from");
  const to = searchParams.get("to");
  const asOn = searchParams.get("asOn");
  const projectId = searchParams.get("projectId");

  // ── Permission check per report type ──
  const PERM_MAP: Record<string, string> = {
    "inventory-value": PERM.INVENTORY_VIEW,
    "purchase-trends": PERM.FINANCE_VIEW,
    "sales-revenue": PERM.FINANCE_VIEW,
    "project-progress": PERM.FINANCE_VIEW,
    "payroll-expense": PERM.FINANCE_VIEW,
    "pending-payments": PERM.FINANCE_VIEW,
    "trial-balance": PERM.FINANCE_VIEW,
    "stock-movements": PERM.INVENTORY_VIEW,
    "purchaser-performance": PERM.PROCUREMENT_VIEW,
    "reconciliation": PERM.ASSETS_VIEW,
    "stock-issue-summary": PERM.INVENTORY_VIEW,
    "stock-movement-summary": PERM.INVENTORY_VIEW,
    "issue-register": PERM.INVENTORY_VIEW,
    "purchase-register": PERM.PROCUREMENT_VIEW,
  };

  const requiredPerm = PERM_MAP[type];
  if (!requiredPerm) {
    return json({ error: `Unknown export type: ${type}` }, { status: 400 });
  }
  if (!hasPermission(role, requiredPerm)) {
    return json({ error: "Forbidden" }, { status: 403 });
  }

  // Build date range
  const now = new Date();
  const fyStart = new Date(now.getFullYear() - (now.getMonth() < 3 ? 1 : 0), 3, 1);
  const fromDate = from ? new Date(from) : fyStart;
  const toDate = to ? new Date(to) : now;
  toDate.setHours(23, 59, 59, 999);

  const filenameBase = `${type}-${new Date().toISOString().slice(0, 10)}`;
  const companyName = company.name;

  // ── Fetch data and build sheets per type ──
  let sheets: Awaited<ReturnType<typeof buildInventoryValueReport>> = [];
  let title = "";

  switch (type) {
    case "inventory-value": {
      title = "Inventory Valuation Report";
      const asOnDate = asOn ? new Date(asOn) : null;
      if (asOnDate) asOnDate.setHours(23, 59, 59, 999);
      const isHistorical = asOnDate !== null;

      type ItemRow = {
        locationId: string; locationName: string; locationType: string;
        materialId: string; materialCode: string; materialName: string;
        materialUnit: string; categoryId: string; categoryName: string;
        qty: number; value: number;
      };
      let items: ItemRow[] = [];

      if (!isHistorical) {
        const liveItems = await prisma.stockLocationItem.findMany({
          where: {
            location: { deletedAt: null, companyId: company.id },
            material: { deletedAt: null },
          },
          include: {
            location: { select: { id: true, name: true, type: true } },
            material: {
              select: { id: true, code: true, name: true, unit: true, category: { select: { id: true, name: true } } },
            },
          },
        });
        items = liveItems.map((item) => ({
          locationId: item.location.id, locationName: item.location.name, locationType: item.location.type,
          materialId: item.material.id, materialCode: item.material.code, materialName: item.material.name,
          materialUnit: item.material.unit, categoryId: item.material.category.id, categoryName: item.material.category.name,
          qty: toNum(item.qty), value: toNum(item.qty) * toNum(item.movingAvgCost),
        }));
      } else {
        const IN_TYPES: StockMovementType[] = ["PURCHASE_RECEIPT", "TRANSFER_IN", "ADJUSTMENT_IN"];
        const OUT_TYPES: StockMovementType[] = ["TRANSFER_OUT", "ISSUE_TO_PROJECT", "ISSUE_TO_DEPARTMENT", "ADJUSTMENT_OUT", "RETURN", "SALE"];
        const [inMovements, outMovements, locations, materials] = await Promise.all([
          prisma.stockMovement.findMany({
            where: { movementType: { in: IN_TYPES }, toLocation: { companyId: company.id, deletedAt: null }, timestamp: { lte: asOnDate! } },
            include: { material: { select: { id: true, code: true, name: true, unit: true, category: { select: { id: true, name: true } } } }, toLocation: { select: { id: true, name: true, type: true } } },
            orderBy: { timestamp: "desc" },
          }),
          prisma.stockMovement.findMany({
            where: { movementType: { in: OUT_TYPES }, fromLocation: { companyId: company.id, deletedAt: null }, timestamp: { lte: asOnDate! } },
            include: { material: { select: { id: true, code: true, name: true, unit: true, category: { select: { id: true, name: true } } } }, fromLocation: { select: { id: true, name: true, type: true } } },
            orderBy: { timestamp: "desc" },
          }),
          prisma.stockLocation.findMany({ where: { companyId: company.id, deletedAt: null }, select: { id: true, name: true, type: true } }),
          prisma.material.findMany({ where: { deletedAt: null }, select: { id: true, code: true, name: true, unit: true, category: { select: { id: true, name: true } } } }),
        ]);
        const lastBalance = new Map<string, { qty: number; value: number }>();
        for (const m of inMovements) {
          const key = `${m.materialId}:${m.toLocationId}`;
          if (!lastBalance.has(key)) lastBalance.set(key, { qty: toNum(m.balanceAfter), value: toNum(m.balanceValueAfter) });
        }
        for (const m of outMovements) {
          const key = `${m.materialId}:${m.fromLocationId}`;
          if (!lastBalance.has(key)) lastBalance.set(key, { qty: toNum(m.balanceAfter), value: toNum(m.balanceValueAfter) });
        }
        const locMap = new Map(locations.map((l) => [l.id, l]));
        const matMap = new Map(materials.map((m) => [m.id, m]));
        for (const [key, bal] of lastBalance) {
          if (bal.qty <= 0 && bal.value <= 0) continue;
          const parts = key.split(":");
          const matId = parts[0]!; const locId = parts[1]!;
          const loc = locMap.get(locId); const mat = matMap.get(matId);
          if (!loc || !mat) continue;
          items.push({ locationId: loc.id, locationName: loc.name, locationType: loc.type, materialId: mat.id, materialCode: mat.code, materialName: mat.name, materialUnit: mat.unit, categoryId: mat.category.id, categoryName: mat.category.name, qty: bal.qty, value: bal.value });
        }
      }

      const byLocation = new Map<string, { name: string; type: string; value: number; qty: number }>();
      const byCategory = new Map<string, { name: string; value: number; qty: number }>();
      let grandTotal = 0; let totalQty = 0;
      for (const item of items) {
        grandTotal += item.value; totalQty += item.qty;
        if (!byLocation.has(item.locationId)) byLocation.set(item.locationId, { name: item.locationName, type: item.locationType, value: 0, qty: 0 });
        byLocation.get(item.locationId)!.value += item.value; byLocation.get(item.locationId)!.qty += item.qty;
        if (!byCategory.has(item.categoryId)) byCategory.set(item.categoryId, { name: item.categoryName, value: 0, qty: 0 });
        byCategory.get(item.categoryId)!.value += item.value; byCategory.get(item.categoryId)!.qty += item.qty;
      }

      sheets = buildInventoryValueReport({
        asOn: asOn ?? "Live",
        items: items.map((i) => ({ locationName: i.locationName, materialCode: i.materialCode, materialName: i.materialName, categoryName: i.categoryName, unit: i.materialUnit, qty: i.qty, value: i.value })),
        byLocation: Array.from(byLocation.values()).sort((a, b) => b.value - a.value),
        byCategory: Array.from(byCategory.values()).sort((a, b) => b.value - a.value),
        grandTotal, totalQty,
      });
      break;
    }

    case "purchase-trends": {
      title = "Purchase Trends Report";
      const from12 = new Date(now.getFullYear(), now.getMonth() - 11, 1);
      const orders = await prisma.purchaseOrder.findMany({
        where: { companyId: company.id, status: { not: "CANCELLED" }, orderDate: { gte: from12 } },
        select: { id: true, poNumber: true, orderDate: true, status: true, total: true, subtotal: true, gstTotal: true, supplier: { select: { name: true } } },
        orderBy: { orderDate: "asc" },
      });
      const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
      const monthlyMap = new Map<string, { label: string; subtotal: number; gst: number; total: number; count: number }>();
      for (let i = 11; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const key = `${d.getFullYear()}-${d.getMonth()}`;
        monthlyMap.set(key, { label: `${MONTHS[d.getMonth()]} ${String(d.getFullYear()).slice(2)}`, subtotal: 0, gst: 0, total: 0, count: 0 });
      }
      for (const o of orders) {
        const key = `${o.orderDate.getFullYear()}-${o.orderDate.getMonth()}`;
        const row = monthlyMap.get(key);
        if (!row) continue;
        row.subtotal += toNum(o.subtotal); row.gst += toNum(o.gstTotal); row.total += toNum(o.total); row.count += 1;
      }
      const monthly = Array.from(monthlyMap.values());
      const supplierMap = new Map<string, { name: string; total: number; count: number }>();
      for (const o of orders) {
        const name = o.supplier.name;
        if (!supplierMap.has(name)) supplierMap.set(name, { name, total: 0, count: 0 });
        supplierMap.get(name)!.total += toNum(o.total); supplierMap.get(name)!.count += 1;
      }
      const topSuppliers = Array.from(supplierMap.values()).sort((a, b) => b.total - a.total).slice(0, 10);
      const grandTotal = monthly.reduce((s, m) => s + m.total, 0);
      const totalOrders = monthly.reduce((s, m) => s + m.count, 0);
      sheets = buildPurchaseTrendsReport({ monthly, topSuppliers, grandTotal, totalOrders });
      break;
    }

    case "sales-revenue": {
      title = "Sales & Revenue Report";
      const from12 = new Date(now.getFullYear(), now.getMonth() - 11, 1);
      const sales = await prisma.assetSale.findMany({
        where: { companyId: company.id, status: "ACTIVE", saleDate: { gte: from12 } },
        include: { customer: { select: { name: true } }, project: { select: { name: true } }, payments: { select: { amount: true, paymentDate: true } } },
        orderBy: { saleDate: "asc" },
      });
      const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
      const monthlyMap = new Map<string, { label: string; sales: number; collected: number; count: number }>();
      for (let i = 11; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const key = `${d.getFullYear()}-${d.getMonth()}`;
        monthlyMap.set(key, { label: `${MONTHS[d.getMonth()]} ${String(d.getFullYear()).slice(2)}`, sales: 0, collected: 0, count: 0 });
      }
      let totalSales = 0; let totalCollected = 0; let totalOutstanding = 0;
      for (const s of sales) {
        totalSales += toNum(s.salePrice);
        const collected = s.payments.reduce((sum, p) => sum + toNum(p.amount), 0);
        totalCollected += collected;
        totalOutstanding += toNum(s.salePrice) - collected;
        const key = `${s.saleDate.getFullYear()}-${s.saleDate.getMonth()}`;
        const row = monthlyMap.get(key);
        if (row) { row.sales += toNum(s.salePrice); row.count += 1; }
        for (const p of s.payments) {
          const pkey = `${p.paymentDate.getFullYear()}-${p.paymentDate.getMonth()}`;
          const prow = monthlyMap.get(pkey);
          if (prow) prow.collected += toNum(p.amount);
        }
      }
      const monthly = Array.from(monthlyMap.values());
      const customerMap = new Map<string, { name: string; sales: number; collected: number; count: number }>();
      for (const s of sales) {
        const name = s.customer.name;
        if (!customerMap.has(name)) customerMap.set(name, { name, sales: 0, collected: 0, count: 0 });
        const row = customerMap.get(name)!;
        row.sales += toNum(s.salePrice);
        row.collected += s.payments.reduce((sum, p) => sum + toNum(p.amount), 0);
        row.count += 1;
      }
      const topCustomers = Array.from(customerMap.values()).sort((a, b) => b.sales - a.sales).slice(0, 10);
      sheets = buildSalesRevenueReport({ monthly, topCustomers, totalSales, totalCollected, totalOutstanding });
      break;
    }

    case "project-progress": {
      title = "Project Progress Report";
      const projects = await prisma.project.findMany({
        where: { companyId: company.id, deletedAt: null },
        select: { id: true, name: true, type: true, status: true, totalBudget: true, totalProjectCost: true, costPerSqft: true, totalSellableArea: true, phases: { select: { id: true, name: true, status: true } }, _count: { select: { builtUnits: true } } },
        orderBy: { name: "asc" },
      });
      const latestDprs = await prisma.dailyProgressReport.findMany({
        where: { companyId: company.id }, orderBy: { date: "desc" }, distinct: ["projectId"],
        select: { projectId: true, progressPct: true, date: true },
      });
      const progressByProject = new Map(latestDprs.map((d) => [d.projectId, { progressPct: toNum(d.progressPct), date: d.date.toISOString() }]));
      const rows = await Promise.all(projects.map(async (p) => {
        const pnl = await projectPnl(p.id);
        const prog = progressByProject.get(p.id);
        return { name: p.name, type: p.type, status: p.status, budget: toNum(p.totalBudget), totalCost: toNum(pnl.total), materials: toNum(pnl.materials), labour: toNum(pnl.labour), land: toNum(pnl.land), revenue: toNum(pnl.revenue), profit: toNum(pnl.profit), margin: toNum(pnl.margin), progressPct: prog?.progressPct ?? 0, unitCount: p._count.builtUnits, phaseCount: p.phases.length };
      }));
      const totalCost = rows.reduce((s, r) => s + r.totalCost, 0);
      const totalRevenue = rows.reduce((s, r) => s + r.revenue, 0);
      const totalProfit = rows.reduce((s, r) => s + r.profit, 0);
      sheets = buildProjectProgressReport({ rows, totalCost, totalRevenue, totalProfit });
      break;
    }

    case "payroll-expense": {
      title = "Payroll Expense Report";
      const from12 = new Date(now.getFullYear(), now.getMonth() - 11, 1);
      const periods = await prisma.payrollPeriod.findMany({
        where: { companyId: company.id, startDate: { gte: from12 } },
        include: { lines: { include: { employee: { select: { id: true, name: true, trade: true, crewId: true, crew: { select: { name: true } } } } } } },
        orderBy: [{ year: "asc" }, { month: "asc" }],
      });
      const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
      const monthly = periods.map((p) => ({ label: `${MONTHS[p.month - 1]} ${String(p.year).slice(2)}`, gross: toNum(p.totalGross), overtime: toNum(p.totalOvertime), deductions: toNum(p.totalDeductions), net: toNum(p.totalNet), employees: p.lines.length, status: p.status }));
      const byTrade = new Map<string, { trade: string; gross: number; net: number; employees: Set<string> }>();
      for (const p of periods) for (const line of p.lines) {
        const trade = line.employee.trade ?? "Unassigned";
        if (!byTrade.has(trade)) byTrade.set(trade, { trade, gross: 0, net: 0, employees: new Set() });
        const row = byTrade.get(trade)!;
        row.gross += toNum(line.basicAmount) + toNum(line.overtimeAmount);
        row.net += toNum(line.netPay);
        row.employees.add(line.employee.id);
      }
      const tradeRows = Array.from(byTrade.values()).map((r) => ({ trade: r.trade, gross: r.gross, net: r.net, employees: r.employees.size })).sort((a, b) => b.gross - a.gross);
      const byCrew = new Map<string, { crew: string; gross: number; net: number; employees: Set<string> }>();
      for (const p of periods) for (const line of p.lines) {
        const crew = line.employee.crew?.name ?? "No crew";
        if (!byCrew.has(crew)) byCrew.set(crew, { crew, gross: 0, net: 0, employees: new Set() });
        const row = byCrew.get(crew)!;
        row.gross += toNum(line.basicAmount) + toNum(line.overtimeAmount);
        row.net += toNum(line.netPay);
        row.employees.add(line.employee.id);
      }
      const crewRows = Array.from(byCrew.values()).map((r) => ({ crew: r.crew, gross: r.gross, net: r.net, employees: r.employees.size })).sort((a, b) => b.gross - a.gross);
      const totalGross = monthly.reduce((s, m) => s + m.gross, 0);
      const totalNet = monthly.reduce((s, m) => s + m.net, 0);
      const totalOvertime = monthly.reduce((s, m) => s + m.overtime, 0);
      sheets = buildPayrollExpenseReport({ monthly, tradeRows, crewRows, totalGross, totalNet, totalOvertime });
      break;
    }

    case "pending-payments": {
      title = "Pending Payments Report";
      const overduePOs = await prisma.purchaseOrder.findMany({
        where: { companyId: company.id, status: { in: ["ORDERED", "PARTIAL"] }, expectedDate: { lt: now } },
        include: { supplier: { select: { name: true } }, lines: { select: { qtyOrdered: true, qtyReceived: true, unitCost: true } } },
        orderBy: { expectedDate: "asc" },
      });
      const overdueRows = overduePOs.map((po) => {
        const receivedValue = po.lines.reduce((s, l) => s + toNum(l.qtyReceived) * toNum(l.unitCost), 0);
        const orderedValue = po.lines.reduce((s, l) => s + toNum(l.qtyOrdered) * toNum(l.unitCost), 0);
        const daysOverdue = po.expectedDate ? Math.floor((now.getTime() - po.expectedDate.getTime()) / 86400000) : 0;
        return { poNumber: po.poNumber, supplier: po.supplier.name, expectedDate: po.expectedDate?.toISOString() ?? null, orderedValue, receivedValue, payable: receivedValue, status: po.status, daysOverdue, agingBucket: daysOverdue <= 0 ? "current" : daysOverdue <= 30 ? "1-30d" : daysOverdue <= 60 ? "31-60d" : daysOverdue <= 90 ? "61-90d" : ">90d" };
      });
      const sales = await prisma.assetSale.findMany({
        where: { companyId: company.id, status: "ACTIVE", paymentStatus: { in: ["PENDING", "PARTIAL"] } },
        include: { customer: { select: { name: true } }, project: { select: { name: true } }, payments: { select: { amount: true } } },
        orderBy: { saleDate: "asc" },
      });
      const receivableRows = sales.map((s) => {
        const collected = s.payments.reduce((sum, p) => sum + toNum(p.amount), 0);
        const daysSinceSale = Math.floor((now.getTime() - s.saleDate.getTime()) / 86400000);
        return { saleNumber: s.saleNumber, customer: s.customer.name, project: s.project.name, saleDate: s.saleDate.toISOString(), salePrice: toNum(s.salePrice), collected, outstanding: toNum(s.salePrice) - collected, paymentStatus: s.paymentStatus, daysSinceSale, agingBucket: daysSinceSale <= 0 ? "current" : daysSinceSale <= 30 ? "1-30d" : daysSinceSale <= 60 ? "31-60d" : daysSinceSale <= 90 ? "61-90d" : ">90d" };
      }).filter((r) => r.outstanding > 0.01);
      const draftPOs = await prisma.purchaseOrder.findMany({
        where: { companyId: company.id, status: "DRAFT" },
        include: { supplier: { select: { name: true } }, lines: { select: { qtyOrdered: true, unitCost: true } } },
        orderBy: { createdAt: "desc" },
      });
      const draftRows = draftPOs.map((po) => ({ poNumber: po.poNumber, supplier: po.supplier.name, value: po.lines.reduce((s, l) => s + toNum(l.qtyOrdered) * toNum(l.unitCost), 0), createdAt: po.createdAt.toISOString() }));
      const totalPayable = overdueRows.reduce((s, r) => s + r.payable, 0);
      const totalReceivable = receivableRows.reduce((s, r) => s + r.outstanding, 0);
      const totalDraft = draftRows.reduce((s, r) => s + r.value, 0);
      sheets = buildPendingPaymentsReport({ overduePOs: overdueRows, receivables: receivableRows, draftPOs: draftRows, totalPayable, totalReceivable, totalDraft });
      break;
    }

    case "trial-balance": {
      title = "Trial Balance";
      const tb = await trialBalance(company.id);
      sheets = buildTrialBalanceReport({
        accounts: tb.accounts.map((a) => ({ code: a.code, name: a.name, type: a.type, debit: a.debit.toNumber(), credit: a.credit.toNumber(), balance: a.balance.toNumber() })),
        totalDebit: tb.totalDebit.toNumber(), totalCredit: tb.totalCredit.toNumber(), isBalanced: tb.isBalanced,
      });
      break;
    }

    case "stock-movements": {
      title = "Stock Movement Report";
      const MOVEMENT_LABELS: Record<string, string> = {
        PURCHASE_RECEIPT: "Receipt", TRANSFER_IN: "Transfer In", TRANSFER_OUT: "Transfer Out",
        ISSUE_TO_PROJECT: "Issue to Project", ISSUE_TO_DEPARTMENT: "Issue to Dept",
        ADJUSTMENT_IN: "Adjustment (+)", ADJUSTMENT_OUT: "Adjustment (−)", RETURN: "Return", SALE: "Sale",
      };
      const companyLocationIds = new Set((await prisma.stockLocation.findMany({ where: { companyId: company.id }, select: { id: true } })).map((l) => l.id));
      const movements = await prisma.stockMovement.findMany({
        where: { timestamp: { gte: fromDate, lte: toDate } },
        orderBy: { timestamp: "desc" },
        take: 5000,
        include: { material: { select: { id: true, code: true, name: true, unit: true } }, fromLocation: { select: { id: true, name: true } }, toLocation: { select: { id: true, name: true } } },
      });
      const rows = movements
        .filter((m) => (!m.fromLocationId || !m.toLocationId || companyLocationIds.has(m.fromLocationId) || companyLocationIds.has(m.toLocationId)))
        .map((m) => ({
          timestamp: m.timestamp.toISOString(),
          movementLabel: MOVEMENT_LABELS[m.movementType] ?? m.movementType,
          materialName: m.material.name, materialCode: m.material.code,
          fromLocationName: m.fromLocation?.name ?? null, toLocationName: m.toLocation?.name ?? null,
          qty: toNum(m.qty), unit: m.material.unit, unitCost: toNum(m.unitCost), balanceAfter: toNum(m.balanceAfter), reason: m.reason,
        }));
      sheets = buildStockMovementReport({ movements: rows });
      break;
    }

    case "purchaser-performance": {
      title = "Purchaser Performance Report";
      const rows = await getPurchaserPerformance(company.id, { from: fromDate, to: toDate });
      sheets = buildPurchaserPerformanceReport({
        rows: rows.map((r) => ({ userName: r.userName, userEmail: r.userEmail, role: r.role, quotesUploaded: r.quotesUploaded, requisitionsHandled: r.requisitionsHandled, cheapestSelected: r.cheapestSelected, totalSpend: r.totalSpend.toNumber(), potentialSavings: r.potentialSavings.toNumber(), avgQuotesPerRequisition: r.avgQuotesPerRequisition, cheapestSelectionRate: r.cheapestSelectionRate })),
        totalQuotes: rows.reduce((s, r) => s + r.quotesUploaded, 0),
        totalSpend: rows.reduce((s, r) => s + r.totalSpend.toNumber(), 0),
        totalSavings: rows.reduce((s, r) => s + r.potentialSavings.toNumber(), 0),
        from: from ?? fromDate.toISOString().slice(0, 10),
        to: to ?? toDate.toISOString().slice(0, 10),
      });
      break;
    }

    case "reconciliation": {
      title = "Material Reconciliation Report";
      if (!projectId) return json({ error: "projectId is required for reconciliation export" }, { status: 400 });
      const project = await prisma.project.findUnique({ where: { id: projectId }, select: { name: true } });
      if (!project) return json({ error: "Project not found" }, { status: 404 });
      const recon = await getProjectMaterialReconciliation(projectId, 5);
      sheets = buildReconciliationReport({
        projectName: project.name,
        items: recon.items.map((i) => ({ serialNo: i.serialNo, description: i.description, materialCode: i.materialCode, materialName: i.materialName, unit: i.unit, requiredQty: i.requiredQty.toNumber(), issuedQty: i.issuedQty.toNumber(), consumedQty: i.consumedQty.toNumber(), currentStock: i.currentStock.toNumber(), issueVariance: i.issueVariance.toNumber(), consumptionVariance: i.consumptionVariance.toNumber(), stockVariance: i.stockVariance.toNumber(), wastagePct: i.wastagePct.toNumber(), alertLevel: i.alertLevel })),
        totalRequired: recon.totalRequired.toNumber(), totalIssued: recon.totalIssued.toNumber(), totalConsumed: recon.totalConsumed.toNumber(), totalWastage: recon.totalWastage.toNumber(), overToleranceCount: recon.overToleranceCount,
      });
      break;
    }

    case "stock-issue-summary": {
      title = `STOCK ISSUE SUMMARY OF ${fromDate.toISOString().slice(0, 10)} TO ${toDate.toISOString().slice(0, 10)}`;
      const dateFilter: { issueDate?: { gte?: Date; lte?: Date } } = {};
      if (from) dateFilter.issueDate = { gte: new Date(from) };
      if (to) {
        const end = new Date(to);
        end.setHours(23, 59, 59, 999);
        dateFilter.issueDate = { ...dateFilter.issueDate, lte: end };
      }
      const issues = await prisma.materialIssue.findMany({
        where: {
          department: { companyId: company.id, deletedAt: null },
          departmentId: { not: null },
          ...dateFilter,
        },
        include: {
          department: { select: { id: true, name: true } },
          lines: { select: { qty: true, unitCost: true } },
        },
        orderBy: { issueDate: "asc" },
      });
      const byDept = new Map<string, { name: string; total: number }>();
      for (const issue of issues) {
        const dept = issue.department!;
        if (!byDept.has(dept.id)) byDept.set(dept.id, { name: dept.name, total: 0 });
        for (const line of issue.lines) {
          byDept.get(dept.id)!.total += toNum(line.qty) * toNum(line.unitCost);
        }
      }
      const rows = Array.from(byDept.values())
        .map((d) => ({ departmentName: d.name, totalAmount: d.total }))
        .sort((a, b) => b.totalAmount - a.totalAmount);
      const grandTotal = rows.reduce((s, r) => s + r.totalAmount, 0);
      sheets = buildStockIssueSummaryReport({ rows, grandTotal });
      break;
    }

    case "stock-movement-summary": {
      title = `SALABLE STOCK REPORT OF ${fromDate.toISOString().slice(0, 10)} TO ${toDate.toISOString().slice(0, 10)}`;
      const IN_TYPES: StockMovementType[] = ["PURCHASE_RECEIPT", "ADJUSTMENT_IN"];
      const OUT_TYPES: StockMovementType[] = ["ISSUE_TO_PROJECT", "ISSUE_TO_DEPARTMENT", "ADJUSTMENT_OUT", "RETURN", "SALE"];
      const [inBefore, outBefore, inPeriod, outPeriod, locationItems] = await Promise.all([
        prisma.stockMovement.findMany({
          where: { movementType: { in: IN_TYPES }, toLocation: { companyId: company.id, deletedAt: null }, timestamp: { lt: fromDate } },
          select: { qty: true, unitCost: true, toLocationId: true, materialId: true },
        }),
        prisma.stockMovement.findMany({
          where: { movementType: { in: OUT_TYPES }, fromLocation: { companyId: company.id, deletedAt: null }, timestamp: { lt: fromDate } },
          select: { qty: true, unitCost: true, fromLocationId: true, materialId: true },
        }),
        prisma.stockMovement.findMany({
          where: { movementType: { in: IN_TYPES }, toLocation: { companyId: company.id, deletedAt: null }, timestamp: { gte: fromDate, lte: toDate } },
          include: { toLocation: { select: { id: true, name: true, type: true } } },
          orderBy: { timestamp: "asc" },
        }),
        prisma.stockMovement.findMany({
          where: { movementType: { in: OUT_TYPES }, fromLocation: { companyId: company.id, deletedAt: null }, timestamp: { gte: fromDate, lte: toDate } },
          include: { fromLocation: { select: { id: true, name: true, type: true } } },
          orderBy: { timestamp: "asc" },
        }),
        prisma.stockLocationItem.findMany({
          where: { location: { companyId: company.id, deletedAt: null }, material: { deletedAt: null } },
          include: { location: { select: { id: true, name: true, type: true } } },
        }),
      ]);
      const byLocation = new Map<string, { name: string; opening: number; received: number; issued: number; balance: number }>();
      for (const m of inPeriod) {
        const loc = m.toLocation!;
        if (!byLocation.has(loc.id)) byLocation.set(loc.id, { name: loc.name, opening: 0, received: 0, issued: 0, balance: 0 });
        byLocation.get(loc.id)!.received += toNum(m.qty) * toNum(m.unitCost);
      }
      for (const m of outPeriod) {
        const loc = m.fromLocation!;
        if (!byLocation.has(loc.id)) byLocation.set(loc.id, { name: loc.name, opening: 0, received: 0, issued: 0, balance: 0 });
        byLocation.get(loc.id)!.issued += toNum(m.qty) * toNum(m.unitCost);
      }
      for (const item of locationItems) {
        const loc = item.location;
        if (!byLocation.has(loc.id)) byLocation.set(loc.id, { name: loc.name, opening: 0, received: 0, issued: 0, balance: 0 });
        const row = byLocation.get(loc.id)!;
        row.balance += toNum(item.qty) * toNum(item.movingAvgCost);
        row.opening = row.balance - row.received + row.issued;
      }
      const rows = Array.from(byLocation.values())
        .map((v) => ({ companyName: v.name, openingAmount: v.opening, receivedAmount: v.received, issuedAmount: v.issued, balanceAmount: v.balance }))
        .sort((a, b) => b.balanceAmount - a.balanceAmount);
      const firmTotal = {
        openingAmount: rows.reduce((s, r) => s + r.openingAmount, 0),
        receivedAmount: rows.reduce((s, r) => s + r.receivedAmount, 0),
        issuedAmount: rows.reduce((s, r) => s + r.issuedAmount, 0),
        balanceAmount: rows.reduce((s, r) => s + r.balanceAmount, 0),
      };
      sheets = buildStockMovementSummaryReport({ rows, firmTotal });
      break;
    }

    case "issue-register": {
      title = `STOCK ISSUE REGISTER OF ${fromDate.toISOString().slice(0, 10)} TO ${toDate.toISOString().slice(0, 10)}`;
      const dateFilter: { issueDate?: { gte?: Date; lte?: Date } } = {};
      if (from) dateFilter.issueDate = { gte: new Date(from) };
      if (to) {
        const end = new Date(to);
        end.setHours(23, 59, 59, 999);
        dateFilter.issueDate = { ...dateFilter.issueDate, lte: end };
      }
      const issues = await prisma.materialIssue.findMany({
        where: {
          OR: [
            { department: { companyId: company.id, deletedAt: null } },
            { project: { companyId: company.id, deletedAt: null } },
          ],
          ...dateFilter,
        },
        include: {
          department: { select: { code: true, name: true } },
          project: { select: { name: true } },
        },
        orderBy: { issueDate: "asc" },
      });
      const rows = issues.map((issue) => {
        const targetName = issue.project?.name
          ?? (issue.department ? `${issue.department.code} — ${issue.department.name}` : "—");
        return {
          issueNumber: issue.issueNumber ?? "—",
          issueDate: issue.issueDate.toISOString().slice(0, 10),
          departmentName: targetName,
          totalAmount: toNum(issue.totalAmount),
        };
      });
      const totalAmount = rows.reduce((s, r) => s + r.totalAmount, 0);
      sheets = buildIssueRegisterReport({ rows, totalAmount });
      break;
    }

    case "purchase-register": {
      title = `PURCHASE REGISTER OF ${fromDate.toISOString().slice(0, 10)} TO ${toDate.toISOString().slice(0, 10)}`;
      const billDateFilter = (field: string) => {
        const f: Record<string, { gte?: Date; lte?: Date }> = {};
        if (from) f[field] = { gte: new Date(from) };
        if (to) {
          const end = new Date(to);
          end.setHours(23, 59, 59, 999);
          f[field] = { ...f[field], lte: end };
        }
        return f;
      };
      const [purchases, returns] = await Promise.all([
        prisma.directPurchase.findMany({
          where: { companyId: company.id, ...billDateFilter("billDate") },
          include: { supplier: { select: { name: true } } },
          orderBy: { billDate: "asc" },
        }),
        prisma.supplierReturn.findMany({
          where: { companyId: company.id, status: { in: ["SUBMITTED", "COMPLETED"] }, ...billDateFilter("returnDate") },
          include: { supplier: { select: { name: true } }, lines: { select: { qty: true, unitCost: true } } },
          orderBy: { returnDate: "asc" },
        }),
      ]);
      type RegRow = { date: string; billNumber: string; supplierName: string; roundOff: number; billAmount: number };
      const regRows: RegRow[] = [];
      for (const p of purchases) {
        regRows.push({
          billNumber: p.billNumber,
          date: p.billDate.toISOString().slice(0, 10),
          supplierName: p.supplier?.name ?? p.supplierName,
          roundOff: toNum(p.roundOff),
          billAmount: toNum(p.billAmount),
        });
      }
      for (const r of returns) {
        const returnAmount = r.lines.reduce((s, l) => s + toNum(l.qty) * toNum(l.unitCost), 0);
        regRows.push({
          billNumber: r.returnNumber,
          date: r.returnDate.toISOString().slice(0, 10),
          supplierName: r.supplier.name,
          roundOff: 0,
          billAmount: -returnAmount,
        });
      }
      regRows.sort((a, b) => a.date.localeCompare(b.date));
      const netTotal = regRows.reduce((s, r) => s + r.billAmount, 0);
      sheets = buildPurchaseRegisterReport({ rows: regRows, netTotal });
      break;
    }

    default:
      return json({ error: `Unknown export type: ${type}` }, { status: 400 });
  }

  // ── Generate the file ──
  if (format === "csv") {
    // Simple CSV from the first sheet
    const sheet = sheets[0];
    if (!sheet) return json({ error: "No data to export" }, { status: 400 });
    const header = sheet.columns.map((c) => `"${c.header}"`).join(",");
    const body = sheet.rows.map((row) =>
      sheet.columns.map((col) => {
        let val: unknown = row[col.key];
        if (col.formatter) val = col.formatter(val, row);
        if (val && typeof val === "object" && typeof (val as { toNumber?: unknown }).toNumber === "function") val = (val as { toNumber: () => number }).toNumber();
        const s = val == null ? "" : String(val);
        return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
      }).join(","),
    ).join("\n");
    const csv = "\uFEFF" + header + "\n" + body;
    return new Response(csv, {
      headers: {
        "Content-Type": "text/csv;charset=utf-8;",
        "Content-Disposition": `attachment; filename="${filenameBase}.csv"`,
      },
    });
  }

  // Default: xlsx
  const buffer = await generateExcelWorkbook({ sheets, filename: filenameBase, title, companyName });
  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filenameBase}.xlsx"`,
      "Content-Length": String(buffer.length),
    },
  });
});
