/**
 * Unit tests for the pure GL preview functions in gl-preview.ts.
 *
 * These functions compute the journal lines for a given mutation
 * WITHOUT persisting anything. They mirror gl-posting.ts but return
 * data instead of writing to the DB.
 *
 * No DB, no mocking — pure functions.
 */
import { describe, it, expect } from "vitest";
import {
  previewExpenseGl,
  previewProjectCostGl,
  previewLandCostComponentGl,
  previewPurchaseReceiptGl,
  previewMaterialIssueGl,
  previewAssetSaleGl,
  previewStockAdjustmentGl,
  previewPayrollGl,
} from "./gl-preview";

describe("previewExpenseGl", () => {
  it("debits Operating Expenses and credits Cash", () => {
    const lines = previewExpenseGl(1000);
    expect(lines).toHaveLength(2);
    expect(lines[0]!.debit).toBe(1000);
    expect(lines[0]!.credit).toBe(0);
    expect(lines[1]!.debit).toBe(0);
    expect(lines[1]!.credit).toBe(1000);
  });

  it("uses account code 6000 for Operating Expenses", () => {
    const lines = previewExpenseGl(500);
    expect(lines[0]!.accountCode).toBe("6000");
    expect(lines[1]!.accountCode).toBe("1000"); // Cash
  });
});

describe("previewProjectCostGl", () => {
  it("debits WIP and credits Cash", () => {
    const lines = previewProjectCostGl(5000);
    expect(lines).toHaveLength(2);
    expect(lines[0]!.debit).toBe(5000);
    expect(lines[0]!.accountCode).toBe("1500"); // WIP
    expect(lines[1]!.credit).toBe(5000);
    expect(lines[1]!.accountCode).toBe("1000"); // Cash
  });
});

describe("previewLandCostComponentGl", () => {
  it("debits Land Asset and credits Cash", () => {
    const lines = previewLandCostComponentGl(200000);
    expect(lines).toHaveLength(2);
    expect(lines[0]!.debit).toBe(200000);
    expect(lines[0]!.accountCode).toBe("1700"); // Land Asset
    expect(lines[1]!.credit).toBe(200000);
    expect(lines[1]!.accountCode).toBe("1000"); // Cash
  });
});

describe("previewPurchaseReceiptGl", () => {
  it("debits Inventory + Input GST, credits Accounts Payable", () => {
    const lines = previewPurchaseReceiptGl(1000, 18);
    // GST = 1000 × 18% = 180
    // Total payable = 1000 + 180 = 1180
    expect(lines).toHaveLength(3);
    expect(lines[0]!.debit).toBe(1000); // Inventory
    expect(lines[1]!.debit).toBe(180); // Input GST
    expect(lines[2]!.credit).toBe(1180); // AP
  });

  it("handles 0% GST", () => {
    const lines = previewPurchaseReceiptGl(1000, 0);
    expect(lines[1]!.debit).toBe(0); // No GST
    expect(lines[2]!.credit).toBe(1000); // AP = subtotal only
  });
});

describe("previewMaterialIssueGl", () => {
  it("debits WIP and credits Inventory for total cost", () => {
    const lines = previewMaterialIssueGl([
      { qty: 10, unitCost: 100 },
      { qty: 5, unitCost: 200 },
    ]);
    // Total = 10×100 + 5×200 = 2000
    expect(lines).toHaveLength(2);
    expect(lines[0]!.debit).toBe(2000);
    expect(lines[0]!.accountCode).toBe("1500"); // WIP
    expect(lines[1]!.credit).toBe(2000);
    expect(lines[1]!.accountCode).toBe("1300"); // Inventory
  });

  it("handles empty lines (total = 0)", () => {
    const lines = previewMaterialIssueGl([]);
    expect(lines[0]!.debit).toBe(0);
    expect(lines[1]!.credit).toBe(0);
  });
});

describe("previewAssetSaleGl", () => {
  it("debits AR, credits Sales Revenue + Output GST", () => {
    const lines = previewAssetSaleGl(10000, 12);
    // GST = 10000 × 12% = 1200
    // Total receivable = 10000 + 1200 = 11200
    expect(lines).toHaveLength(3);
    expect(lines[0]!.debit).toBe(11200); // AR
    expect(lines[1]!.credit).toBe(10000); // Sales Revenue
    expect(lines[2]!.credit).toBe(1200); // Output GST
  });
});

