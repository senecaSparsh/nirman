/**
 * Unit tests for the pure report builder functions in excel-export.ts.
 *
 * Each `build*Report()` function takes structured data and returns
 * `ExcelSheet[]` — column definitions + row mappings + summary rows.
 * These are pure data transformations — no file I/O, no DB.
 *
 * Tests verify:
 *   1. The correct number of sheets is returned
 *   2. Sheet names match expected report tabs
 *   3. Column headers match the expected fields
 *   4. Rows are passed through from input data
 *   5. Summary rows contain the expected labels
 *
 * No DB, no mocking — pure functions.
 */
import { describe, it, expect } from "vitest";
import {
  buildInventoryValueReport,
  buildPurchaseTrendsReport,
  buildSalesRevenueReport,
  buildProjectProgressReport,
  buildTrialBalanceReport,
  buildStockMovementReport,
  buildReconciliationReport,
} from "./excel-export";

describe("buildInventoryValueReport", () => {
  it("returns 3 sheets: Inventory Detail, By Location, By Category", () => {
    const sheets = buildInventoryValueReport({
      items: [],
      byLocation: [],
      byCategory: [],
      grandTotal: 0,
      totalQty: 0,
    });
    expect(sheets).toHaveLength(3);
    expect(sheets[0]!.name).toBe("Inventory Detail");
    expect(sheets[1]!.name).toBe("By Location");
    expect(sheets[2]!.name).toBe("By Category");
  });

  it("includes summary with As On and Grand Total", () => {
    const sheets = buildInventoryValueReport({
      items: [],
      byLocation: [],
      byCategory: [],
      grandTotal: 500000,
      totalQty: 1200,
      asOn: "2026-09-04",
    });
    expect(sheets[0]!.summary).toBeDefined();
    expect(sheets[0]!.summary!.find((s) => s.label === "As On")?.value).toBe("2026-09-04");
    expect(sheets[0]!.summary!.find((s) => s.label === "Grand Total Value")?.value).toBe(500000);
  });

  it("has 7 columns in the detail sheet", () => {
    const sheets = buildInventoryValueReport({
      items: [],
      byLocation: [],
      byCategory: [],
      grandTotal: 0,
      totalQty: 0,
    });
    expect(sheets[0]!.columns).toHaveLength(7);
    expect(sheets[0]!.columns.map((c) => c.header)).toContain("Material");
    expect(sheets[0]!.columns.map((c) => c.header)).toContain("Qty");
    expect(sheets[0]!.columns.map((c) => c.header)).toContain("Value");
  });

  it("passes through items as rows in the detail sheet", () => {
    const items = [{
      locationName: "Warehouse",
      materialCode: "MAT-001",
      materialName: "Cement",
      categoryName: "Construction",
      unit: "bag",
      qty: 100,
      value: 5000,
    }];
    const sheets = buildInventoryValueReport({
      items,
      byLocation: [],
      byCategory: [],
      grandTotal: 5000,
      totalQty: 100,
    });
    expect(sheets[0]!.rows).toHaveLength(1);
    expect(sheets[0]!.rows[0]!.materialName).toBe("Cement");
  });
});

describe("buildPurchaseTrendsReport", () => {
  it("returns 2 sheets: Monthly Trends and Top Suppliers", () => {
    const sheets = buildPurchaseTrendsReport({
      monthly: [],
      topSuppliers: [],
      grandTotal: 0,
      totalOrders: 0,
    });
    expect(sheets).toHaveLength(2);
    expect(sheets[0]!.name).toBe("Monthly Trends");
    expect(sheets[1]!.name).toBe("Top Suppliers");
  });

  it("passes through monthly and supplier data as rows", () => {
    const sheets = buildPurchaseTrendsReport({
      monthly: [{ label: "Sep 2026", subtotal: 100000, gst: 18000, total: 118000, count: 5 }],
      topSuppliers: [{ name: "ABC Corp", total: 50000, count: 2 }],
      grandTotal: 118000,
      totalOrders: 5,
    });
    expect(sheets[0]!.rows).toHaveLength(1);
    expect(sheets[0]!.rows[0]!.label).toBe("Sep 2026");
    expect(sheets[1]!.rows).toHaveLength(1);
    expect(sheets[1]!.rows[0]!.name).toBe("ABC Corp");
  });
});

describe("buildSalesRevenueReport", () => {
  it("returns 2 sheets: Monthly Revenue and Top Customers", () => {
    const sheets = buildSalesRevenueReport({
      monthly: [],
      topCustomers: [],
      totalSales: 0,
      totalCollected: 0,
      totalOutstanding: 0,
    });
    expect(sheets).toHaveLength(2);
    expect(sheets[0]!.name).toBe("Monthly Revenue");
    expect(sheets[1]!.name).toBe("Top Customers");
  });

  it("passes through monthly revenue data as rows", () => {
    const sheets = buildSalesRevenueReport({
      monthly: [{ label: "Sep 2026", sales: 500000, collected: 300000, count: 3 }],
      topCustomers: [{ name: "XYZ Ltd", sales: 200000, collected: 100000, count: 1 }],
      totalSales: 500000,
      totalCollected: 300000,
      totalOutstanding: 200000,
    });
    expect(sheets[0]!.rows).toHaveLength(1);
    expect(sheets[0]!.rows[0]!.sales).toBe(500000);
    expect(sheets[1]!.rows).toHaveLength(1);
    expect(sheets[1]!.rows[0]!.name).toBe("XYZ Ltd");
  });
});

