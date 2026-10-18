/**
 * Late-attendance cut (owner policy: 4 LATE days = half a day's pay) and the
 * per-row rate snapshot must not interact: the cut comes off the earned wage
 * exactly once, and a mid-period rate change never re-prices days already worked.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { prisma } from "@nirman/db";
import Decimal from "decimal.js";
import { resetDb, createTestFixture, seedTestAccounts } from "./setup";

describe("Payroll — late-attendance cut and rate snapshot", () => {
  beforeEach(async () => {
    await resetDb();
  });

  async function setup() {
    const fixture = await createTestFixture();
    await seedTestAccounts(fixture.company.id);
    return fixture;
  }

  async function createDailyEmployee(companyId: string, projectId: string, rate: number) {
    return prisma.employee.create({
      data: {
        name: "Daily Worker",
        companyId,
        wageType: "DAILY",
        dailyRate: new Decimal(rate),
        active: true,
        activeProjectId: projectId,
      },
    });
  }

  async function mark(
    employeeId: string,
    companyId: string,
    date: string,
    status: "PRESENT" | "LATE",
    dailyRate?: number,
  ) {
    return prisma.workerAttendance.create({
      data: {
        employeeId,
        companyId,
        date: new Date(date),
        status,
        hoursWorked: new Decimal(8),
        dailyRate: dailyRate == null ? null : new Decimal(dailyRate),
      },
    });
  }

  it("4 late days cut half a day's pay from the earned basic, exactly once", async () => {
    const { company, user, project } = await setup();
    const employee = await createDailyEmployee(company.id, project.id, 500);
    for (const d of ["2025-03-03", "2025-03-04", "2025-03-05", "2025-03-06"]) {
      await mark(employee.id, company.id, d, "PRESENT");
    }
    for (const d of ["2025-03-07", "2025-03-10", "2025-03-11", "2025-03-12"]) {
      await mark(employee.id, company.id, d, "LATE");
    }

    const { generatePayroll } = await import("../hr");
    const period = await generatePayroll({ companyId: company.id, year: 2025, month: 3, userId: user.id });

    // 8 days × ₹500 = ₹4,000, less half a day (₹250) for the four lates.
    expect(period.totalGross.toNumber()).toBe(3750);
    expect(period.totalNet.toNumber()).toBe(3750);
  });

  it("a mid-period rate cut does not re-price days already worked", async () => {
    const { company, user, project } = await setup();
    const employee = await createDailyEmployee(company.id, project.id, 800);
    // Three days worked while the rate was ₹1,000 — each row snapshots that rate.
    for (const d of ["2025-04-07", "2025-04-08", "2025-04-09"]) {
      await mark(employee.id, company.id, d, "PRESENT", 1000);
    }

    const { generatePayroll } = await import("../hr");
    const period = await generatePayroll({ companyId: company.id, year: 2025, month: 4, userId: user.id });

    expect(period.totalGross.toNumber()).toBe(3000);
    expect(period.totalNet.toNumber()).toBe(3000);
    const lines = await prisma.payrollLine.findMany({
      where: { payrollPeriodId: period.id },
      include: { components: true },
    });
    expect(lines).toHaveLength(1);
    expect(lines[0]!.components.filter((c) => c.label === "Late attendance deduction")).toHaveLength(0);
  });
});
