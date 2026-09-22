import { NextRequest } from "next/server";
import { revalidatePath } from "next/cache";
import { prisma } from "@nirman/db";
import type { PayrollStatus } from "@nirman/db";
import { generatePayroll } from "@nirman/services";
import { apiHandler, getCompany, json, generatePayrollSchema, requirePermission, toNum, getUserScope } from "@/lib/server";
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
    take: 120,
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

  // Payroll generation is a company-wide action — it iterates every active
  // employee and REGENERATES all draft lines (deleteMany + recompute). A
  // department/project-scoped payroll holder would wipe lines they can't
  // even see, so generation is restricted to company-scoped actors.
  // Scoped holders keep payroll.manage for viewing/editing their own lines.
  const scope = await getUserScope();
  if (scope.scopeType !== "COMPANY") {
    return json(
      { error: "Payroll runs company-wide — it must be run by someone with company-wide access." },
      { status: 403 },
    );
  }

  const body = await req.json();
  const parsed = generatePayrollSchema.safeParse(body);
  if (!parsed.success) {
    return json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  }
  // Regenerating a DRAFT period wipes all its lines — including manual
  // edits (unit-rate quantities, ad-hoc deductions). If one exists with
  // lines, require an explicit confirmation so the wipe can't happen
  // silently from a tap-happy re-generate.
  if (parsed.data.confirm !== true) {
    const existingDraft = await prisma.payrollPeriod.findFirst({
      where: {
        companyId: company.id,
        year: parsed.data.year,
        month: parsed.data.month,
        status: "DRAFT",
        lines: { some: {} },
      },
      select: { _count: { select: { lines: true } } },
    });
    if (existingDraft) {
      return json(
        {
          requiresConfirm: true,
          lineCount: existingDraft._count.lines,
          error: `A draft payroll for this month exists with ${existingDraft._count.lines} lines — regenerating will overwrite manual edits. Confirm to continue.`,
        },
        { status: 409 },
      );
    }
  }

  try {
    const period = await generatePayroll({
      companyId: company.id,
      month: parsed.data.month,
      year: parsed.data.year,
      userId: user.id,
    });
    revalidatePath("/hr/payroll");
    revalidatePath("/m/hr");
    return json({ ok: true, id: period?.id }, { status: 201 });
  } catch (err: unknown) {
    return json({ error: (err instanceof Error ? err.message : "Failed to generate payroll") }, { status: 400 });
  }
});