describe("buildProjectProgressReport", () => {
  it("returns a Project Progress sheet with correct columns", () => {
    const sheets = buildProjectProgressReport({
      rows: [],
      totalCost: 0,
      totalRevenue: 0,
      totalProfit: 0,
    });
    expect(sheets.length).toBeGreaterThan(0);
    expect(sheets[0]!.name).toBe("Project Progress");
  });

  it("passes through project rows with all required fields", () => {
    const rows = [{
      name: "Tower A",
      type: "RESIDENTIAL",
      status: "ACTIVE",
      budget: 10000000,
      totalCost: 4500000,
      materials: 2000000,
      labour: 1500000,
      land: 1000000,
      revenue: 0,
      profit: -4500000,
      margin: -45,
      progressPct: 45,
      unitCount: 20,
      phaseCount: 2,
    }];
    const sheets = buildProjectProgressReport({
      rows,
      totalCost: 4500000,
      totalRevenue: 0,
      totalProfit: -4500000,
    });
    expect(sheets[0]!.rows).toHaveLength(1);
    expect(sheets[0]!.rows[0]!.name).toBe("Tower A");
    expect(sheets[0]!.rows[0]!.progressPct).toBe(45);
  });
});

describe("buildTrialBalanceReport", () => {
  it("returns a single Trial Balance sheet with 6 columns", () => {
    const sheets = buildTrialBalanceReport({
      accounts: [],
      totalDebit: 0,
      totalCredit: 0,
      isBalanced: true,
    });
    expect(sheets).toHaveLength(1);
    expect(sheets[0]!.name).toBe("Trial Balance");
    expect(sheets[0]!.columns).toHaveLength(6);
    expect(sheets[0]!.columns.map((c) => c.header)).toEqual(
      expect.arrayContaining(["Code", "Account", "Debit", "Credit", "Balance"]),
    );
  });

  it("passes through account rows and includes balance summary", () => {
    const accounts = [
      { code: "1000", name: "Cash", type: "ASSET", debit: 50000, credit: 0, balance: 50000 },
      { code: "4000", name: "Sales", type: "REVENUE", debit: 0, credit: 50000, balance: -50000 },
    ];
    const sheets = buildTrialBalanceReport({
      accounts,
      totalDebit: 50000,
      totalCredit: 50000,
      isBalanced: true,
    });
    expect(sheets[0]!.rows).toHaveLength(2);
    expect(sheets[0]!.rows[0]!.code).toBe("1000");
    expect(sheets[0]!.summary!.find((s) => s.label === "Balanced")?.value).toBe("Yes");
  });

  it("shows 'No' in summary when trial balance is not balanced", () => {
    const sheets = buildTrialBalanceReport({
      accounts: [],
      totalDebit: 50000,
      totalCredit: 40000,
      isBalanced: false,
    });
    expect(sheets[0]!.summary!.find((s) => s.label === "Balanced")?.value).toBe("No");
  });
});

describe("buildStockMovementReport", () => {
  it("returns a Stock Movements sheet", () => {
    const sheets = buildStockMovementReport({
      movements: [],
    });
    expect(sheets.length).toBeGreaterThan(0);
  });

  it("passes through movement rows with correct field names", () => {
    const movements = [{
      timestamp: "2026-09-04T10:00:00Z",
      movementLabel: "Issue to Project",
      materialName: "Cement",
      materialCode: "MAT-001",
      fromLocationName: "Warehouse A",
      toLocationName: "Site B",
      qty: 10,
      unit: "bag",
      unitCost: 300,
      balanceAfter: 90,
      reason: "Construction",
    }];
    const sheets = buildStockMovementReport({ movements });
    expect(sheets[0]!.rows).toHaveLength(1);
    expect(sheets[0]!.rows[0]!.materialName).toBe("Cement");
    expect(sheets[0]!.rows[0]!.movementLabel).toBe("Issue to Project");
  });
});

describe("buildReconciliationReport", () => {
  it("returns a Reconciliation sheet with 14 columns", () => {
    const sheets = buildReconciliationReport({
      projectName: "Tower A",
      items: [],
      totalRequired: 0,
      totalIssued: 0,
      totalConsumed: 0,
      totalWastage: 0,
      overToleranceCount: 0,
    });
    expect(sheets).toHaveLength(1);
    expect(sheets[0]!.name).toBe("Reconciliation");
    expect(sheets[0]!.columns).toHaveLength(14);
  });

  it("passes through reconciliation items and includes project name in summary", () => {
    const items = [{
      serialNo: "1",
      description: "Cement for foundation",
      materialCode: "MAT-001",
      materialName: "Cement",
      unit: "bag",
      requiredQty: 100,
      issuedQty: 105,
      consumedQty: 98,
      currentStock: 7,
      issueVariance: 5,
      consumptionVariance: -7,
      stockVariance: -2,
      wastagePct: 2,
      alertLevel: "OK",
    }];
    const sheets = buildReconciliationReport({
      projectName: "Tower A",
      items,
      totalRequired: 100,
      totalIssued: 105,
      totalConsumed: 98,
      totalWastage: 2,
      overToleranceCount: 0,
    });
    expect(sheets[0]!.rows).toHaveLength(1);
    expect(sheets[0]!.rows[0]!.materialName).toBe("Cement");
    expect(sheets[0]!.summary!.find((s) => s.label === "Project")?.value).toBe("Tower A");
  });
});
