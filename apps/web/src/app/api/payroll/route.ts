import { NextRequest } from "next/server";
import { prisma } from "@nirman/db";
import type { PayrollStatus } from "@nirman/db";
import { generatePayroll } from "@nirman/services";
import { apiHandler, getCompany, json, generatePayrollSchema, requirePermission, toNum } from "@/lib/server";
import { PERM } from "@/lib/roles";

export const GET = apiHandler(async (req: NextRequest) => {
  await requirePermission(PERM.PAYROLL_VIEW);
  const company = await getCompany();
  const url = new URL(req.url);
  const status = url.searchParams.get("status");
  const year = url.searchParams.get("year");

  const periods = await prisma.payrollPeriod.findMany({
    where: {
      companyId: company.id,
      ...(status ? { status: { in: status.split(",") as PayrollStatus[] } } : {}),
      ...(year ? { year: parseInt(year) } : {}),
    },
    orderBy: [{ year: "desc" }, { month: "desc" }],
    include: {
      _count: { select: { lines: true } },
      processedBy: { select: { name: true } },
    },
  });

  return json(
    periods.map((p) => ({
      id: p.id,
      month: p.month,
      year: p.year,
      startDate: p.startDate,
      endDate: p.endDate,
      status: p.status,
      totalGross: toNum(p.totalGross),
      totalOvertime: toNum(p.totalOvertime),
      totalDeductions: toNum(p.totalDeductions),
      totalNet: toNum(p.totalNet),
      employeeCount: p._count.lines,
      processedByName: p.processedBy?.name ?? null,
      processedAt: p.processedAt,
      paidAt: p.paidAt,
    })),
  );
});

export const POST = apiHandler(async (req: NextRequest) => {
  const user = await requirePermission(PERM.PAYROLL_MANAGE);
  const company = await getCompany();
  const body = await req.json();
  const parsed = generatePayrollSchema.safeParse(body);
  if (!parsed.success) {
    return json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  }
  try {
    const period = await generatePayroll({
      companyId: company.id,
      month: parsed.data.month,
      year: parsed.data.year,
      userId: user.id,
    });
    return json({ ok: true, id: period?.id }, { status: 201 });
  } catch (err: unknown) {
    return json({ error: (err instanceof Error ? err.message : "Failed to generate payroll") }, { status: 400 });
  }
});
