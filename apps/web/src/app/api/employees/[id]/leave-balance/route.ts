import { NextRequest } from "next/server";
import { leaveBalance, effectiveLeaveEntitlement } from "@nirman/services";
import { prisma } from "@nirman/db";
import { apiHandler, json, requirePermission, getCompany, toNum } from "@/lib/server";
import { PERM } from "@/lib/roles";

/**
 * GET /api/employees/[id]/leave-balance — remaining paid-leave days this year
 * + the daily-wage basis, so a settler can price leave encashment without a
 * calculator. HR_VIEW-gated; wage is included only for payroll-tier callers.
 */
export const GET = apiHandler(async (_req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  await requirePermission(PERM.HR_VIEW);
  const { id } = await params;
  const company = await getCompany();

  const employee = await prisma.employee.findFirst({
    where: { id, companyId: company.id },
    select: { id: true, paidLeaveQuota: true, dailyRate: true, monthlySalary: true, wageType: true },
  });
  if (!employee) return json({ error: "Not found" }, { status: 404 });

  const year = new Date().getUTCFullYear();
  const used = leaveBalance ? await leaveBalance(id, year) : {};
  // Encashment applies to PAID leave — total used across non-UNPAID types.
  const usedPaid = Object.entries(used).reduce((s, [t, d]) => (t === "UNPAID" ? s : s + d), 0);
  const entitlement = employee.paidLeaveQuota != null ? employee.paidLeaveQuota : effectiveLeaveEntitlement("CASUAL", null);
  const remainingDays = Math.max(0, entitlement - usedPaid);

  // Daily wage: DAILY wageType pays per day directly; MONTHLY divides by 26
  // working days (Payment of Wages convention).
  const dailyWage = employee.wageType === "DAILY"
    ? toNum(employee.dailyRate)
    : employee.monthlySalary != null ? toNum(employee.monthlySalary) / 26 : 0;

  return json({
    year,
    entitlement,
    usedPaidDays: usedPaid,
    remainingDays,
    dailyWage: Math.round(dailyWage * 100) / 100,
    suggestedEncashment: Math.round(remainingDays * dailyWage * 100) / 100,
  });
});
