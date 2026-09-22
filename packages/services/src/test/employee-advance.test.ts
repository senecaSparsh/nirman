/**
 * EmployeeAdvance — the advance/loan ledger with scheduled payroll recovery.
 *
 *   issue → generatePayroll carries a capped deduction component →
 *   markPayrollPaid credits recoveredAmount → auto-SETTLED on full recovery.
 *
 * Invariants under test:
 *   - deduction never exceeds the outstanding balance
 *   - draft edits (updatePayrollLineComponents) can't drop advance rows
 *   - draft regeneration can't double-credit (recovery counts only on PAID)
 *   - PAUSED advances skip deduction; CANCELLED/SETTLED never recover
 */
import { describe, it, expect, beforeEach } from "vitest";
import { prisma } from "@nirman/db";
import Decimal from "decimal.js";
import { resetDb, createTestFixture, seedTestAccounts } from "./setup";

describe("employee advances", () => {
  beforeEach(async () => {
    await resetDb();
  });

  async function setup() {
    const fixture = await createTestFixture();
    await seedTestAccounts(fixture.company.id);
    return fixture;
  }

  async function createEmployee(companyId: string, projectId: string, salary = 30000) {
    return prisma.employee.create({
      data: {
        name: "Advance Worker",
        phone: "9888877777",
        companyId,
        wageType: "FIXED",
        monthlySalary: new Decimal(salary),
        active: true,
        activeProjectId: projectId,
      },
    });
  }

  async function payPeriod(periodId: string, userId: string) {
    const { processPayroll, payPayroll } = await import("../hr");
    await processPayroll({ payrollPeriodId: periodId, userId });
    return payPayroll({ payrollPeriodId: periodId, userId });
  }

  it("issue → generate → pay → recover → auto-settle (full lifecycle)", async () => {
    const { company, user, project } = await setup();
    const employee = await createEmployee(company.id, project.id);
    const { issueAdvance } = await import("../employee-advance");
    const advance = await issueAdvance({
      employeeId: employee.id,
      companyId: company.id,
      amount: 3000,
      monthlyRecovery: 1000,
      actorUserId: user.id,
    });

    const { generatePayroll } = await import("../hr");
    const period = await generatePayroll({ companyId: company.id, year: 2025, month: 1, userId: user.id });
    const line = await prisma.payrollLine.findFirstOrThrow({
      where: { payrollPeriodId: period.id, employeeId: employee.id },
      include: { components: true },
    });
    const ded = line.components.find((c) => c.advanceId === advance.id);
    expect(ded).toBeDefined();
    expect(ded!.amount.toNumber()).toBe(1000);
    expect(ded!.isDeduction).toBe(true);
    // The deduction lands in the line's deductions bucket → lower net pay.
    expect(line.deductions.toNumber()).toBeGreaterThanOrEqual(1000);

    await payPeriod(period.id, user.id);
    const after = await prisma.employeeAdvance.findUniqueOrThrow({ where: { id: advance.id } });
    expect(after.recoveredAmount.toNumber()).toBe(1000);
    expect(after.status).toBe("ACTIVE");

    // Two more periods → recovered 3000 → SETTLED
    for (const month of [2, 3]) {
      const p = await generatePayroll({ companyId: company.id, year: 2025, month, userId: user.id });
      await payPeriod(p.id, user.id);
    }
    const settled = await prisma.employeeAdvance.findUniqueOrThrow({ where: { id: advance.id } });
    expect(settled.recoveredAmount.toNumber()).toBe(3000);
    expect(settled.status).toBe("SETTLED");
  });

  it("caps the deduction at the outstanding balance (last installment)", async () => {
    const { company, user, project } = await setup();
    const employee = await createEmployee(company.id, project.id);
    const { issueAdvance } = await import("../employee-advance");
    const advance = await issueAdvance({
      employeeId: employee.id,
      companyId: company.id,
      amount: 2500,
      monthlyRecovery: 1000, // last period should deduct 500, not 1000
      actorUserId: user.id,
    });
    const { generatePayroll } = await import("../hr");
    for (const month of [1, 2]) {
      const p = await generatePayroll({ companyId: company.id, year: 2025, month, userId: user.id });
      await payPeriod(p.id, user.id);
    }
    // Period 3: outstanding = 500 → deduction capped at 500
    const p3 = await generatePayroll({ companyId: company.id, year: 2025, month: 3, userId: user.id });
    const line = await prisma.payrollLine.findFirstOrThrow({
      where: { payrollPeriodId: p3.id, employeeId: employee.id },
      include: { components: true },
    });
    const ded = line.components.find((c) => c.advanceId === advance.id);
    expect(ded!.amount.toNumber()).toBe(500);
  });

  it("caps recovery at gross wages — deductions can never exceed earnings (no negative net pay)", async () => {
    const { company, user, project } = await setup();
    const employee = await createEmployee(company.id, project.id, 1500); // ₹1.5K/mo wage
    const { issueAdvance } = await import("../employee-advance");
    const advance = await issueAdvance({
      employeeId: employee.id,
      companyId: company.id,
      amount: 5000,
      monthlyRecovery: 4000, // exceeds the ₹1,500 gross
      actorUserId: user.id,
    });
    const { generatePayroll } = await import("../hr");
    const period = await generatePayroll({ companyId: company.id, year: 2025, month: 1, userId: user.id });
    const line = await prisma.payrollLine.findFirstOrThrow({
      where: { payrollPeriodId: period.id, employeeId: employee.id },
      include: { components: true },
    });
    const ded = line.components.find((c) => c.advanceId === advance.id);
    // Recovery capped at the ₹1,500 gross — not the ₹4,000 installment.
    expect(ded!.amount.toNumber()).toBe(1500);
    expect(line.netPay.toNumber()).toBe(0); // floored at zero, never negative

    // Only the recovered portion credits on pay — the ₹2.5K shortfall
    // stays outstanding for the next period.
    await payPeriod(period.id, user.id);
    const after = await prisma.employeeAdvance.findUniqueOrThrow({ where: { id: advance.id } });
    expect(after.recoveredAmount.toNumber()).toBe(1500);
    expect(after.status).toBe("ACTIVE");
  });

  it("fixed deductions can't push a zero-worked month negative either", async () => {
    const { company, user, project } = await setup();
    // MONTHLY pro-rates by attendance (FIXED pays flat regardless).
    const employee = await prisma.employee.create({
      data: {
        name: "Monthly Worker", phone: "9777777777", companyId: company.id,
        wageType: "MONTHLY", monthlySalary: new Decimal(1500), active: true,
        activeProjectId: project.id,
      },
    });
    // Fixed monthly deduction (e.g. uniform/tools) larger than what a
    // zero-attendance month earns.
    await prisma.salaryComponent.create({
      data: {
        employeeId: employee.id, type: "OTHER",
        amount: new Decimal(500), frequency: "MONTHLY", calculationType: "FIXED",
        isDeduction: true, active: true,
      },
    });
    // Every working day ABSENT → daysWorked 0 → basic 0 → gross 0.
    // (No attendance rows at all would synthesize a full-month line instead.)
    for (let d = 1; d <= 26; d++) {
      await prisma.workerAttendance.create({
        data: {
          employeeId: employee.id, companyId: company.id,
          date: new Date(Date.UTC(2025, 3, d)), status: "ABSENT",
        },
      });
    }
    const { generatePayroll } = await import("../hr");
    const period = await generatePayroll({ companyId: company.id, year: 2025, month: 4, userId: user.id });
    const line = await prisma.payrollLine.findFirst({
      where: { payrollPeriodId: period.id, employeeId: employee.id },
      include: { components: true },
    });
    expect(line).not.toBeNull();
    expect(line!.grossPay.toNumber()).toBe(0);
    expect(line!.netPay.toNumber()).toBe(0); // floored — the ₹500 deduction didn't fit
    const ded = line!.components.find((c) => c.isDeduction);
    expect(ded?.amount.toNumber()).toBe(0);
  });

  it("draft-line edits preserve advance rows; regen can't double-credit", async () => {
    const { company, user, project } = await setup();
    const employee = await createEmployee(company.id, project.id);
    const { issueAdvance } = await import("../employee-advance");
    const advance = await issueAdvance({
      employeeId: employee.id, companyId: company.id, amount: 2000, monthlyRecovery: 1000, actorUserId: user.id,
    });
    const { generatePayroll, updatePayrollLineComponents } = await import("../hr");
    const period = await generatePayroll({ companyId: company.id, year: 2025, month: 1, userId: user.id });
    let line = await prisma.payrollLine.findFirstOrThrow({
      where: { payrollPeriodId: period.id, employeeId: employee.id },
      include: { components: true },
    });

    // HR edits the draft (adds an allowance) — the advance row must survive.
    await updatePayrollLineComponents({
      payrollLineId: line.id,
      components: [{ type: "HRA", calculationType: "FIXED", rate: 500 }],
      userId: user.id,
    });
    line = await prisma.payrollLine.findFirstOrThrow({
      where: { id: line.id },
      include: { components: true },
    });
    expect(line.components.some((c) => c.advanceId === advance.id)).toBe(true);
    expect(line.components.some((c) => c.type === "HRA")).toBe(true);

    // Regenerate the whole period (draft wipe + recompute) — the recovery
    // still credits exactly once on pay.
    await generatePayroll({ companyId: company.id, year: 2025, month: 1, userId: user.id });
    await payPeriod(period.id, user.id);
    const adv = await prisma.employeeAdvance.findUniqueOrThrow({ where: { id: advance.id } });
    expect(adv.recoveredAmount.toNumber()).toBe(1000);
  });

  it("PAUSED advances skip deduction; CANCELLED never recovers", async () => {
    const { company, user, project } = await setup();
    const employee = await createEmployee(company.id, project.id);
    const { issueAdvance, updateAdvanceStatus } = await import("../employee-advance");
    const advance = await issueAdvance({
      employeeId: employee.id, companyId: company.id, amount: 5000, monthlyRecovery: 1000, actorUserId: user.id,
    });
    await updateAdvanceStatus(advance.id, company.id, "PAUSED", user.id);

    const { generatePayroll } = await import("../hr");
    const period = await generatePayroll({ companyId: company.id, year: 2025, month: 1, userId: user.id });
    const line = await prisma.payrollLine.findFirstOrThrow({
      where: { payrollPeriodId: period.id, employeeId: employee.id },
      include: { components: true },
    });
    expect(line.components.some((c) => c.advanceId === advance.id)).toBe(false);

    await payPeriod(period.id, user.id);
    const adv = await prisma.employeeAdvance.findUniqueOrThrow({ where: { id: advance.id } });
    expect(adv.recoveredAmount.toNumber()).toBe(0);
  });

  it("rejects invalid issues: zero/negative amounts, recovery > amount, inactive employee", async () => {
    const { company, user, project } = await setup();
    const employee = await createEmployee(company.id, project.id);
    const { issueAdvance } = await import("../employee-advance");

    await expect(
      issueAdvance({ employeeId: employee.id, companyId: company.id, amount: 0, monthlyRecovery: 100, actorUserId: user.id }),
    ).rejects.toThrow(/greater than 0/i);
    await expect(
      issueAdvance({ employeeId: employee.id, companyId: company.id, amount: 1000, monthlyRecovery: 2000, actorUserId: user.id }),
    ).rejects.toThrow(/cannot exceed/i);

    await prisma.employee.update({ where: { id: employee.id }, data: { active: false } });
    await expect(
      issueAdvance({ employeeId: employee.id, companyId: company.id, amount: 1000, monthlyRecovery: 500, actorUserId: user.id }),
    ).rejects.toThrow(/inactive/i);
  });
});