describe("previewStockAdjustmentGl", () => {
  it("returns empty array when all variances are 0", () => {
    const lines = previewStockAdjustmentGl([
      { variance: 0, unitCost: 100 },
    ]);
    expect(lines).toHaveLength(0);
  });

  it("handles gains (counted > system)", () => {
    const lines = previewStockAdjustmentGl([
      { variance: 5, unitCost: 100 }, // gain of 500
    ]);
    expect(lines).toHaveLength(2);
    expect(lines[0]!.debit).toBe(500); // Inventory gain
    expect(lines[0]!.accountCode).toBe("1300");
    expect(lines[1]!.credit).toBe(500); // Operating Expense reversal
    expect(lines[1]!.accountCode).toBe("6000");
  });

  it("handles losses (counted < system)", () => {
    const lines = previewStockAdjustmentGl([
      { variance: -3, unitCost: 200 }, // loss of 600
    ]);
    expect(lines).toHaveLength(2);
    expect(lines[0]!.debit).toBe(600); // Inventory Shrinkage
    expect(lines[0]!.accountCode).toBe("5500");
    expect(lines[1]!.credit).toBe(600); // Inventory credit
    expect(lines[1]!.accountCode).toBe("1300");
  });

  it("handles both gains and losses in same count", () => {
    const lines = previewStockAdjustmentGl([
      { variance: 5, unitCost: 100 }, // gain 500
      { variance: -2, unitCost: 50 }, // loss 100
    ]);
    // 4 lines: 2 for gains, 2 for losses
    expect(lines).toHaveLength(4);
  });
});

describe("previewPayrollGl", () => {
  it("posts basic salary expense (gross → net payable)", () => {
    const lines = previewPayrollGl({
      totalGross: 100000,
      totalNet: 80000,
      totalDeductions: 20000,
    });
    // Dr Salaries Expense 100000, Cr Salaries Payable 80000
    // otherDeductions = 20000 - 0 - 0 - 0 - 0 = 20000
    expect(lines).toHaveLength(3);
    expect(lines[0]!.debit).toBe(100000); // Salaries Expense
    expect(lines[1]!.credit).toBe(80000); // Net payable
    expect(lines[2]!.credit).toBe(20000); // Other deductions
  });

  it("includes PF payable when provided", () => {
    const lines = previewPayrollGl({
      totalGross: 100000,
      totalNet: 70000,
      totalPF: 12000,
      totalEmployerPf: 12000,
    });
    // Total expense = 100000 + 12000 (employer PF) = 112000
    // PF payable = 12000 + 12000 = 24000
    // Other deductions = 30000 - 12000 = 18000
    expect(lines[0]!.debit).toBe(112000);
    const pfLine = lines.find((l) => l.accountCode === "2250");
    expect(pfLine).toBeDefined();
    expect(pfLine!.credit).toBe(24000);
  });

  it("includes ESI, Profession Tax, and TDS when provided", () => {
    const lines = previewPayrollGl({
      totalGross: 100000,
      totalNet: 60000,
      totalPF: 5000,
      totalEmployerPf: 5000,
      totalESI: 3000,
      totalProfessionTax: 2000,
      totalTDS: 10000,
    });
    // Total deductions = 40000, PF+ESI+PT+TDS = 20000, other = 20000
    expect(lines.find((l) => l.accountCode === "2350")).toBeDefined(); // ESI
    expect(lines.find((l) => l.accountCode === "2450")).toBeDefined(); // PT
    expect(lines.find((l) => l.accountCode === "2400")).toBeDefined(); // TDS
  });

  it("does not include optional lines when they are 0", () => {
    const lines = previewPayrollGl({
      totalGross: 50000,
      totalNet: 50000,
      totalPF: 0,
      totalESI: 0,
      totalProfessionTax: 0,
      totalTDS: 0,
    });
    // Only 2 lines: Salaries Expense + Salaries Payable
    expect(lines).toHaveLength(2);
  });
});
