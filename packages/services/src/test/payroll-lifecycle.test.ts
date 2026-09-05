/**
 * Integration tests for the payroll lifecycle:
 *   generatePayroll → processPayroll → payPayroll
 *
 * The existing payroll-gl.test.ts covers postPayroll() and the accumulator
 * logic in generatePayroll/updatePayrollLine.  These tests cover the FULL
 * lifecycle end-to-end:
 *   - generatePayroll creates lines from attendance
 *   - processPayroll posts GL + allocates labour to ProjectCost + status → PROCESSED
 *   - payPayroll settles Salaries Payable + status → PAID
 *   - DPR approval gate blocks processing when DPRs are unapproved
 *   - Status machine enforcement (DRAFT → PROCESSED → PAID)
 */

import { describe, it, expect, beforeEach } from "vitest";
import { prisma } from "@nirman/db";
import Decimal from "decimal.js";
import { resetDb, createTestFixture, seedTestAccounts } from "./setup";
import { ACCT } from "../gl-posting";

describe("Payroll lifecycle — generate → process → pay", () => {
  beforeEach(async () => {
    await resetDb();
  });

  async function setup() {
    const fixture = await createTestFixture();
    await seedTestAccounts(fixture.company.id);
    return fixture;
  }

  /** Create a FIXED-salary employee with an active project. */
  async function createFixedEmployee(companyId: string, projectId: string, salary = 30000) {
    return prisma.employee.create({
      data: {
        name: "Fixed Worker",
        phone: "9999999999",
        companyId,
        wageType: "FIXED",
        monthlySalary: new Decimal(salary),
        active: true,
        activeProjectId: projectId,
      },
    });
  }

  /** Create a DAILY-wage employee. */
  async function createDailyEmployee(companyId: string, projectId: string, rate = 500) {
    return prisma.employee.create({
      data: {
        name: "Daily Worker",
        phone: "8888888888",
        companyId,
        wageType: "DAILY",
        dailyRate: new Decimal(rate),
        active: true,
        activeProjectId: projectId,
      },
    });
  }

  /** Create PRESENT attendance for a single day. */
  async function createAttendance(employeeId: string, companyId: string, date: string) {
    return prisma.workerAttendance.create({
      data: {
        employeeId,
        companyId,
        date: new Date(date),
        status: "PRESENT",
        hoursWorked: new Decimal(8),
      },
    });
  }

  /** Get all journal entries for a payroll period. */
  async function getPayrollEntries(payrollPeriodId: string) {
    return prisma.journalEntry.findMany({
      where: { sourceId: payrollPeriodId },
      include: { lines: true },
      orderBy: { createdAt: "asc" },
    });
  }

  // ── generatePayroll ──

  it("generatePayroll creates payroll lines from PRESENT attendance (FIXED employee)", async () => {
    const { company, user, project } = await setup();
    const employee = await createFixedEmployee(company.id, project.id, 30000);
    await createAttendance(employee.id, company.id, "2025-01-15");

    const { generatePayroll } = await import("../hr");
    const period = await generatePayroll({
      companyId: company.id,
      year: 2025,
      month: 1,
      userId: user.id,
    });

    expect(period.status).toBe("DRAFT");
    expect(period.totalGross.toNumber()).toBe(30000);
    expect(period.totalNet.toNumber()).toBe(30000);

    const lines = await prisma.payrollLine.findMany({ where: { payrollPeriodId: period.id } });
    expect(lines).toHaveLength(1);
    expect(lines[0]!.grossPay.toNumber()).toBe(30000);
  });

  it("generatePayroll creates payroll lines for DAILY employee based on days present", async () => {
    const { company, user, project } = await setup();
    const employee = await createDailyEmployee(company.id, project.id, 500);

    // 3 days present
    await createAttendance(employee.id, company.id, "2025-02-10");
    await createAttendance(employee.id, company.id, "2025-02-11");
    await createAttendance(employee.id, company.id, "2025-02-12");

    const { generatePayroll } = await import("../hr");
    const period = await generatePayroll({
      companyId: company.id,
      year: 2025,
      month: 2,
      userId: user.id,
    });

    // 3 days × 500/day = 1500
    expect(period.totalGross.toNumber()).toBe(1500);
    expect(period.totalNet.toNumber()).toBe(1500);
  });

  // ── processPayroll ──

  it("processPayroll transitions DRAFT → PROCESSED and posts GL", async () => {
    const { company, user, project } = await setup();
    const employee = await createFixedEmployee(company.id, project.id, 50000);
    await createAttendance(employee.id, company.id, "2025-03-15");

    const { generatePayroll, processPayroll } = await import("../hr");
    const period = await generatePayroll({
      companyId: company.id,
      year: 2025,
      month: 3,
      userId: user.id,
    });

    const result = await processPayroll({
      payrollPeriodId: period.id,
      userId: user.id,
    });

    expect(result.status).toBe("PROCESSED");
    expect(result.processedAt).not.toBeNull();

    // GL: Dr Salaries Expense 50K / Cr Salaries Payable 50K
    const entries = await getPayrollEntries(period.id);
    expect(entries.length).toBeGreaterThanOrEqual(1);

    const processEntry = entries.find((e) => e.sourceType === "PAYROLL");
    expect(processEntry).toBeDefined();

    const expenseLine = processEntry!.lines.find((l) => l.accountCode === ACCT.SALARIES_EXPENSE);
    const payableLine = processEntry!.lines.find((l) => l.accountCode === ACCT.SALARIES_PAYABLE);
    expect(expenseLine!.debit.toNumber()).toBe(50000);
    expect(payableLine!.credit.toNumber()).toBe(50000);
  });

  it("processPayroll allocates labour cost to the employee's active project", async () => {
    const { company, user, project } = await setup();
    const employee = await createFixedEmployee(company.id, project.id, 40000);
    await createAttendance(employee.id, company.id, "2025-04-15");

    const { generatePayroll, processPayroll } = await import("../hr");
    const period = await generatePayroll({
      companyId: company.id,
      year: 2025,
      month: 4,
      userId: user.id,
    });

    await processPayroll({ payrollPeriodId: period.id, userId: user.id });

    // A ProjectCost(LABOUR) record should be created
    const costs = await prisma.projectCost.findMany({
      where: { projectId: project.id, costType: "LABOUR" },
    });
    expect(costs).toHaveLength(1);
    expect(costs[0]!.amount.toNumber()).toBe(40000);
  });

  it("processPayroll rejects processing a non-DRAFT payroll", async () => {
    const { company, user, project } = await setup();
    const employee = await createFixedEmployee(company.id, project.id, 30000);
    await createAttendance(employee.id, company.id, "2025-05-15");

    const { generatePayroll, processPayroll } = await import("../hr");
    const period = await generatePayroll({
      companyId: company.id,
      year: 2025,
      month: 5,
      userId: user.id,
    });

    await processPayroll({ payrollPeriodId: period.id, userId: user.id });

    // Second attempt should fail
    await expect(
      processPayroll({ payrollPeriodId: period.id, userId: user.id }),
    ).rejects.toThrow(/already PROCESSED/);
  });

  it("processPayroll rejects processing with no payroll lines", async () => {
    const { company, user } = await setup();

    // Create a period with no employees/attendance
    const period = await prisma.payrollPeriod.create({
      data: {
        companyId: company.id,
        month: 6,
        year: 2025,
        startDate: new Date("2025-06-01"),
        endDate: new Date("2025-06-30"),
        status: "DRAFT",
        totalGross: new Decimal(0),
        totalNet: new Decimal(0),
        totalDeductions: new Decimal(0),
      },
    });

    const { processPayroll } = await import("../hr");
    await expect(
      processPayroll({ payrollPeriodId: period.id, userId: user.id }),
    ).rejects.toThrow(/no lines/);
  });

  // ── payPayroll ──

  it("payPayroll transitions PROCESSED → PAID and settles Salaries Payable", async () => {
    const { company, user, project } = await setup();
    const employee = await createFixedEmployee(company.id, project.id, 40000);
    await createAttendance(employee.id, company.id, "2025-07-15");

    const { generatePayroll, processPayroll, payPayroll } = await import("../hr");
    const period = await generatePayroll({
      companyId: company.id,
      year: 2025,
      month: 7,
      userId: user.id,
    });

    await processPayroll({ payrollPeriodId: period.id, userId: user.id });

    const result = await payPayroll({ payrollPeriodId: period.id, userId: user.id });

    expect(result.status).toBe("PAID");
    expect(result.paidAt).not.toBeNull();

    // GL: Dr Salaries Payable 40K / Cr Cash 40K
    const entries = await getPayrollEntries(period.id);
    const paymentEntry = entries.find((e) => e.sourceType === "PAYROLL_PAYMENT");
    expect(paymentEntry).toBeDefined();

    const payableDebit = paymentEntry!.lines.find((l) => l.accountCode === ACCT.SALARIES_PAYABLE);
    const cashCredit = paymentEntry!.lines.find((l) => l.accountCode === ACCT.CASH);
    expect(payableDebit!.debit.toNumber()).toBe(40000);
    expect(cashCredit!.credit.toNumber()).toBe(40000);
  });

  it("payPayroll rejects paying a DRAFT payroll (must process first)", async () => {
    const { company, user, project } = await setup();
    const employee = await createFixedEmployee(company.id, project.id, 30000);
    await createAttendance(employee.id, company.id, "2025-08-15");

    const { generatePayroll, payPayroll } = await import("../hr");
    const period = await generatePayroll({
      companyId: company.id,
      year: 2025,
      month: 8,
      userId: user.id,
    });

    await expect(
      payPayroll({ payrollPeriodId: period.id, userId: user.id }),
    ).rejects.toThrow(/PROCESSED before paying/);
  });

  it("payPayroll rejects double payment", async () => {
    const { company, user, project } = await setup();
    const employee = await createFixedEmployee(company.id, project.id, 30000);
    await createAttendance(employee.id, company.id, "2025-09-15");

    const { generatePayroll, processPayroll, payPayroll } = await import("../hr");
    const period = await generatePayroll({
      companyId: company.id,
      year: 2025,
      month: 9,
      userId: user.id,
    });

    await processPayroll({ payrollPeriodId: period.id, userId: user.id });
    await payPayroll({ payrollPeriodId: period.id, userId: user.id });

    await expect(
      payPayroll({ payrollPeriodId: period.id, userId: user.id }),
    ).rejects.toThrow(/already been paid/);
  });

  // ── Full lifecycle with deductions ──

  it("full lifecycle with PF + TDS: GL posts all statutory payables correctly", async () => {
    const { company, user, project } = await setup();
    const employee = await createFixedEmployee(company.id, project.id, 60000);
    await createAttendance(employee.id, company.id, "2025-10-15");

    const { generatePayroll, processPayroll, payPayroll, updatePayrollLine } = await import("../hr");
    const period = await generatePayroll({
      companyId: company.id,
      year: 2025,
      month: 10,
      userId: user.id,
    });

    // Add PF=6000, TDS=5000, deductions=2000
    const lines = await prisma.payrollLine.findMany({ where: { payrollPeriodId: period.id } });
    await updatePayrollLine({
      payrollLineId: lines[0]!.id,
      pf: new Decimal(6000),
      tax: new Decimal(5000),
      deductions: new Decimal(2000),
      userId: user.id,
    });

    // Process
    await processPayroll({ payrollPeriodId: period.id, userId: user.id });

    const entries = await getPayrollEntries(period.id);
    const processEntry = entries.find((e) => e.sourceType === "PAYROLL");
    expect(processEntry).toBeDefined();

    // Dr Salaries Expense 60K
    const expense = processEntry!.lines.find((l) => l.accountCode === ACCT.SALARIES_EXPENSE);
    expect(expense!.debit.toNumber()).toBe(60000);

    // Cr PF Payable 6K
    const pfPayable = processEntry!.lines.find((l) => l.accountCode === ACCT.PF_PAYABLE);
    expect(pfPayable!.credit.toNumber()).toBe(6000);

    // Cr TDS Payable 5K
    const tdsPayable = processEntry!.lines.find((l) => l.accountCode === ACCT.TDS_PAYABLE);
    expect(tdsPayable!.credit.toNumber()).toBe(5000);

    // Net = 60000 - 6000 - 5000 - 2000 = 47000
    // Cr Salaries Payable (net) + Cr Salaries Payable (other deductions) = 47000 + 2000 = 49000
    // Wait: otherDeductions = totalDeductions(13000) - PF(6000) - ESI(0) - profTax(0) - TDS(5000) = 2000
    // Net payable = totalNet = 60000 - 13000 = 47000
    // Cr lines: Salaries Payable (net) 47000 + PF 6000 + TDS 5000 + Salaries Payable (other) 2000 = 60000
    const salariesPayableLines = processEntry!.lines.filter((l) => l.accountCode === ACCT.SALARIES_PAYABLE);
    const totalSalariesPayable = salariesPayableLines.reduce((s, l) => s + l.credit.toNumber(), 0);
    expect(totalSalariesPayable).toBe(49000); // 47000 net + 2000 other deductions

    // Entry balanced
    expect(processEntry!.totalDebit.toNumber()).toBe(60000);
    expect(processEntry!.totalCredit.toNumber()).toBe(60000);

    // Pay
    await payPayroll({ payrollPeriodId: period.id, userId: user.id });

    // Verify payment entry: Dr Salaries Payable 47K / Cr Cash 47K
    const paymentEntry = entries.find((e) => e.sourceType === "PAYROLL_PAYMENT");
    // Re-fetch since entries was captured before payPayroll
    const allEntries = await getPayrollEntries(period.id);
    const payment = allEntries.find((e) => e.sourceType === "PAYROLL_PAYMENT");
    expect(payment).toBeDefined();

    const payableDebit = payment!.lines.find((l) => l.accountCode === ACCT.SALARIES_PAYABLE && l.debit.toNumber() > 0);
    const cashCredit = payment!.lines.find((l) => l.accountCode === ACCT.CASH && l.credit.toNumber() > 0);
    expect(payableDebit!.debit.toNumber()).toBe(47000);
    expect(cashCredit!.credit.toNumber()).toBe(47000);
  });

  // ── DPR approval gate ──

  it("processPayroll blocks when DPRs for the period are not approved", async () => {
    const { company, user, project } = await setup();
    const employee = await createFixedEmployee(company.id, project.id, 30000);
    await createAttendance(employee.id, company.id, "2025-11-15");

    // Create an unapproved DPR for the same project + period
    await prisma.dailyProgressReport.create({
      data: {
        companyId: company.id,
        projectId: project.id,
        date: new Date("2025-11-15"),
        workSummary: "Foundation work in progress",
        approvalStatus: "SUBMITTED",
        submittedById: user.id,
      },
    });

    const { generatePayroll, processPayroll } = await import("../hr");
    const period = await generatePayroll({
      companyId: company.id,
      year: 2025,
      month: 11,
      userId: user.id,
    });

    await expect(
      processPayroll({ payrollPeriodId: period.id, userId: user.id }),
    ).rejects.toThrow(/DPR.*not yet fully approved/);
  });

  it("processPayroll succeeds when all DPRs for the period are APPROVED", async () => {
    const { company, user, project } = await setup();
    const employee = await createFixedEmployee(company.id, project.id, 30000);
    await createAttendance(employee.id, company.id, "2025-12-15");

    // Create an APPROVED DPR
    await prisma.dailyProgressReport.create({
      data: {
        companyId: company.id,
        projectId: project.id,
        date: new Date("2025-12-15"),
        workSummary: "Foundation complete",
        approvalStatus: "APPROVED",
        submittedById: user.id,
        adminApprovedById: user.id,
        adminApprovedAt: new Date(),
      },
    });

    const { generatePayroll, processPayroll } = await import("../hr");
    const period = await generatePayroll({
      companyId: company.id,
      year: 2025,
      month: 12,
      userId: user.id,
    });

    const result = await processPayroll({ payrollPeriodId: period.id, userId: user.id });
    expect(result.status).toBe("PROCESSED");
  });
});
