import { prisma } from "@nirman/db";
import { toNum, scopeWhere } from "@/lib/server";

/**
 * Monthly labour cost — one computation, two consumers (desktop /hr and
 * mobile /m/hr). Daily-rate workers count as ~26 working days; monthly staff
 * count at salary. If a payroll exists for the CURRENT month, its net total
 * wins (real processed cost beats the estimate).
 *
 * Visibility: this is comp data — callers must only compute/render it for
 * getEmployeeAccessScope().canSeePayroll viewers (payroll.view |
 * payroll.manage | hr.manage).
 */

export interface LabourCostEmployee {
  wageType: string | null;
  dailyRate: unknown;
  monthlySalary: unknown;
}

export interface LabourCostPayroll {
  totalNet: unknown;
  month: number;
  year: number;
}

export function labourCostFrom(
  employees: LabourCostEmployee[],
  latestPayroll: LabourCostPayroll | null,
  today = new Date(),
): number {
  let total = 0;
  for (const e of employees) {
    total += e.wageType === "DAILY" ? toNum(e.dailyRate) * 26 : toNum(e.monthlySalary);
  }
  if (
    latestPayroll &&
    latestPayroll.month === today.getMonth() + 1 &&
    latestPayroll.year === today.getFullYear()
  ) {
    total = toNum(latestPayroll.totalNet);
  }
  return total;
}

/**
 * Fetch + compute — for pages that don't already load the employee wage set.
 * Applies scopeWhere so project/department-scoped viewers see their scope's
 * labour cost, same as the desktop hub.
 */
export async function fetchMonthlyLabourCost(companyId: string): Promise<number> {
  const [employees, latestPayroll] = await Promise.all([
    prisma.employee
      .findMany({
        take: 200,
        where: { companyId, deletedAt: null, active: true, ...await scopeWhere("Employee") },
        select: { wageType: true, dailyRate: true, monthlySalary: true },
      })
      .catch(() => []),
    prisma.payrollPeriod
      .findFirst({
        where: { companyId },
        orderBy: [{ year: "desc" }, { month: "desc" }],
        select: { month: true, year: true, totalNet: true },
      })
      .catch(() => null),
  ]);
  return labourCostFrom(employees, latestPayroll);
}
