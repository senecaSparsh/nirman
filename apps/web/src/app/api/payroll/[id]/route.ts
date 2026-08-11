import { NextRequest } from "next/server";
import { prisma } from "@nirman/db";
import { processPayroll, payPayroll } from "@nirman/services";
import { apiHandler, getCompany, json, requirePermission, toNum } from "@/lib/server";
import { PERM } from "@/lib/roles";

export const GET = apiHandler(async (_req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  await requirePermission(PERM.PAYROLL_VIEW);
  const company = await getCompany();
  const { id } = await params;
  const period = await prisma.payrollPeriod.findFirst({
    where: { id, companyId: company.id },
    include: {
      lines: {
        include: { employee: { select: { id: true, name: true, trade: true, wageType: true, designation: true } } },
        orderBy: { employee: { name: "asc" } },
      },
      processedBy: { select: { name: true } },
    },
  });
  if (!period) return json({ error: "Payroll period not found" }, { status: 404 });
  return json({
    id: period.id,
    month: period.month,
    year: period.year,
    startDate: period.startDate,
    endDate: period.endDate,
    status: period.status,
    totalGross: toNum(period.totalGross),
    totalOvertime: toNum(period.totalOvertime),
    totalDeductions: toNum(period.totalDeductions),
    totalNet: toNum(period.totalNet),
    processedByName: period.processedBy?.name ?? null,
    processedAt: period.processedAt,
    paidAt: period.paidAt,
    notes: period.notes,
    lines: period.lines.map((l) => ({
      id: l.id,
      employeeId: l.employeeId,
      employeeName: l.employee.name,
      trade: l.employee.trade,
      wageType: l.employee.wageType,
      designation: l.employee.designation,
      daysWorked: toNum(l.daysWorked),
      basicAmount: toNum(l.basicAmount),
      overtimeAmount: toNum(l.overtimeAmount),
      allowance: toNum(l.allowance),
      bonus: toNum(l.bonus),
      pf: toNum(l.pf),
      employerPf: toNum(l.employerPf),
      esi: toNum(l.esi),
      professionTax: toNum(l.professionTax),
      tax: toNum(l.tax),
      deductions: toNum(l.deductions),
      grossPay: toNum(l.grossPay),
      totalDeductions: toNum(l.totalDeductions),
      netPay: toNum(l.netPay),
    })),
  });
});

export const PATCH = apiHandler(async (req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  const { id } = await params;
  const body = await req.json();
  const action = body.action;

  if (action === "process") {
    const user = await requirePermission(PERM.PAYROLL_MANAGE);
    try {
      await processPayroll({ payrollPeriodId: id, userId: user.id });
      return json({ ok: true });
    } catch (err: unknown) {
      return json({ error: (err instanceof Error ? err.message : "Failed to process payroll") }, { status: 400 });
    }
  }

  if (action === "pay") {
    const user = await requirePermission(PERM.PAYROLL_MANAGE);
    try {
      await payPayroll({ payrollPeriodId: id, userId: user.id });
      return json({ ok: true });
    } catch (err: unknown) {
      return json({ error: (err instanceof Error ? err.message : "Failed to settle payroll") }, { status: 400 });
    }
  }

  return json({ error: "Unknown action. Use 'process' or 'pay'." }, { status: 400 });
});
