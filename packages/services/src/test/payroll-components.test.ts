/**
 * Integration tests for itemized payroll line components:
 *   - generatePayroll auto-creates PayrollLineComponent rows from the
 *     employee's salary structure (fixed, %-of-basic, unit-rate)
 *   - UNIT_RATE + DAY auto-fills qty from attendance; other units start at 0
 *   - updatePayrollLineComponents recomputes buckets + net on the draft
 *   - BASIC is skipped (already in basicAmount); non-MONTHLY not auto-included
 */

import { describe, it, expect, beforeEach } from "vitest";
import { prisma } from "@nirman/db";
import Decimal from "decimal.js";
import { resetDb, createTestFixture, seedTestAccounts } from "./setup";

describe("Payroll line components — itemized breakdown", () => {
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
        name: "Comp Worker",
        phone: "9999999999",
        companyId,
        wageType: "FIXED",
        monthlySalary: new Decimal(salary),
        active: true,
        activeProjectId: projectId,
      },
    });
  }

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

  it("generatePayroll creates itemized component rows and feeds line buckets", async () => {
    const { company, user, project } = await setup();
    const employee = await createEmployee(company.id, project.id, 30000);
    await createAttendance(employee.id, company.id, "2025-01-15");

    // BASIC (skipped — in basicAmount), fixed HRA, %-DA, employee PF, km TA
    await prisma.salaryComponent.createMany({
      data: [
        { employeeId: employee.id, type: "BASIC", amount: new Decimal(30000), frequency: "MONTHLY" },
        { employeeId: employee.id, type: "HRA", amount: new Decimal(5000), frequency: "MONTHLY" },
        {
          employeeId: employee.id, type: "DA", amount: new Decimal(0), frequency: "MONTHLY",
          isPercentage: true, percentageOfBasic: new Decimal(10),
          calculationType: "PERCENTAGE_OF_BASIC",
        },
        { employeeId: employee.id, type: "EMPLOYEE_PF", amount: new Decimal(1800), frequency: "MONTHLY", isDeduction: true },
        {
          employeeId: employee.id, type: "TA", amount: new Decimal(3), frequency: "MONTHLY",
          calculationType: "UNIT_RATE", unitType: "KM",
        },
        {
          employeeId: employee.id, type: "FOOD_ALLOWANCE", amount: new Decimal(150), frequency: "MONTHLY",
          calculationType: "UNIT_RATE", unitType: "DAY",
        },
        // YEARLY — not auto-included in a monthly run
        { employeeId: employee.id, type: "LTA", amount: new Decimal(12000), frequency: "YEARLY" },
      ],
    });

    const { generatePayroll } = await import("../hr");
    const period = await generatePayroll({
      companyId: company.id, year: 2025, month: 1, userId: user.id,
    });

    const line = await prisma.payrollLine.findFirstOrThrow({
      where: { payrollPeriodId: period.id },
      include: { components: true },
    });

    // BASIC must not appear as a component row (would double-pay)
    expect(line.components.some((c) => c.type === "BASIC")).toBe(false);
    // YEARLY LTA must not be auto-included
    expect(line.components.some((c) => c.type === "LTA")).toBe(false);

    const hra = line.components.find((c) => c.type === "HRA")!;
    expect(hra.bucket).toBe("ALLOWANCE");
    expect(hra.amount.toNumber()).toBe(5000);

    // DA = 10% of basicAmount (30000) = 3000
    const da = line.components.find((c) => c.type === "DA")!;
    expect(da.calculationType).toBe("PERCENTAGE_OF_BASIC");
    expect(da.amount.toNumber()).toBe(3000);

    // TA ₹3/km — qty starts at 0 awaiting manual entry
    const ta = line.components.find((c) => c.type === "TA")!;
    expect(ta.calculationType).toBe("UNIT_RATE");
    expect(ta.quantity?.toNumber()).toBe(0);
    expect(ta.amount.toNumber()).toBe(0);

    // Food ₹150/day — qty auto-fills from daysWorked (1 day attended)
    const food = line.components.find((c) => c.type === "FOOD_ALLOWANCE")!;
    expect(food.calculationType).toBe("UNIT_RATE");
    expect(food.quantity?.toNumber()).toBe(1);
    expect(food.amount.toNumber()).toBe(150);

    const pf = line.components.find((c) => c.type === "EMPLOYEE_PF")!;
    expect(pf.bucket).toBe("PF");
    expect(pf.isDeduction).toBe(true);

    // Buckets roll into line fields
    expect(line.allowance.toNumber()).toBe(8150); // 5000 + 3000 + 0 + 150
    expect(line.pf.toNumber()).toBe(1800);
    expect(line.grossPay.toNumber()).toBe(38150); // 30000 + 8150
    expect(line.netPay.toNumber()).toBe(36350);   // 38150 − 1800
  });

  it("updatePayrollLineComponents recomputes buckets when qty is entered", async () => {
    const { company, user, project } = await setup();
    const employee = await createEmployee(company.id, project.id, 30000);
    await createAttendance(employee.id, company.id, "2025-01-15");
    await prisma.salaryComponent.create({
      data: {
        employeeId: employee.id, type: "TA", amount: new Decimal(3),
        frequency: "MONTHLY", calculationType: "UNIT_RATE", unitType: "KM",
      },
    });

    const { generatePayroll, updatePayrollLineComponents } = await import("../hr");
    const period = await generatePayroll({
      companyId: company.id, year: 2025, month: 1, userId: user.id,
    });
    const line = await prisma.payrollLine.findFirstOrThrow({
      where: { payrollPeriodId: period.id },
      include: { components: true },
    });
    expect(line.allowance.toNumber()).toBe(0);

    // HR enters 420 km travelled → ₹3 × 420 = ₹1,260
    const updated = await updatePayrollLineComponents({
      payrollLineId: line.id,
      userId: user.id,
      components: line.components.map((c) => ({
        type: c.type,
        label: c.label,
        calculationType: c.calculationType,
        unitType: c.unitType,
        rate: c.rate.toNumber(),
        quantity: 420,
        isDeduction: c.isDeduction,
      })),
    });

    expect(updated.allowance.toNumber()).toBe(1260);
    expect(updated.grossPay.toNumber()).toBe(31260);
    expect(updated.netPay.toNumber()).toBe(31260);

    const comps = await prisma.payrollLineComponent.findMany({ where: { payrollLineId: line.id } });
    expect(comps[0]!.quantity?.toNumber()).toBe(420);
    expect(comps[0]!.amount.toNumber()).toBe(1260);

    // Period totals recompute
    const updatedPeriod = await prisma.payrollPeriod.findUniqueOrThrow({ where: { id: period.id } });
    expect(updatedPeriod.totalNet.toNumber()).toBe(31260);
  });

  it("updatePayrollLineComponents supports ad-hoc rows and rejects processed lines", async () => {
    const { company, user, project } = await setup();
    const employee = await createEmployee(company.id, project.id, 30000);
    await createAttendance(employee.id, company.id, "2025-01-15");

    const { generatePayroll, updatePayrollLineComponents } = await import("../hr");
    const period = await generatePayroll({
      companyId: company.id, year: 2025, month: 1, userId: user.id,
    });
    const line = await prisma.payrollLine.findFirstOrThrow({
      where: { payrollPeriodId: period.id },
    });

    // Ad-hoc earning + ad-hoc deduction
    const updated = await updatePayrollLineComponents({
      payrollLineId: line.id,
      userId: user.id,
      components: [
        { type: "OTHER", label: "Site allowance", rate: 2000 },
        { type: "OTHER", label: "Advance recovery", rate: 500, isDeduction: true },
      ],
    });
    expect(updated.allowance.toNumber()).toBe(2000);
    expect(updated.deductions.toNumber()).toBe(500);
    expect(updated.netPay.toNumber()).toBe(31500);

    // Process the payroll — line is now locked
    const { processPayroll } = await import("../hr");
    await processPayroll({ payrollPeriodId: period.id, userId: user.id, companyId: company.id });
    await expect(
      updatePayrollLineComponents({ payrollLineId: line.id, components: [], userId: user.id }),
    ).rejects.toThrow(/processed/i);
  });
});
