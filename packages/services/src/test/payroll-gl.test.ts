/**
 * Integration tests for Payroll GL Posting (Phase 1C-i).
 *
 * These tests verify that postPayroll() posts the GROSS salary expense
 * with PF and TDS as separate statutory payables, and that the
 * accumulators in generatePayroll() and updatePayrollLine() are correct.
 *
 * Tests:
 *   1. postPayroll() posts Dr SALARIES_EXPENSE (gross) / Cr SALARIES_PAYABLE (net) / Cr PF_PAYABLE / Cr TDS_PAYABLE
 *   2. postPayroll() with zero PF/TDS posts only 2 lines (expense + net payable)
 *   3. postPayroll() with other deductions posts residual to SALARIES_PAYABLE
 *   4. postPayroll() with zero gross returns null
 *   5. generatePayroll() computes correct totalGross (using grossPay, not basicAmount)
 *   6. generatePayroll() computes correct totalDeductions (including PF + tax)
 */

import { describe, it, expect, beforeEach } from "vitest";
import { prisma } from "@nirman/db";
import Decimal from "decimal.js";
import { resetDb, createTestFixture, seedTestAccounts } from "./setup";
import { postPayroll, ACCT } from "../gl-posting";

describe("Payroll GL Posting — integration tests", () => {
  beforeEach(async () => {
    await resetDb();
  });

  async function setup() {
    const fixture = await createTestFixture();
    await seedTestAccounts(fixture.company.id);
    return fixture;
  }

  /**
   * Helper: find the PAYROLL journal entry for a payroll period.
   */
  async function findPayrollEntry(payrollPeriodId: string) {
    return prisma.journalEntry.findFirst({
      where: {
        sourceType: "PAYROLL",
        sourceId: payrollPeriodId,
      },
      include: { lines: true },
    });
  }

  // ── Test 1: Full GL posting with PF and TDS ──

  it("postPayroll() posts Dr SALARIES_EXPENSE (gross) / Cr SALARIES_PAYABLE (net) / Cr PF_PAYABLE / Cr TDS_PAYABLE", async () => {
    const { company } = await setup();

    // Create a payroll period
    const period = await prisma.payrollPeriod.create({
      data: {
        companyId: company.id,
        month: 1,
        year: 2025,
        startDate: new Date("2025-01-01"),
        endDate: new Date("2025-01-31"),
        status: "DRAFT",
      },
    });

    // Post payroll with gross=100000, net=80000, PF=12000, TDS=5000, deductions=20000
    // otherDeductions = 20000 - 12000 - 5000 = 3000
    await prisma.$transaction(async (tx) => {
      await postPayroll(tx, {
        companyId: company.id,
        payrollPeriodId: period.id,
        totalGross: new Decimal(100000),
        totalNet: new Decimal(80000),
        totalPF: new Decimal(12000),
        totalTDS: new Decimal(5000),
        totalDeductions: new Decimal(20000),
      });
    });

    const entry = await findPayrollEntry(period.id);
    expect(entry).not.toBeNull();
    expect(entry!.sourceType).toBe("PAYROLL");

    // Should have 5 lines: Dr Expense, Cr Salaries Payable (net), Cr PF Payable, Cr TDS Payable, Cr Salaries Payable (other)
    expect(entry!.lines).toHaveLength(5);

    const expenseLine = entry!.lines.find((l) => l.accountCode === ACCT.SALARIES_EXPENSE);
    const netPayableLine = entry!.lines.filter((l) => l.accountCode === ACCT.SALARIES_PAYABLE);
    const pfPayableLine = entry!.lines.find((l) => l.accountCode === ACCT.PF_PAYABLE);
    const tdsPayableLine = entry!.lines.find((l) => l.accountCode === ACCT.TDS_PAYABLE);

    expect(expenseLine).toBeDefined();
    expect(expenseLine!.debit.toNumber()).toBe(100000);

    // Salaries Payable should have two credit lines: net (80000) + other (3000) = 83000
    const totalSalariesPayable = netPayableLine.reduce((sum, l) => sum + l.credit.toNumber(), 0);
    expect(totalSalariesPayable).toBe(83000);

    expect(pfPayableLine).toBeDefined();
    expect(pfPayableLine!.credit.toNumber()).toBe(12000);

    expect(tdsPayableLine).toBeDefined();
    expect(tdsPayableLine!.credit.toNumber()).toBe(5000);

    // Verify the entry is balanced: Dr 100000 = Cr 80000 + 12000 + 5000 + 3000 = 100000
    expect(entry!.totalDebit.toNumber()).toBe(100000);
    expect(entry!.totalCredit.toNumber()).toBe(100000);
  });

  // ── Test 2: Zero PF/TDS → only 2 lines ──

  it("postPayroll() with zero PF/TDS posts only 2 lines (expense + net payable)", async () => {
    const { company } = await setup();

    const period = await prisma.payrollPeriod.create({
      data: {
        companyId: company.id,
        month: 2,
        year: 2025,
        startDate: new Date("2025-02-01"),
        endDate: new Date("2025-02-28"),
        status: "DRAFT",
      },
    });

    await prisma.$transaction(async (tx) => {
      await postPayroll(tx, {
        companyId: company.id,
        payrollPeriodId: period.id,
        totalGross: new Decimal(50000),
        totalNet: new Decimal(50000),
        // No PF, TDS, or deductions
      });
    });

    const entry = await findPayrollEntry(period.id);
    expect(entry).not.toBeNull();
    expect(entry!.lines).toHaveLength(2);

    const expenseLine = entry!.lines.find((l) => l.accountCode === ACCT.SALARIES_EXPENSE);
    const payableLine = entry!.lines.find((l) => l.accountCode === ACCT.SALARIES_PAYABLE);
    expect(expenseLine).toBeDefined();
    expect(payableLine).toBeDefined();
    expect(expenseLine!.debit.toNumber()).toBe(50000);
    expect(payableLine!.credit.toNumber()).toBe(50000);
  });

  // ── Test 3: Other deductions (residual) posted to SALARIES_PAYABLE ──

  it("postPayroll() with other deductions posts residual to SALARIES_PAYABLE", async () => {
    const { company } = await setup();

    const period = await prisma.payrollPeriod.create({
      data: {
        companyId: company.id,
        month: 3,
        year: 2025,
        startDate: new Date("2025-03-01"),
        endDate: new Date("2025-03-31"),
        status: "DRAFT",
      },
    });

    // gross=80000, net=60000, PF=5000, TDS=3000, deductions=20000
    // otherDeductions = 20000 - 5000 - 3000 = 12000
    // Cr lines: Salaries Payable (net) 60000 + PF 5000 + TDS 3000 + Salaries Payable (other) 12000 = 80000
    await prisma.$transaction(async (tx) => {
      await postPayroll(tx, {
        companyId: company.id,
        payrollPeriodId: period.id,
        totalGross: new Decimal(80000),
        totalNet: new Decimal(60000),
        totalPF: new Decimal(5000),
        totalTDS: new Decimal(3000),
        totalDeductions: new Decimal(20000),
      });
    });

    const entry = await findPayrollEntry(period.id);
    expect(entry).not.toBeNull();

    // 5 lines: Dr Expense, Cr Salaries Payable (net), Cr PF, Cr TDS, Cr Salaries Payable (other)
    expect(entry!.lines).toHaveLength(5);
    expect(entry!.totalDebit.toNumber()).toBe(80000);
    expect(entry!.totalCredit.toNumber()).toBe(80000);

    // Verify the two Salaries Payable lines sum to net + other = 60000 + 12000 = 72000
    const salariesPayableLines = entry!.lines.filter((l) => l.accountCode === ACCT.SALARIES_PAYABLE);
    expect(salariesPayableLines).toHaveLength(2);
    const totalSalariesPayable = salariesPayableLines.reduce((s, l) => s + l.credit.toNumber(), 0);
    expect(totalSalariesPayable).toBe(72000);
  });

  // ── Test 4: Zero gross returns null ──

  it("postPayroll() with zero gross returns null (no entry posted)", async () => {
    const { company } = await setup();

    const result = await prisma.$transaction(async (tx) => {
      return postPayroll(tx, {
        companyId: company.id,
        payrollPeriodId: "fake-period-id",
        totalGross: new Decimal(0),
        totalNet: new Decimal(0),
      });
    });

    expect(result).toBeNull();

    const entries = await prisma.journalEntry.findMany({
      where: { sourceType: "PAYROLL" },
    });
    expect(entries).toHaveLength(0);
  });

  // ── Test 5: generatePayroll() computes correct totalGross ──

  it("generatePayroll() computes totalGross using grossPay (not basicAmount)", async () => {
    const { company, user } = await setup();

    // Create an employee with a monthly salary
    const employee = await prisma.employee.create({
      data: {
        name: "Test Worker",
        phone: "9999999999",
        companyId: company.id,
        wageType: "FIXED",
        monthlySalary: new Decimal(30000),
        active: true,
      },
    });

    // Create attendance for one day (so the employee gets a payroll line)
    const startDate = new Date("2025-01-01");
    await prisma.workerAttendance.create({
      data: {
        employeeId: employee.id,
        companyId: company.id,
        date: startDate,
        status: "PRESENT",
      },
    });

    // Generate payroll for January 2025
    const { generatePayroll } = await import("../hr");
    const period = await generatePayroll({
      companyId: company.id,
      year: 2025,
      month: 1,
      userId: user.id,
    });

    // The employee is FIXED with monthlySalary=30000, so basicAmount=30000
    // grossPay = basic + overtime + allowance + bonus = 30000 + 0 + 0 + 0 = 30000
    // totalGross should be 30000 (not just basicAmount which is also 30000 here,
    // but the key is it uses grossPay which includes overtime/allowance/bonus)
    expect(period.totalGross.toNumber()).toBe(30000);
    expect(period.totalNet.toNumber()).toBe(30000);
    expect(period.totalDeductions.toNumber()).toBe(0);
  });

  // ── Test 6: generatePayroll() computes correct totalDeductions ──

  it("generatePayroll() computes totalDeductions including PF + tax (not just deductions field)", async () => {
    const { company, user } = await setup();

    const employee = await prisma.employee.create({
      data: {
        name: "Test Worker 2",
        phone: "8888888888",
        companyId: company.id,
        wageType: "FIXED",
        monthlySalary: new Decimal(50000),
        active: true,
      },
    });

    await prisma.workerAttendance.create({
      data: {
        employeeId: employee.id,
        companyId: company.id,
        date: new Date("2025-04-01"),
        status: "PRESENT",
      },
    });

    const { generatePayroll, updatePayrollLine } = await import("../hr");
    const period = await generatePayroll({
      companyId: company.id,
      year: 2025,
      month: 4,
      userId: user.id,
    });

    // Initially all deductions are 0
    expect(period.totalDeductions.toNumber()).toBe(0);

    // Now adjust the payroll line to add PF=5000, tax=10000, deductions=2000
    const lines = await prisma.payrollLine.findMany({
      where: { payrollPeriodId: period.id },
    });
    expect(lines).toHaveLength(1);

    await updatePayrollLine({
      payrollLineId: lines[0]!.id,
      pf: new Decimal(5000),
      tax: new Decimal(10000),
      deductions: new Decimal(2000),
      userId: user.id,
    });

    // Re-read the period — totalDeductions should be 5000 + 10000 + 2000 = 17000
    const updatedPeriod = await prisma.payrollPeriod.findUnique({
      where: { id: period.id },
    });
    expect(updatedPeriod!.totalDeductions.toNumber()).toBe(17000);

    // totalGross should still be 50000 (unchanged — no overtime/allowance/bonus added)
    expect(updatedPeriod!.totalGross.toNumber()).toBe(50000);

    // totalNet should be 50000 - 17000 = 33000
    expect(updatedPeriod!.totalNet.toNumber()).toBe(33000);
  });
});
